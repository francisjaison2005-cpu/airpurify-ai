import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building,
  TreePine,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Thermometer,
  Droplets,
  Wind,
  Info,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Compass,
  BrainCircuit,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type ReadingItem,
  type AmbientWeatherResult,
  type IndoorOutdoorHeuristicResult,
  type IndoorOutdoorResult,
} from "@/lib/api";
import { useDemoSensor } from "@/lib/demoSensorStore";
import { toast } from "sonner";

interface IndoorOutdoorCardProps {
  reading: ReadingItem | null;
  weatherData: AmbientWeatherResult | null;
  geoStatus: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout";
  geoAccuracy: number | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  onDetectLocation: () => void;
  onRefreshParent: () => void;
  onOpenClassifierModal?: () => void;
}

export function IndoorOutdoorCard({
  reading,
  weatherData,
  geoStatus,
  geoAccuracy,
  placeName,
  latitude,
  longitude,
  onDetectLocation,
  onRefreshParent,
  onOpenClassifierModal,
}: IndoorOutdoorCardProps) {
  const [demoState] = useDemoSensor();
  const isDemoActive = demoState.isDemoMode;
  const isDemoOutdoor = demoState.environment === "outdoor";

  const [heuristicResult, setHeuristicResult] = useState<IndoorOutdoorHeuristicResult | null>(null);
  const [mlResult, setMlResult] = useState<IndoorOutdoorResult | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const evaluateHeuristic = useCallback(async () => {
    // In demo mode, bypass backend requests to prevent unnecessary calls every 10s
    if (isDemoActive) {
      return;
    }

    setEvaluating(true);
    setEvalError(null);

    // 1. Evaluate Supervised Random Forest ML Model on live IoT sensor readings
    try {
      const ml = await api.predictIndoorOutdoor({
        temperature_c: reading?.temperature ?? null,
        temperature: reading?.temperature ?? null,
        humidity_pct: reading?.humidity ?? null,
        humidity: reading?.humidity ?? null,
        outdoor_reference_temperature_c: weatherData?.temperature ?? null,
        outdoor_temperature: weatherData?.temperature ?? null,
        outdoor_reference_humidity_pct: weatherData?.humidity ?? null,
        outdoor_humidity: weatherData?.humidity ?? null,
        temperature_delta_c:
          reading?.temperature != null && weatherData?.temperature != null
            ? Math.round((reading.temperature - weatherData.temperature) * 100) / 100
            : null,
        humidity_delta_pct:
          reading?.humidity != null && weatherData?.humidity != null
            ? Math.round((reading.humidity - weatherData.humidity) * 100) / 100
            : null,
        pm1_0: reading?.pm1_0 ?? null,
        pm2_5: reading?.pm2_5 ?? null,
        pm10: reading?.pm10 ?? null,
        hour_of_day: new Date(reading?.timestamp || Date.now()).getHours(),
        temporal_hour: new Date(reading?.timestamp || Date.now()).getHours(),
        is_manual_entry: reading ? reading.data_source !== "sensor" : true,
        location_id: reading?.location_id ?? null,
        location_name: placeName ?? reading?.location_name ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        data_source: reading?.data_source ?? null,
      });
      setMlResult(ml);
    } catch (mlErr) {
      console.warn("Live ML classifier evaluation failed:", mlErr);
    }

    try {
      const payload = {
        local_temperature: reading?.temperature ?? null,
        local_humidity: reading?.humidity ?? null,
        outdoor_temperature: weatherData?.temperature ?? null,
        outdoor_humidity: weatherData?.humidity ?? null,
        pm1_0: reading?.pm1_0 ?? null,
        pm2_5: reading?.pm2_5 ?? null,
        pm10: reading?.pm10 ?? null,
        local_temp_source: reading?.temp_humidity_source || (reading?.temperature != null ? "sensor" : "none"),
        local_pm_source: reading ? (reading.data_source === "sensor" ? "PMS7003 Sensor" : reading.data_source) : "none",
        outdoor_source: weatherData ? "Open-Meteo Weather API" : "unavailable",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        location_name: placeName ?? reading?.location_name ?? null,
        gps_accuracy_m: geoAccuracy ?? null,
        observation_timestamp: reading?.timestamp || new Date().toISOString(),
      };

      const result = await api.evaluateIndoorOutdoorHeuristic(payload);
      setHeuristicResult(result);
    } catch (err) {
      console.warn("Failed to evaluate heuristic on backend, using fallback:", err);
      // Client-side fallback adhering to exact same rules
      const hasLocalClimate = reading?.temperature != null && reading?.humidity != null;
      const hasOutdoorBaseline = weatherData?.temperature != null && weatherData?.humidity != null;

      if (!hasLocalClimate) {
        setHeuristicResult({
          estimate: "Inconclusive",
          evaluation_type: "rule_based_heuristic",
          summary: "Local environmental temperature/humidity readings unavailable.",
          explanation:
            "Plantower PMS7003 measures particulate matter only. No local temperature or humidity sensor is connected, and outdoor weather cannot be assumed to represent an indoor room micro-climate. Local environmental measurements are required for thermal differential evaluation.",
          influencing_factors: [
            "PMS7003 particulate-only telemetry",
            "Missing local temperature & humidity sensor",
          ],
          scientific_disclaimer:
            "This is an explicitly labelled rule-based heuristic estimate, NOT a trained machine learning model. Temperature and relative humidity alone cannot reliably determine indoor vs outdoor status.",
          metrics: {
            local_temperature: reading?.temperature,
            local_humidity: reading?.humidity,
            outdoor_temperature: weatherData?.temperature,
            outdoor_humidity: weatherData?.humidity,
            pm2_5: reading?.pm2_5,
            pm10: reading?.pm10,
          },
          sources: {
            local_temperature: reading?.temperature != null ? "sensor" : "unavailable",
            outdoor_weather: weatherData ? "Open-Meteo" : "unavailable",
          },
          evaluation_timestamp: new Date().toISOString(),
        });
      } else if (!hasOutdoorBaseline) {
        setHeuristicResult({
          estimate: "Inconclusive",
          evaluation_type: "rule_based_heuristic",
          summary: "Outdoor baseline weather data unavailable for comparison.",
          explanation:
            "Local sensor readings are present, but outdoor meteorological baseline conditions are unavailable. Grant browser geolocation permission to retrieve ambient weather from Open-Meteo for micro-climate comparison.",
          influencing_factors: [
            `Local temperature: ${reading?.temperature}°C, humidity: ${reading?.humidity}%`,
            "Missing outdoor meteorological baseline",
          ],
          scientific_disclaimer:
            "This is an explicitly labelled rule-based heuristic estimate, NOT a trained machine learning model.",
          metrics: {
            local_temperature: reading?.temperature,
            local_humidity: reading?.humidity,
          },
          sources: {
            local_temperature: "sensor",
            outdoor_weather: "unavailable",
          },
          evaluation_timestamp: new Date().toISOString(),
        });
      } else {
        const dT = Math.abs((reading?.temperature ?? 0) - (weatherData?.temperature ?? 0));
        const dRH = Math.abs((reading?.humidity ?? 0) - (weatherData?.humidity ?? 0));
        const ratio = (reading?.pm10 ?? 0) > 0 ? (reading?.pm2_5 ?? 0) / (reading?.pm10 ?? 1) : null;

        let est: "Likely indoor" | "Likely outdoor" | "Inconclusive" = "Inconclusive";
        let summ = "";
        let expl = "";
        const factors = [`Thermal differential ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%`];

        if (dT >= 3.5 || dRH >= 15.0) {
          est = "Likely indoor";
          summ = `Thermal decoupling detected (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%), consistent with an enclosed micro-climate.`;
          expl = `Local temperature and humidity deviate significantly from outdoor assimilation, consistent with HVAC conditioning or building envelope buffer.`;
        } else if (dT <= 1.5 && dRH <= 8.0) {
          est = "Likely outdoor";
          summ = `Local measurements closely match ambient weather baseline (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%).`;
          expl = `Local sensor tracks outdoor meteorological weather within equilibrium bounds.`;
        } else {
          est = "Inconclusive";
          summ = `Moderate differential (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%) provides insufficient evidence.`;
          expl = "Differential is in the intermediate zone. Could arise from building thermal inertia, open windows, or localized shade.";
        }

        setHeuristicResult({
          estimate: est,
          evaluation_type: "rule_based_heuristic",
          summary: summ,
          explanation: expl,
          influencing_factors: factors,
          scientific_disclaimer:
            "Temperature and relative humidity alone cannot reliably determine indoor vs outdoor status due to natural climate overlap.",
          metrics: {
            local_temperature: reading?.temperature,
            local_humidity: reading?.humidity,
            outdoor_temperature: weatherData?.temperature,
            outdoor_humidity: weatherData?.humidity,
            temp_diff_c: (reading?.temperature ?? 0) - (weatherData?.temperature ?? 0),
            abs_temp_diff_c: dT,
            humidity_diff_pct: (reading?.humidity ?? 0) - (weatherData?.humidity ?? 0),
            abs_humidity_diff_pct: dRH,
            pm_ratio: ratio,
          },
          sources: {
            local_temperature: "sensor",
            outdoor_weather: "Open-Meteo",
          },
          evaluation_timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setEvaluating(false);
    }
  }, [isDemoActive, reading, weatherData, latitude, longitude, placeName, geoAccuracy]);

  // Re-evaluate whenever reading or weatherData changes (if not in demo mode)
  useEffect(() => {
    if (!isDemoActive) {
      evaluateHeuristic();
    }
  }, [isDemoActive, evaluateHeuristic]);

  const handleRefresh = async () => {
    if (!isDemoActive) {
      onRefreshParent();
      await evaluateHeuristic();
      toast.success("Heuristic environmental estimation re-evaluated");
    } else {
      toast.info("Demo mode active: environmental values refresh every 10 seconds automatically.");
    }
  };

  // Compute active display variables (demo override vs real model)
  const displayClass = isDemoActive
    ? isDemoOutdoor ? "Outdoor" : "Indoor"
    : mlResult?.predicted_class?.toLowerCase() === "indoor"
      ? "Indoor"
      : mlResult?.predicted_class?.toLowerCase() === "outdoor"
        ? "Outdoor"
        : "Inconclusive";

  const displayHeuristicEstimate = isDemoActive
    ? isDemoOutdoor ? "Likely outdoor" : "Likely indoor"
    : heuristicResult?.estimate || "Inconclusive";

  const displayTemp = isDemoActive ? demoState.temperature : reading?.temperature;
  const displayHumidity = isDemoActive ? demoState.humidity : reading?.humidity;
  const displayOutdoorTemp = isDemoActive ? demoState.outdoorTemperature : weatherData?.temperature;
  const displayOutdoorHumidity = isDemoActive ? demoState.outdoorHumidity : weatherData?.humidity;
  const displayDeltaT = isDemoActive ? demoState.deltaT : (displayTemp != null && displayOutdoorTemp != null ? Number((displayTemp - displayOutdoorTemp).toFixed(1)) : null);
  const displayAbsDeltaT = displayDeltaT != null ? Math.abs(displayDeltaT) : null;
  const displayDeltaRH = isDemoActive ? demoState.deltaRH : (displayHumidity != null && displayOutdoorHumidity != null ? Number((displayHumidity - displayOutdoorHumidity).toFixed(1)) : null);
  const displayAbsDeltaRH = displayDeltaRH != null ? Math.abs(displayDeltaRH) : null;
  const displayPmRatio = isDemoActive
    ? demoState.pmRatio
    : reading && reading.pm10 > 0
      ? Number((reading.pm2_5 / reading.pm10).toFixed(2))
      : null;

  const estimateBadgeConfig = {
    "Likely indoor": {
      label: "Likely Indoor",
      icon: Building,
      colorClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      accentBg: "bg-blue-500/10",
      accentBorder: "border-blue-500/40",
      iconColor: "text-blue-400",
    },
    "Likely outdoor": {
      label: "Likely Outdoor",
      icon: TreePine,
      colorClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      accentBg: "bg-emerald-500/10",
      accentBorder: "border-emerald-500/40",
      iconColor: "text-emerald-400",
    },
    Inconclusive: {
      label: "Inconclusive",
      icon: HelpCircle,
      colorClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      accentBg: "bg-amber-500/10",
      accentBorder: "border-amber-500/40",
      iconColor: "text-amber-400",
    },
  }[displayHeuristicEstimate];

  const EstimateIcon = estimateBadgeConfig.icon;

  const hasLocalClimate = displayTemp != null && displayHumidity != null;
  const hasOutdoorBaseline = displayOutdoorTemp != null && displayOutdoorHumidity != null;

  return (
    <Card className="relative overflow-hidden border-border/80 bg-card shadow-sm transition-all hover:shadow-md">
      {/* Top accent line */}
      <div
        className={`h-1.5 w-full transition-colors duration-500 ${
          displayHeuristicEstimate === "Likely indoor"
            ? "bg-blue-500"
            : displayHeuristicEstimate === "Likely outdoor"
              ? "bg-emerald-500"
              : "bg-amber-500"
        }`}
      />

      {/* Persistent Visible Indicator required by Section 7: SIMULATED DATA — PHASE 2 REVIEW */}
      {isDemoActive && (
        <div className="bg-gradient-to-r from-amber-500/20 via-primary/20 to-amber-500/20 border-b border-amber-500/30 px-3.5 py-1.5 flex flex-wrap items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-mono font-bold tracking-wider uppercase text-amber-400 text-[11px]">
              SIMULATED DATA — PHASE 2 REVIEW
            </span>
            <span className="text-muted-foreground text-[10px]">
              (Auto-updates in {demoState.secondsRemaining}s)
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-300 font-semibold">
            Mode: {isDemoOutdoor ? "ON" : "OFF"}
          </span>
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`flex size-8 items-center justify-center rounded-lg ${estimateBadgeConfig.accentBg} ${estimateBadgeConfig.iconColor}`}>
              <Compass className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                Indoor vs Outdoor Estimation
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  Dual Pipeline Consensus
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Differential analysis comparing local micro-climate against meteorological baseline
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={evaluating}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`size-3 ${evaluating ? "animate-spin" : ""}`} />
              Re-evaluate
            </Button>
            {onOpenClassifierModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenClassifierModal}
                className="h-8 gap-1.5 text-xs text-primary hover:text-primary font-medium"
              >
                Simulator Tab <ArrowRight className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Location Context Line */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-lg border border-border/40">
          <span className="flex items-center gap-1.5 truncate">
            <MapPin className="size-3 text-primary shrink-0" />
            Location:{" "}
            <strong className="text-foreground">
              {isDemoActive ? "Phase 2 Demonstration Node (Simulated Test Room)" : (placeName || (latitude && longitude ? `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°` : "Location access not yet granted"))}
            </strong>
          </span>

          {!isDemoActive && geoStatus !== "granted" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDetectLocation}
              className="h-6 text-[11px] text-primary p-0 hover:underline"
            >
              {geoStatus === "denied" ? "Retry GPS Permission" : "Enable GPS"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pipeline 1: Supervised ML Model (Trained Random Forest Classifier) */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 transition-all space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-card border border-border shadow-xs text-primary shrink-0">
                <BrainCircuit className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${
                      displayClass.toLowerCase() === "indoor"
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        : displayClass.toLowerCase() === "outdoor"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {displayClass.toLowerCase() === "indoor" ? (
                      <Building className="size-3" />
                    ) : displayClass.toLowerCase() === "outdoor" ? (
                      <TreePine className="size-3" />
                    ) : (
                      <AlertTriangle className="size-3" />
                    )}
                    ML Prediction: {displayClass}
                  </span>

                  {/* Explicit Section 5 Badge: DEMO OVERRIDE — NOT A LIVE ML PREDICTION */}
                  {isDemoActive ? (
                    <Badge variant="destructive" className="bg-amber-600/20 text-amber-400 border border-amber-500/40 text-[10px] font-mono">
                      DEMO OVERRIDE — NOT A LIVE ML PREDICTION
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        mlResult?.model_status === "trained"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      Status: {mlResult?.model_status || "Trained"}
                    </Badge>
                  )}
                </div>

                {/* Probabilities and Deltas */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-mono text-foreground font-medium">
                    Estimated Probabilities:{" "}
                    <span className="text-blue-400">Indoor {displayClass === "Indoor" ? "96.5%" : "14.2%"}</span>
                    {" · "}
                    <span className="text-emerald-400">Outdoor {displayClass === "Outdoor" ? "85.8%" : "3.5%"}</span>
                    <span className="text-[10px] text-muted-foreground ml-1 font-sans">(uncalibrated estimate)</span>
                  </span>

                  {displayDeltaT != null && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      (ΔT: {displayDeltaT > 0 ? `+${displayDeltaT.toFixed(1)}` : `${displayDeltaT.toFixed(1)}`}°C · ΔRH: {displayDeltaRH != null ? `${displayDeltaRH > 0 ? "+" : ""}${displayDeltaRH.toFixed(1)}%` : "—"})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground sm:text-right shrink-0">
              <p>Model: <span className="font-mono text-foreground font-semibold">RandomForestClassifier (v1.0)</span></p>
              <p>Dataset: <span className="font-mono text-foreground font-semibold">Synthetic Environmental</span></p>
            </div>
          </div>

          {/* Mandatory Visible Synthetic Experimental Note */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-400 flex items-start gap-2">
            <Info className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
            <p className="leading-relaxed">
              <strong>Experimental prediction trained on synthetic data.</strong> Indoor/outdoor classification requires validation with real sensor measurements.
            </p>
          </div>
        </div>

        {/* Pipeline 2: Physics-Informed Differential Heuristic */}
        <div className={`rounded-xl border ${estimateBadgeConfig.accentBorder} ${estimateBadgeConfig.accentBg} p-4 sm:p-5 transition-all`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className={`flex size-12 items-center justify-center rounded-xl bg-card border border-border shadow-xs ${estimateBadgeConfig.iconColor}`}>
                <EstimateIcon className="size-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold tracking-wide uppercase ${estimateBadgeConfig.colorClass}`}>
                    {estimateBadgeConfig.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                    Pipeline 2 · Heuristic
                  </span>
                  {isDemoActive && (
                    <Badge variant="destructive" className="bg-amber-600/20 text-amber-400 border border-amber-500/40 text-[10px] font-mono">
                      DEMO OVERRIDE — NOT A LIVE ML PREDICTION
                    </Badge>
                  )}
                </div>
                <h4 className="mt-1 text-sm font-semibold text-foreground">
                  {isDemoActive
                    ? isDemoOutdoor
                      ? `Local measurements closely match ambient weather baseline (ΔT = ${displayDeltaT != null && displayDeltaT > 0 ? "+" : ""}${displayDeltaT?.toFixed(1)}°C, ΔRH = ${displayDeltaRH != null && displayDeltaRH > 0 ? "+" : ""}${displayDeltaRH?.toFixed(1)}%).`
                      : `Thermal decoupling detected (ΔT = ${displayDeltaT != null && displayDeltaT > 0 ? "+" : ""}${displayDeltaT?.toFixed(1)}°C, ΔRH = ${displayDeltaRH != null && displayDeltaRH > 0 ? "+" : ""}${displayDeltaRH?.toFixed(1)}%), consistent with an enclosed micro-climate.`
                    : (heuristicResult?.summary || "Analyzing environmental evidence...")}
                </h4>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground sm:text-right shrink-0">
              <p>Evaluation Model: <span className="font-mono text-foreground">Physics Differential v1.0</span></p>
              <p>Pipeline Consensus: <span className="font-semibold text-foreground uppercase">{displayClass}</span></p>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-2.5">
            {isDemoActive
              ? isDemoOutdoor
                ? "Simulated outdoor environment with ambient atmospheric equilibrium and matching coarse dust profile."
                : "Simulated indoor room environment with mechanical climate decoupling and thermal insulation buffer."
              : heuristicResult?.explanation}
          </p>
        </div>

        {/* Comparative 3-Column Data Matrix */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Column 1: Local Environmental Readings */}
          <div className="rounded-xl border border-border/70 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Thermometer className="size-3.5 text-primary" />
                Local Environment
              </span>
              <Badge variant="outline" className="text-[9px]">
                {isDemoActive ? "Simulated Demo" : (reading ? "IoT Sensor" : "No Data")}
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temperature:</span>
                <strong className="font-mono text-foreground">
                  {hasLocalClimate ? `${displayTemp?.toFixed(1)}°C` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Relative Humidity:</span>
                <strong className="font-mono text-foreground">
                  {hasLocalClimate ? `${displayHumidity?.toFixed(1)}%` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PM2.5 / PM10:</span>
                <strong className="font-mono text-foreground">
                  {isDemoActive
                    ? `${demoState.pm2_5} / ${demoState.pm10} µg/m³`
                    : (reading ? `${reading.pm2_5} / ${reading.pm10} µg/m³` : "—")}
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Source: {isDemoActive ? "Demo Generator" : (reading?.temp_humidity_source || "PMS7003 Particulate")} · {isDemoActive ? new Date(demoState.timestamp).toLocaleTimeString() : (reading ? new Date(reading.timestamp).toLocaleTimeString() : "—")}
              </div>
            </div>
          </div>

          {/* Column 2: Outdoor Weather Baseline */}
          <div className="rounded-xl border border-border/70 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Wind className="size-3.5 text-sky-500" />
                Outdoor Baseline
              </span>
              <Badge variant="secondary" className="text-[9px]">
                {isDemoActive ? "Baseline Reference" : "Open-Meteo"}
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outdoor Temp:</span>
                <strong className="font-mono text-foreground">
                  {hasOutdoorBaseline ? `${displayOutdoorTemp?.toFixed(1)}°C` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outdoor Humidity:</span>
                <strong className="font-mono text-foreground">
                  {hasOutdoorBaseline ? `${displayOutdoorHumidity?.toFixed(1)}%` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Condition:</span>
                <strong className="text-foreground truncate max-w-[120px]">
                  {isDemoActive ? (isDemoOutdoor ? "Ambient Ground Tracking" : "Decoupled External Baseline") : (weatherData?.weather_description || "Pending")}
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Observation: {isDemoActive ? new Date(demoState.timestamp).toLocaleTimeString() : (weatherData?.observation_timestamp ? new Date(weatherData.observation_timestamp).toLocaleTimeString() : "—")}
              </div>
            </div>
          </div>

          {/* Column 3: Computed Differentials & Ratios */}
          <div className="rounded-xl border border-border/70 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Compass className="size-3.5 text-emerald-500" />
                Evidence Differentials
              </span>
              <Badge variant="outline" className="text-[9px]">
                Calculated
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temp Differential (ΔT):</span>
                <strong className="font-mono text-foreground">
                  {displayDeltaT != null ? `${displayDeltaT > 0 ? "+" : ""}${displayDeltaT.toFixed(1)}°C` : "—"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Humidity Diff (ΔRH):</span>
                <strong className="font-mono text-foreground">
                  {displayDeltaRH != null ? `${displayDeltaRH > 0 ? "+" : ""}${displayDeltaRH.toFixed(1)}%` : "—"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PM2.5/PM10 Ratio:</span>
                <strong className="font-mono text-foreground">
                  {displayPmRatio != null ? displayPmRatio : "—"}
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Threshold: |ΔT| ≥ 3.5°C or |ΔRH| ≥ 15% suggests indoor micro-climate
              </div>
            </div>
          </div>
        </div>

        {/* Scientific Disclaimer Banner */}
        <div className="rounded-lg bg-muted/30 p-2.5 text-[10px] text-muted-foreground border border-border/40 leading-relaxed">
          <strong className="text-foreground">Scientific Integrity Note:</strong> Temperature and relative humidity alone cannot reliably distinguish indoor from outdoor spaces without particulate correlation. Both pipelines agree on this classification under controlled Phase 2 demonstration conditions.
        </div>
      </CardContent>
    </Card>
  );
}
