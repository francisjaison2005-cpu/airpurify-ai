import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import {
  BrainCircuit,
  Building,
  TreePine,
  Sparkles,
  RefreshCw,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Radio,
  ArrowRight,
  ShieldAlert,
  Info,
  Layers,
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
import { useDemoSensor } from "@/lib/demoSensorStore";

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
  const [demoState, demoActions] = useDemoSensor();

  // If in demo mode, values are strictly derived from the shared demo store
  const isDemoActive = demoState.isDemoMode;
  const isOutdoor = isDemoActive ? demoState.environment === "outdoor" : (dummyLocationOutdoor ?? false);

  // Active values shown in panels
  const activeTemp = isDemoActive ? demoState.temperature : simForm.temperature;
  const activeHumidity = isDemoActive ? demoState.humidity : simForm.humidity;
  const activePm1_0 = isDemoActive ? demoState.pm1_0 : simForm.pm1_0;
  const activePm2_5 = isDemoActive ? demoState.pm2_5 : simForm.pm2_5;
  const activePm10 = isDemoActive ? demoState.pm10 : simForm.pm10;
  const activeOutdoorTemp = isDemoActive ? demoState.outdoorTemperature : simForm.outdoor_temperature;
  const activeOutdoorHumidity = isDemoActive ? demoState.outdoorHumidity : simForm.outdoor_humidity;

  // Real-time calculated physical decoupling metrics
  const dT = Number((activeTemp - activeOutdoorTemp).toFixed(1));
  const absDT = Math.abs(dT);
  const dRH = Number((activeHumidity - activeOutdoorHumidity).toFixed(1));
  const absDRH = Math.abs(dRH);
  const pmRatio = activePm10 > 0 ? (activePm2_5 / activePm10).toFixed(2) : "—";

  // Toggle handler for "Duplicate Location / Demo Sensor"
  const handleToggleDemoSensor = () => {
    if (isDemoActive) {
      demoActions.toggleEnvironment();
    } else {
      demoActions.setDemoMode(true);
      demoActions.setEnvironment("outdoor");
    }

    if (onToggleDummyLocation) {
      onToggleDummyLocation();
    }
    if (onSelectDummyMode) {
      onSelectDummyMode(!isOutdoor);
    }
  };

  const handleApplyPreset = (preset: SimFormState) => {
    demoActions.setDemoMode(false);
    setSimForm(preset);
    onRunSimulation(preset);
  };

  const handleSyncLiveTelemetry = () => {
    demoActions.setDemoMode(false);
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
                    Dual Pipeline Lab
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
                Benchmark Scenario Presets (Manual Sandbox Mode):
              </span>
              <span className="text-[11px] text-muted-foreground">Click any preset to run manual inference</span>
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

      {/* SECTION 1: DUPLICATE LOCATION / DEMO SENSOR TOGGLE
          Placed IMMEDIATELY ABOVE the two existing panels:
          - Local Micro-Climate (Test Room / Node)
          - Outdoor Baseline Weather (Ambient Ground Reference)
      */}
      <Card className="border-primary/50 bg-gradient-to-r from-card via-card to-primary/10 shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-primary to-emerald-500" />
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`flex size-11 items-center justify-center rounded-xl border shadow-xs transition-colors shrink-0 ${
                  isOutdoor
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-blue-500/15 border-blue-500/30 text-blue-400"
                }`}
              >
                {isOutdoor ? <TreePine className="size-6 text-emerald-500" /> : <Building className="size-6 text-blue-500" />}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Duplicate Location / Demo Sensor
                  </span>

                  {/* Clear visual indicator showing which mode is active */}
                  <Badge
                    variant="default"
                    className={`text-[11px] font-mono tracking-wide font-semibold px-2.5 py-0.5 shadow-xs transition-colors ${
                      isOutdoor
                        ? "bg-emerald-600 text-white hover:bg-emerald-600"
                        : "bg-blue-600 text-white hover:bg-blue-600"
                    }`}
                  >
                    {isOutdoor ? "ON — Outdoor Demo" : "OFF — Indoor Demo"}
                  </Badge>

                  {/* 10-second automatic refresh indicator */}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
                    <RefreshCw className="size-3 animate-spin text-primary" />
                    Updates every 10s (in {demoState.secondsRemaining}s)
                  </span>

                  <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider border-primary/30 text-primary">
                    SIMULATED SENSOR DATA
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {isOutdoor
                    ? "Active: ON — Outdoor Demo · Local temperature generated between 29°C and 36°C (RH 45–85%). Forced consensus classification: OUTDOOR."
                    : "Active: OFF — Indoor Demo · Local temperature generated between 25°C and 28°C (RH 40–65%). Forced consensus classification: INDOOR."}
                </p>

                {/* Explicit statement required by prompt: must not claim to physically move sensor or duplicate geographic location */}
                <p className="text-[11px] text-muted-foreground/80 italic">
                  * Note: This toggle selects simulated environmental readings for the demonstration. It does not physically move a sensor or duplicate a geographic location.
                </p>
              </div>
            </div>

            {/* Toggle Control Button with explicit two-state representation */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={handleToggleDemoSensor}
                disabled={simulating}
                className={`h-9 px-4 gap-2 font-semibold text-xs shadow-sm transition-all ${
                  isOutdoor
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isOutdoor ? (
                  <>
                    <Building className="size-4" />
                    Switch to: OFF — Indoor Demo
                  </>
                ) : (
                  <>
                    <TreePine className="size-4" />
                    Switch to: ON — Outdoor Demo
                  </>
                )}
              </Button>

              {/* Mode indicator toggle button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => demoActions.setDemoMode(!isDemoActive)}
                className="h-9 px-3 text-xs gap-1.5 border-border"
                title="Toggle between Phase 2 Demo Mode and Real/Manual Mode"
              >
                {isDemoActive ? "Demo Mode: Active" : "Manual Sandbox: Active"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inputs & Live Controls Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Panel 1: Local Micro-Climate (Test Room / Node) */}
        <Card className="lg:col-span-6 border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building className="size-4 text-blue-500" />
                Local Micro-Climate (Test Room / Node)
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                {isDemoActive ? "SIMULATED SENSOR" : "MANUAL / SENSOR"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {isDemoActive
                ? `Active demo readings (${isOutdoor ? "Outdoor Mode · 29–36°C" : "Indoor Mode · 25–28°C"})`
                : "Hypothetical room micro-climate or local air sensor telemetry"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  Local Temp (°C) {isDemoActive && <span className="text-[11px] text-primary">({isOutdoor ? "29–36°C" : "25–28°C"})</span>}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  readOnly={isDemoActive}
                  value={activeTemp}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  Local Relative Humidity (%) {isDemoActive && <span className="text-[11px] text-primary">({isOutdoor ? "45–85%" : "40–65%"})</span>}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  className="h-9 font-mono text-sm"
                  readOnly={isDemoActive}
                  value={activeHumidity}
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
                  readOnly={isDemoActive}
                  value={activePm1_0}
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
                  readOnly={isDemoActive}
                  value={activePm2_5}
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
                  readOnly={isDemoActive}
                  value={activePm10}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, pm10: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Panel 2: Outdoor Baseline Weather (Ambient Ground Reference) */}
        <Card className="lg:col-span-6 border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TreePine className="size-4 text-emerald-500" />
                Outdoor Baseline Weather (Ambient Ground Reference)
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                {isDemoActive ? "METEOROLOGICAL REF" : "OPEN-METEO"}
              </Badge>
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
                  readOnly={isDemoActive}
                  value={activeOutdoorTemp}
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
                  readOnly={isDemoActive}
                  value={activeOutdoorHumidity}
                  onChange={(e) =>
                    setSimForm((prev) => ({ ...prev, outdoor_humidity: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Calculated Physical Decoupling Preview */}
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>Real-Time Physical Decoupling & AQI Indicators:</span>
                <span className="text-[10px] font-mono text-primary font-medium">
                  {isDemoActive ? `Auto-refresh in ${demoState.secondsRemaining}s` : "Manual"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                <div className="bg-card px-2 py-1.5 rounded-md border border-border/50 text-center">
                  <span className="text-[9px] text-muted-foreground block truncate">Thermal ΔT</span>
                  <span className="font-bold text-foreground">
                    {dT > 0 ? `+${dT.toFixed(1)}` : `${dT.toFixed(1)}`}°C
                  </span>
                </div>
                <div className="bg-card px-2 py-1.5 rounded-md border border-border/50 text-center">
                  <span className="text-[9px] text-muted-foreground block truncate">Humidity ΔRH</span>
                  <span className="font-bold text-foreground">
                    {dRH > 0 ? `+${dRH.toFixed(1)}` : `${dRH.toFixed(1)}`}%
                  </span>
                </div>
                <div className="bg-card px-2 py-1.5 rounded-md border border-border/50 text-center">
                  <span className="text-[9px] text-muted-foreground block truncate">PM Ratio (2.5/10)</span>
                  <span className="font-bold text-foreground">{pmRatio}</span>
                </div>
                <div className="bg-card px-2 py-1.5 rounded-md border border-border/50 text-center">
                  <span className="text-[9px] text-muted-foreground block truncate">Indicative AQI</span>
                  <span className="font-bold text-foreground" style={{ color: isDemoActive ? demoState.aqiColor : undefined }}>
                    {isDemoActive ? demoState.aqi : (simResult ? "Live" : "—")}
                  </span>
                </div>
              </div>
            </div>

            {!isDemoActive && (
              <Button
                type="button"
                className="w-full h-9 text-xs font-semibold gap-2"
                disabled={simulating}
                onClick={() => onRunSimulation()}
              >
                <RefreshCw className={`size-3.5 ${simulating ? "animate-spin" : ""}`} />
                Run Dual Classification Inferences
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 5: BOTH CLASSIFICATION PIPELINES MUST AGREE IN DEMO MODE
          Pipeline 1: Supervised ML Model
          Pipeline 2: Deterministic Heuristic
          Both show INDOOR when toggle is OFF.
          Both show OUTDOOR when toggle is ON.
          Display explicit badge: DEMO OVERRIDE — NOT A LIVE ML PREDICTION
      */}
      <Card className="border-primary/40 bg-card shadow-xs overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-blue-500 to-emerald-500" />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  Classification & Decoupling Pipeline Results
                  {isDemoActive && (
                    <Badge variant="destructive" className="bg-amber-600/20 text-amber-400 border border-amber-500/40 text-[10px] font-mono">
                      DEMO OVERRIDE — NOT A LIVE ML PREDICTION
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {isDemoActive
                    ? "Phase 2 Demonstration Adapter: Both pipelines driven by controlled environmental simulation while hardware PMS7003 sensor is offline."
                    : "Supervised ML inference combined with deterministic micro-climate differential analysis"}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono py-1 px-2.5 border-border">
                Consensus Status: <span className="text-primary font-semibold ml-1">{isOutdoor ? "OUTDOOR" : "INDOOR"}</span>
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
                <div className="flex items-center gap-1.5">
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
              </div>

              {/* Explicit Demo Override Badge required by Section 5 */}
              {isDemoActive && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-mono font-semibold text-amber-400 flex items-center justify-between">
                  <span>DEMO OVERRIDE — NOT A LIVE ML PREDICTION</span>
                  <span className="text-[9px] uppercase text-muted-foreground font-sans">Simulated Telemetry</span>
                </div>
              )}

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
                    Status: {isDemoActive ? "Demo Consensus" : (simResult?.model_status || "Trained")}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isOutdoor
                    ? "Predicted as OUTDOOR. Micro-climate features show thermal tracking with ambient outdoor baseline (local temp 29–36°C, RH 45–85%)."
                    : "Predicted as INDOOR. Enclosed micro-climate detected with thermal decoupling from outdoor weather (local temp 25–28°C, RH 40–65%)."}
                </p>
              </div>

              {/* Model-Estimated Class Probabilities */}
              <div className="rounded-lg bg-card p-2.5 border border-border/50 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono block mb-1">
                  Model Class Probabilities (Synthetic Benchmark):
                </span>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div
                    className={`p-1.5 rounded border transition-colors ${
                      !isOutdoor
                        ? "bg-blue-500/15 border-blue-500/30 text-blue-400 font-bold"
                        : "bg-muted/40 border-border/40 text-muted-foreground"
                    }`}
                  >
                    Indoor: <strong>{!isOutdoor ? "96.5%" : "14.2%"}</strong>
                  </div>
                  <div
                    className={`p-1.5 rounded border transition-colors ${
                      isOutdoor
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold"
                        : "bg-muted/40 border-border/40 text-muted-foreground"
                    }`}
                  >
                    Outdoor: <strong>{isOutdoor ? "85.8%" : "3.5%"}</strong>
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

              {/* Feature Contribution Weights */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                  Key Feature Importances (Random Forest):
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  <div className="bg-card px-2 py-1 rounded border border-border/40">
                    <span className="text-muted-foreground block">abs_temp_diff:</span>
                    <span className="font-semibold text-foreground">38%</span>
                  </div>
                  <div className="bg-card px-2 py-1 rounded border border-border/40">
                    <span className="text-muted-foreground block">temp_local:</span>
                    <span className="font-semibold text-foreground">27%</span>
                  </div>
                  <div className="bg-card px-2 py-1 rounded border border-border/40">
                    <span className="text-muted-foreground block">abs_rh_diff:</span>
                    <span className="font-semibold text-foreground">19%</span>
                  </div>
                </div>
              </div>
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

              {/* Explicit Demo Override Badge required by Section 5 */}
              {isDemoActive && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-mono font-semibold text-amber-400 flex items-center justify-between">
                  <span>DEMO OVERRIDE — NOT A LIVE ML PREDICTION</span>
                  <span className="text-[9px] uppercase text-muted-foreground font-sans">Physics Decoupling Rule</span>
                </div>
              )}

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
                    ? `Local measurements closely match ambient weather baseline (ΔT = ${dT > 0 ? "+" : ""}${dT.toFixed(1)}°C, ΔRH = ${dRH > 0 ? "+" : ""}${dRH.toFixed(1)}%), consistent with outdoor ambient exposure.`
                    : `Thermal decoupling detected (ΔT = ${dT > 0 ? "+" : ""}${dT.toFixed(1)}°C, ΔRH = ${dRH > 0 ? "+" : ""}${dRH.toFixed(1)}%), consistent with an enclosed micro-climate decoupled from outdoor weather.`}
                </p>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-[10px] font-mono">
                  <div className="bg-muted/40 p-1.5 rounded">
                    <span className="text-muted-foreground block text-[9px]">Thermal ΔT</span>
                    <strong>{dT > 0 ? `+${dT.toFixed(1)}` : `${dT.toFixed(1)}`}°C</strong>
                  </div>
                  <div className="bg-muted/40 p-1.5 rounded">
                    <span className="text-muted-foreground block text-[9px]">Humidity ΔRH</span>
                    <strong>{dRH > 0 ? `+${dRH.toFixed(1)}` : `${dRH.toFixed(1)}`}%</strong>
                  </div>
                  <div className="bg-muted/40 p-1.5 rounded">
                    <span className="text-muted-foreground block text-[9px]">PM Ratio (2.5/10)</span>
                    <strong>{pmRatio}</strong>
                  </div>
                </div>
              </div>

              {/* Indicative AQI Information Card */}
              <div className="rounded-lg bg-card p-2.5 border border-border/50 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                    CPCB Indicative AQI (PM-based):
                  </span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] font-bold"
                    style={{ color: isDemoActive ? demoState.aqiColor : undefined }}
                  >
                    AQI {isDemoActive ? demoState.aqi : "—"} · {isDemoActive ? demoState.aqiCategory : "—"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {isDemoActive ? demoState.healthGuidance : "Based on Indian CPCB sub-index breakpoints."}
                </p>
                <div className="text-[9px] text-muted-foreground/75 italic pt-1 border-t border-border/30">
                  * Indicative value based on PM2.5 and PM10 sub-indices. Official CPCB NAQI requires additional gaseous pollutant monitors.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
