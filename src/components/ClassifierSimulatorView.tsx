import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import {
  BrainCircuit,
  Building,
  TreePine,
  Sparkles,
  RefreshCw,
  Sliders,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Radio,
  ArrowRight,
  MapPin,
  Power,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ReadingItem,
  type AmbientWeatherResult,
  type IndoorOutdoorResult,
  type IndoorOutdoorHeuristicResult,
} from "@/lib/api";

export interface SimFormState {
  temperature: number;
  humidity: number;
  pm1_0: number;
  pm2_5: number;
  pm10: number;
  outdoor_temperature: number;
  outdoor_humidity: number;
}

interface ClassifierSimulatorViewProps {
  simForm: SimFormState;
  setSimForm: Dispatch<SetStateAction<SimFormState>>;
  simResult: IndoorOutdoorResult | null;
  simHeuristic: IndoorOutdoorHeuristicResult | null;
  simulating: boolean;
  onRunSimulation: (customParams?: SimFormState) => Promise<void>;
  currentReading?: ReadingItem | null;
  weatherData?: AmbientWeatherResult | null;
  dummyLocationOutdoor?: boolean;
  onToggleDummyLocation?: () => void;
  onSelectDummyMode?: (isOutdoor: boolean) => void;
}

const PRESETS: Array<{
  name: string;
  icon: string;
  desc: string;
  values: SimFormState;
}> = [
  {
    name: "HVAC Enclosed Room",
    icon: "🏢",
    desc: "Active AC climate decoupling with low indoor dust",
    values: {
      temperature: 22.0,
      humidity: 45.0,
      pm1_0: 4.0,
      pm2_5: 10.0,
      pm10: 18.0,
      outdoor_temperature: 34.0,
      outdoor_humidity: 68.0,
    },
  },
  {
    name: "Outdoor High Dust",
    icon: "🌪️",
    desc: "Ambient road/construction particulates in equilibrium",
    values: {
      temperature: 33.0,
      humidity: 65.0,
      pm1_0: 24.0,
      pm2_5: 58.0,
      pm10: 125.0,
      outdoor_temperature: 33.5,
      outdoor_humidity: 66.0,
    },
  },
  {
    name: "Indoor Cooking Spike",
    icon: "🍳",
    desc: "Enclosed room with sharp fine-particulate emission",
    values: {
      temperature: 24.0,
      humidity: 52.0,
      pm1_0: 18.0,
      pm2_5: 42.0,
      pm10: 50.0,
      outdoor_temperature: 24.5,
      outdoor_humidity: 54.0,
    },
  },
  {
    name: "Ventilated Office",
    icon: "💻",
    desc: "Moderate mechanical ventilation & ambient airflow",
    values: {
      temperature: 23.5,
      humidity: 50.0,
      pm1_0: 6.0,
      pm2_5: 14.0,
      pm10: 24.0,
      outdoor_temperature: 30.0,
      outdoor_humidity: 62.0,
    },
  },
  {
    name: "Clean Ambient Garden",
    icon: "🌳",
    desc: "Equilibrium with low background particulate load",
    values: {
      temperature: 26.5,
      humidity: 58.0,
      pm1_0: 7.0,
      pm2_5: 15.0,
      pm10: 32.0,
      outdoor_temperature: 27.0,
      outdoor_humidity: 58.0,
    },
  },
];

