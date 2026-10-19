import { type Dispatch, type SetStateAction } from "react";
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
}: ClassifierSimulatorViewProps) {
  const dT = Math.abs(simForm.temperature - simForm.outdoor_temperature);
  const dRH = Math.abs(simForm.humidity - simForm.outdoor_humidity);
  const pmRatio = simForm.pm10 > 0 ? (simForm.pm2_5 / simForm.pm10).toFixed(2) : "—";

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
                    variant={simResult.predicted_class === "Indoor" ? "default" : "secondary"}
                    className="font-mono text-xs px-2.5 py-0.5"
                  >
                    {simResult.predicted_class === "Indoor" ? (
                      <Building className="mr-1 size-3 inline" />
                    ) : (
                      <TreePine className="mr-1 size-3 inline" />
                    )}
                    {simResult.predicted_class}
                  </Badge>
                </div>

                <div className="rounded-lg bg-card p-3 border border-border/60">
                  <p className="text-xs font-medium text-foreground">
                    Predicted Classification:{" "}
                    <strong
                      className={`text-sm ${
                        simResult.predicted_class === "Indoor"
                          ? "text-blue-500"
                          : simResult.predicted_class === "Outdoor"
                            ? "text-emerald-500"
                            : "text-amber-500"
                      }`}
                    >
                      {simResult.predicted_class}
                    </strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {simResult.notes ||
                      "Inferred using multi-variable supervised pipeline trained on paired micro-climate features."}
                  </p>
                </div>

                {simResult.feature_importance && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                      Feature Contribution Weights:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                      {Object.entries(simResult.feature_importance).map(([k, v]) => (
                        <div key={k} className="bg-card px-2 py-1 rounded border border-border/40">
                          <span className="text-muted-foreground capitalize">{k}: </span>
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
                  <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                    {simHeuristic?.estimate || "Decoupling Rule"}
                  </Badge>
                </div>

                <div className="rounded-lg bg-card p-3 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Decoupling Verdict:</span>
                    <span className="font-mono font-bold text-primary">{simHeuristic?.estimate}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {simHeuristic?.summary || "Differential evaluation of local vs ambient baseline."}
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
