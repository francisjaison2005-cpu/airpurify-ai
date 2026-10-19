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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type ReadingItem,
  type AmbientWeatherResult,
  type IndoorOutdoorHeuristicResult,
} from "@/lib/api";
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
  const [heuristicResult, setHeuristicResult] = useState<IndoorOutdoorHeuristicResult | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const evaluateHeuristic = useCallback(async () => {
    setEvaluating(true);
    setEvalError(null);

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
          if (ratio !== null && ratio < 0.35 && (reading?.pm10 ?? 0) > 50) {
            est = "Inconclusive";
            summ = "Contradictory environmental signals: thermal decoupling conflicts with coarse dust particulate profile.";
            expl = "Local temperature/humidity differs substantially from outdoor baseline, but particulate readings show coarse dust typical of outdoor resuspension.";
          } else {
            est = "Likely indoor";
            summ = `Thermal decoupling detected (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%), consistent with an enclosed micro-climate.`;
            expl = `Local temperature and humidity deviate significantly from outdoor assimilation, consistent with HVAC conditioning or building envelope buffer.`;
          }
        } else if (dT <= 1.5 && dRH <= 8.0) {
          const isTemperate = (weatherData?.temperature ?? 0) >= 20.0 && (weatherData?.temperature ?? 0) <= 26.0;
          if (isTemperate && (ratio === null || ratio >= 0.4)) {
            est = "Inconclusive";
            summ = "Ambient weather overlaps with indoor comfort range; thermal tracking is insufficient to prove outdoor location.";
            expl = "Local readings match outdoor weather, but ambient conditions fall into standard room comfort conditions. Natural ventilation would exhibit identical metrics.";
          } else {
            est = "Likely outdoor";
            summ = `Local measurements closely match ambient weather baseline (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%).`;
            expl = `Local sensor tracks outdoor meteorological weather within equilibrium bounds.`;
          }
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
  }, [reading, weatherData, latitude, longitude, placeName, geoAccuracy]);

  // Re-evaluate whenever reading or weatherData changes
  useEffect(() => {
    evaluateHeuristic();
  }, [evaluateHeuristic]);

  const handleRefresh = async () => {
    onRefreshParent();
    await evaluateHeuristic();
    toast.success("Heuristic environmental estimation re-evaluated");
  };

  const estimate = heuristicResult?.estimate || "Inconclusive";
  const metrics = heuristicResult?.metrics;

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
  }[estimate];

  const EstimateIcon = estimateBadgeConfig.icon;

  const hasLocalClimate = reading?.temperature != null && reading?.humidity != null;
  const hasOutdoorBaseline = weatherData?.temperature != null && weatherData?.humidity != null;

  return (
    <Card className="relative overflow-hidden border-border/80 bg-card shadow-sm transition-all hover:shadow-md">
      {/* Top accent line */}
      <div
        className={`h-1.5 w-full transition-colors duration-500 ${
          estimate === "Likely indoor"
            ? "bg-blue-500"
            : estimate === "Likely outdoor"
              ? "bg-emerald-500"
              : "bg-amber-500"
        }`}
      />

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
                  Rule-Based Heuristic
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
              {placeName || (latitude && longitude ? `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°` : "Location access not yet granted")}
            </strong>
            {geoAccuracy && <span className="text-[10px] text-muted-foreground">(±{Math.round(geoAccuracy)}m)</span>}
          </span>

          {geoStatus !== "granted" && (
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
        {/* Prominent Estimation Banner */}
        <div className={`rounded-xl border ${estimateBadgeConfig.accentBorder} ${estimateBadgeConfig.accentBg} p-4 sm:p-5 transition-all`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className={`flex size-12 items-center justify-center rounded-xl bg-card border border-border shadow-xs ${estimateBadgeConfig.iconColor}`}>
                <EstimateIcon className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold tracking-wide uppercase ${estimateBadgeConfig.colorClass}`}>
                    {estimateBadgeConfig.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                    Non-ML Heuristic
                  </span>
                </div>
                <h4 className="mt-1 text-sm font-semibold text-foreground">
                  {heuristicResult?.summary || "Analyzing environmental evidence..."}
                </h4>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground sm:text-right shrink-0">
              <p>Evaluation Model: <span className="font-mono text-foreground">Rule-based v1.0</span></p>
              <p>Confidence: <span className="italic text-foreground">None (heuristic rule)</span></p>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-2.5">
            {heuristicResult?.explanation}
          </p>
        </div>

        {/* Missing Input Alert Banners */}
        {!hasLocalClimate && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Local Temperature & Humidity Sensor Not Detected</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                The Plantower PMS7003 measures particulate matter only. Ambient weather values cannot be assumed to be indoor room conditions. Connect a temperature/humidity sensor or submit a test reading to enable thermal differential analysis.
              </p>
            </div>
          </div>
        )}

        {!hasOutdoorBaseline && (
          <div className="flex items-start gap-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-400">
            <Info className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Outdoor Meteorological Baseline Unavailable</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Outdoor weather at your geographical location is required to compare against local sensor readings. Click &ldquo;Enable GPS&rdquo; above to retrieve real ambient weather from Open-Meteo.
              </p>
            </div>
          </div>
        )}

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
                {reading ? (reading.data_source === "sensor" ? "IoT Sensor" : reading.data_source) : "No Data"}
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temperature:</span>
                <strong className="font-mono text-foreground">
                  {hasLocalClimate ? `${reading?.temperature?.toFixed(1)}°C` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Relative Humidity:</span>
                <strong className="font-mono text-foreground">
                  {hasLocalClimate ? `${reading?.humidity?.toFixed(1)}%` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PM2.5 / PM10:</span>
                <strong className="font-mono text-foreground">
                  {reading ? `${reading.pm2_5} / ${reading.pm10}` : "—"} µg/m³
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Source: {reading?.temp_humidity_source || "PMS7003 Particulate"} · {reading ? new Date(reading.timestamp).toLocaleTimeString() : "—"}
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
                Open-Meteo
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outdoor Temp:</span>
                <strong className="font-mono text-foreground">
                  {hasOutdoorBaseline ? `${weatherData?.temperature?.toFixed(1)}°C` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outdoor Humidity:</span>
                <strong className="font-mono text-foreground">
                  {hasOutdoorBaseline ? `${weatherData?.humidity?.toFixed(1)}%` : "Unavailable"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Condition:</span>
                <strong className="text-foreground truncate max-w-[120px]">
                  {weatherData?.weather_description || "Pending"}
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Observation: {weatherData?.observation_timestamp ? new Date(weatherData.observation_timestamp).toLocaleTimeString() : "—"}
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
                  {metrics?.abs_temp_diff_c !== null && metrics?.abs_temp_diff_c !== undefined
                    ? `${metrics.abs_temp_diff_c.toFixed(1)}°C`
                    : "—"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Humidity Diff (ΔRH):</span>
                <strong className="font-mono text-foreground">
                  {metrics?.abs_humidity_diff_pct !== null && metrics?.abs_humidity_diff_pct !== undefined
                    ? `${metrics.abs_humidity_diff_pct.toFixed(1)}%`
                    : "—"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PM2.5/PM10 Ratio:</span>
                <strong className="font-mono text-foreground">
                  {metrics?.pm_ratio !== null && metrics?.pm_ratio !== undefined
                    ? metrics.pm_ratio.toFixed(2)
                    : "—"}
                </strong>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Threshold: ΔT ≥ 3.5°C or ΔRH ≥ 15% suggests indoor micro-climate
              </div>
            </div>
          </div>
        </div>

        {/* Influencing Evidence List */}
        {heuristicResult?.influencing_factors && heuristicResult.influencing_factors.length > 0 && (
          <div className="rounded-lg bg-muted/20 p-3 text-xs space-y-1.5 border border-border/50">
            <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
              Influencing Heuristic Factors:
            </p>
            <ul className="space-y-1 text-muted-foreground text-[11px]">
              {heuristicResult.influencing_factors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="size-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scientific Disclaimer Banner */}
        <div className="rounded-lg bg-muted/30 p-2.5 text-[10px] text-muted-foreground border border-border/40 leading-relaxed">
          <strong className="text-foreground">Scientific Integrity Note:</strong> {heuristicResult?.scientific_disclaimer || "Temperature and relative humidity alone cannot reliably distinguish indoor from outdoor spaces. This heuristic provides an indicative estimate based on empirical differentials."}
        </div>
      </CardContent>
    </Card>
  );
}