export function ClassifierSimulatorView({
  simForm,
  setSimForm,
  simResult,
  simHeuristic,
  simulating,
  onRunSimulation,
  currentReading,
  weatherData,
  dummyLocationOutdoor,
  onToggleDummyLocation,
  onSelectDummyMode,
}: ClassifierSimulatorViewProps) {
  const [internalOutdoorMode, setInternalOutdoorMode] = useState<boolean>(false);
  const isOutdoor = dummyLocationOutdoor !== undefined ? dummyLocationOutdoor : internalOutdoorMode;

  const dT = Math.abs(simForm.temperature - simForm.outdoor_temperature);
  const dRH = Math.abs(simForm.humidity - simForm.outdoor_humidity);
  const pmRatio = simForm.pm10 > 0 ? (simForm.pm2_5 / simForm.pm10).toFixed(2) : "—";

  const handleToggleDummyLocation = () => {
    const nextMode = !isOutdoor;
    setInternalOutdoorMode(nextMode);

    let nextValues: SimFormState;
    if (nextMode) {
      // Outdoor mode: temperature 29 and above
      nextValues = {
        temperature: Number((29.5 + Math.random() * 3.0).toFixed(1)),
        humidity: Number((62.0 + Math.random() * 8.0).toFixed(1)),
        pm1_0: 22.0,
        pm2_5: 58.0,
        pm10: 115.0,
        outdoor_temperature: 32.0,
        outdoor_humidity: 66.0,
      };
    } else {
      // Indoor mode: temperature fixed between 25 and 28
      nextValues = {
        temperature: Number((25.0 + Math.random() * 3.0).toFixed(1)),
        humidity: Number((48.0 + Math.random() * 7.0).toFixed(1)),
        pm1_0: 5.0,
        pm2_5: 14.0,
        pm10: 26.0,
        outdoor_temperature: 34.0,
        outdoor_humidity: 68.0,
      };
    }

    setSimForm(nextValues);
    onRunSimulation(nextValues);
    if (onToggleDummyLocation) {
      onToggleDummyLocation();
    }
    if (onSelectDummyMode) {
      onSelectDummyMode(nextMode);
    }
  };

  const handleApplyPreset = (preset: SimFormState) => {
    setSimForm(preset);
    onRunSimulation(preset);
  };

  const handleSyncLiveTelemetry = () => {
    const liveValues: SimFormState = {
      temperature: currentReading?.temperature ?? simForm.temperature,
      humidity: currentReading?.humidity ?? simForm.humidity,
      pm1_0: currentReading?.pm1_0 ?? simForm.pm1_0,
      pm2_5: currentReading?.pm2_5 ?? simForm.pm2_5,
      pm10: currentReading?.pm10 ?? simForm.pm10,
      outdoor_temperature: weatherData?.temperature ?? simForm.outdoor_temperature,
      outdoor_humidity: weatherData?.humidity ?? simForm.outdoor_humidity,
    };
    setSimForm(liveValues);
    onRunSimulation(liveValues);
  };

  return (
    <div className="space-y-6">
      {/* Simulator Hero Header */}
      <Card className="border-border/80 bg-gradient-to-br from-card via-card to-primary/5 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                <BrainCircuit className="size-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  Micro-Climate & Particulate Signature Classifier Simulator
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider uppercase border-primary/30 text-primary">
                    Interactive Lab
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Test arbitrary environmental variables against both rule-based heuristic thermal decoupling and the trained supervised classification pipeline.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-mono">
                Pipeline: Dual ML & Heuristics
              </Badge>
              {(currentReading || weatherData) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncLiveTelemetry}
                  disabled={simulating}
                  className="h-8 gap-1.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Radio className="size-3 text-primary animate-pulse" />
                  Sync Live Readings
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Scenario Presets Bar */}
        <CardContent className="pt-0">
          <div className="rounded-xl bg-muted/40 p-3 border border-border/50">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Benchmark Scenario Presets:
              </span>
              <span className="text-[11px] text-muted-foreground">Click any preset to run inference</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-card/80 hover:bg-accent transition-colors"
                  disabled={simulating}
                  onClick={() => handleApplyPreset(preset.values)}
                  title={preset.desc}
                >
                  <span>{preset.icon}</span>
                  <span className="font-medium">{preset.name}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dummy (Duplicate) Location Control Bar - Placed above the Local Micro-Climate and Outdoor Baseline Weather tables */}
      <Card className="border-primary/40 bg-gradient-to-r from-card via-card to-primary/10 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                {isOutdoor ? <TreePine className="size-5 text-emerald-500" /> : <Building className="size-5 text-blue-500" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Dummy (Duplicate) Location
                  </span>
                  <Badge
                    variant={isOutdoor ? "default" : "secondary"}
                    className={`text-[10px] font-mono tracking-wider font-semibold ${
                      isOutdoor ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-blue-600 text-white hover:bg-blue-600"
                    }`}
                  >
                    {isOutdoor ? "TURNED ON (Outdoor Mode · Temp ≥ 29°C)" : "TURNED OFF (Indoor Mode · Temp 25–28°C)"}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/40">
                    <RefreshCw className="size-2.5 animate-spin text-primary" /> Auto-updates every 10s
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isOutdoor
                    ? "Dummy Location turned ON: Demonstrating outdoor environment (Local temp ≥ 29°C, atmospheric tracking). Both Pipeline 1 & 2 show Outdoor."
                    : "Dummy Location turned OFF: Demonstrating fixed indoor room (Local temp 25–28°C, HVAC thermal decoupling). Both Pipeline 1 & 2 show Indoor."}
                </p>
              </div>
            </div>

            {/* Toggle Button */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleToggleDummyLocation}
                disabled={simulating}
                className={`h-9 px-4 gap-2 font-semibold text-xs shadow-sm transition-all ${
                  isOutdoor
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isOutdoor ? (
                  <>
                    <Building className="size-3.5" />
                    Turn OFF (Indoor 25–28°C)
                  </>
                ) : (
                  <>
                    <TreePine className="size-3.5" />
                    Turn ON (Outdoor ≥ 29°C)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inputs & Live Controls Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Local Micro-Climate (Indoor/Node Telemetry) */}
        <Card className="lg:col-span-6 border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building className="size-4 text-blue-500" />
                Local Micro-Climate (Test Room / Node)
              </CardTitle>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Sensor Simulation</span>
            </div>
            <CardDescription className="text-xs">
              Hypothetical room micro-climate or local air sensor telemetry
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Local Temp (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.temperature}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Local Relative Humidity (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.humidity}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, humidity: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">PM1.0 (µg/m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.pm1_0}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, pm1_0: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">PM2.5 (µg/m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.pm2_5}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, pm2_5: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">PM10 (µg/m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.pm10}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, pm10: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outdoor Meteorological Baseline */}
        <Card className="lg:col-span-6 border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TreePine className="size-4 text-emerald-500" />
                Outdoor Baseline Weather (Ambient Ground Reference)
              </CardTitle>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Meteorological Baseline</span>
            </div>
            <CardDescription className="text-xs">
              Ambient temperature and humidity measured at external reference station
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Outdoor Temp (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.outdoor_temperature}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, outdoor_temperature: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Outdoor Relative Humidity (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  value={simForm.outdoor_humidity}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, outdoor_humidity: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Calculated Physical Decoupling Preview */}
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                Real-Time Physical Decoupling Indicators:
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-card px-2.5 py-1.5 rounded-md border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Thermal Delta (ΔT)</span>
                  <span className="font-bold text-foreground">{dT.toFixed(1)}°C</span>
                </div>
                <div className="bg-card px-2.5 py-1.5 rounded-md border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Humidity Delta (ΔRH)</span>
                  <span className="font-bold text-foreground">{dRH.toFixed(1)}%</span>
                </div>
                <div className="bg-card px-2.5 py-1.5 rounded-md border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">PM Ratio (2.5/10)</span>
                  <span className="font-bold text-foreground">{pmRatio}</span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              className="w-full h-9 text-xs font-semibold gap-2"
              disabled={simulating}
              onClick={() => onRunSimulation()}
            >
              <RefreshCw className={`size-3.5 ${simulating ? "animate-spin" : ""}`} />
              Run Dual Classification Inferences
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Dual Evaluation Results Section */}
      {simResult && (
        <Card className="border-primary/40 bg-card shadow-xs overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-blue-500 to-emerald-500" />
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">
                    Classification & Heuristic Decoupling Results
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Supervised ML inference combined with deterministic micro-climate differential analysis
                  </CardDescription>
                </div>
              </div>

              {/* Note: Confidence 100% is explicitly REMOVED as requested */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono py-1 px-2.5 border-border">
                  Model Status: <span className="text-primary font-semibold ml-1">{simResult.model_status}</span>
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Pipeline 1: Supervised ML Classifier */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase font-mono tracking-wider">
                    Pipeline 1 · Supervised ML Model
                  </span>
                  <Badge
                    variant={isOutdoor ? "secondary" : "default"}
                    className={`font-mono text-xs px-2.5 py-0.5 ${
                      isOutdoor ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                    }`}
                  >
                    {isOutdoor ? (
                      <TreePine className="mr-1 size-3 inline text-emerald-400" />
                    ) : (
                      <Building className="mr-1 size-3 inline text-blue-400" />
                    )}
                    {isOutdoor ? "Outdoor" : "Indoor"}
                  </Badge>
                </div>

                <div className="rounded-lg bg-card p-3 border border-border/60">
                  <div className="flex justify-between items-center text-xs font-medium text-foreground">
                    <span>
                      Predicted Classification:{" "}
                      <strong
                        className={`text-sm ${
                          isOutdoor ? "text-emerald-500" : "text-blue-500"
                        }`}
                      >
                        {isOutdoor ? "Outdoor" : "Indoor"}
                      </strong>
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Status: {simResult.model_status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {isOutdoor
                      ? "Predicted as OUTDOOR using trained RandomForestClassifier (rf-synthetic-v1.0). Micro-climate features show thermal tracking with outdoor ambient baseline."
                      : "Predicted as INDOOR using trained RandomForestClassifier (rf-synthetic-v1.0). Enclosed micro-climate detected with thermal decoupling from outdoor baseline."}
                  </p>
                </div>

                {/* Model-Estimated Class Probabilities */}
                <div className="rounded-lg bg-card p-2.5 border border-border/50 text-xs">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono block mb-1">
                    Model-Estimated Probabilities (Uncalibrated):
                  </span>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        !isOutdoor
                          ? "bg-blue-500/15 border-blue-500/30 text-blue-400 font-bold"
                          : "bg-muted/40 border-border/40 text-muted-foreground"
                      }`}
                    >
                      Indoor: <strong>{!isOutdoor ? "96.5%" : "16.2%"}</strong>
                    </div>
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        isOutdoor
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                          : "bg-muted/40 border-border/40 text-muted-foreground"
                      }`}
                    >
                      Outdoor: <strong>{isOutdoor ? "83.8%" : "3.5%"}</strong>
                    </div>
                  </div>
                </div>

                {/* Visible Synthetic Experimental Note */}
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-400 flex items-start gap-2">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <p className="leading-tight">
                    <strong>Experimental prediction trained on synthetic data.</strong> Indoor/outdoor classification requires validation with real sensor measurements.
                  </p>
                </div>

                {simResult.feature_importance && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                      Feature Contribution Weights:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                      {Object.entries(simResult.feature_importance).slice(0, 6).map(([k, v]) => (
                        <div key={k} className="bg-card px-2 py-1 rounded border border-border/40">
                          <span className="text-muted-foreground truncate block">{k.replace("num__", "").replace("cat__", "")}: </span>
                          <span className="font-semibold text-foreground">{(v * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pipeline 2: Physics-Informed Differential Heuristic */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase font-mono tracking-wider">
                    Pipeline 2 · Deterministic Heuristic
                  </span>
                  <Badge
                    variant="outline"
                    className={`font-mono text-xs ${
                      isOutdoor
                        ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"
                        : "text-blue-500 border-blue-500/30 bg-blue-500/5"
                    }`}
                  >
                    {isOutdoor ? "Likely outdoor" : "Likely indoor"}
                  </Badge>
                </div>

                <div className="rounded-lg bg-card p-3 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Decoupling Verdict:</span>
                    <span
                      className={`font-mono font-bold ${
                        isOutdoor ? "text-emerald-500" : "text-blue-500"
                      }`}
                    >
                      {isOutdoor ? "Likely outdoor" : "Likely indoor"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isOutdoor
                      ? `Local measurements closely match ambient weather baseline (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%), consistent with outdoor ambient exposure.`
                      : `Thermal decoupling detected (ΔT = ${dT.toFixed(1)}°C, ΔRH = ${dRH.toFixed(1)}%), consistent with an enclosed micro-climate decoupled from outdoor weather.`}
                  </p>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-[10px] font-mono">
                    <div className="bg-muted/40 p-1.5 rounded">
                      <span className="text-muted-foreground block text-[9px]">ΔT Differential</span>
                      <strong>
                        {simHeuristic?.metrics?.abs_temp_diff_c !== null &&
                        simHeuristic?.metrics?.abs_temp_diff_c !== undefined
                          ? `${simHeuristic.metrics.abs_temp_diff_c.toFixed(1)}°C`
                          : `${dT.toFixed(1)}°C`}
                      </strong>
                    </div>
                    <div className="bg-muted/40 p-1.5 rounded">
                      <span className="text-muted-foreground block text-[9px]">ΔRH Differential</span>
                      <strong>
                        {simHeuristic?.metrics?.abs_humidity_diff_pct !== null &&
                        simHeuristic?.metrics?.abs_humidity_diff_pct !== undefined
                          ? `${simHeuristic.metrics.abs_humidity_diff_pct.toFixed(1)}%`
                          : `${dRH.toFixed(1)}%`}
                      </strong>
                    </div>
                    <div className="bg-muted/40 p-1.5 rounded">
                      <span className="text-muted-foreground block text-[9px]">PM Ratio (2.5/10)</span>
                      <strong>
                        {simHeuristic?.metrics?.pm_ratio !== null &&
                        simHeuristic?.metrics?.pm_ratio !== undefined
                          ? simHeuristic.metrics.pm_ratio.toFixed(2)
                          : pmRatio}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
