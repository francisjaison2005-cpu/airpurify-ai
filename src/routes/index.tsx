import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  ArrowRight,
  Activity,
  Thermometer,
  Droplets,
  Wind,
  ShieldCheck,
  BrainCircuit,
  Sparkles,
  Cpu,
  Layers,
  LayoutDashboard,
  TreePine,
  Building,
  Compass,
  MapPin,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, KpiCard, AqiBadge, EmptyState, BackendBadge } from "@/components/aq";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClassifierSimulatorView, type SimFormState } from "@/components/ClassifierSimulatorView";
import { useDemoSensor } from "@/lib/demoSensorStore";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  api,
  type ReadingItem,
  type LocationItem,
  type SystemHealth,
  type AlertItem,
  type AmbientWeatherResult,
  type IndoorOutdoorResult,
  type IndoorOutdoorHeuristicResult,
} from "@/lib/api";
import { LiveAqiWeatherCard } from "@/components/LiveAqiWeatherCard";
import { IndoorOutdoorCard } from "@/components/IndoorOutdoorCard";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home Dashboard — AirPurify AI" },
      {
        name: "description",
        content:
          "AirPurify AI Phase 1 environmental intelligence dashboard: real-time AQI, PM trends, CPCB calculations, and MongoDB Atlas persistence.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("main-gate");
  const [latestReading, setLatestReading] = useState<ReadingItem | null>(null);
  const [recentReadings, setRecentReadings] = useState<ReadingItem[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Geolocation & Ambient Weather state
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout"
  >("idle");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<AmbientWeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);

  // Modal dialog states
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [submittingTest, setSubmittingTest] = useState<boolean>(false);
  const [testForm, setTestForm] = useState({
    location_id: "main-gate",
    device_id: "SIM-NODE-01",
    pm1_0: 12.0,
    pm2_5: 25.0,
    pm10: 52.0,
    temperature: 24.5,
    humidity: 55.0,
    environment_label: "outdoor" as "indoor" | "outdoor",
  });

  // Active Tab state ("overview" | "simulator")
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("tab") === "simulator" ? "simulator" : "overview";
    }
    return "overview";
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "overview") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Shared Master Demo Sensor Store (singleton 10s auto-refresh for Phase 2 Review)
  const [demoState, demoActions] = useDemoSensor();
  const isDemoActive = demoState.isDemoMode;
  const isDemoOutdoor = demoState.environment === "outdoor";

  // Active environmental readings: use shared demo store in Demo Mode; real sensor stream when disabled
  const activeReading = isDemoActive ? demoState.currentReading : latestReading;
  const activeWeather = isDemoActive ? demoState.weatherData : weatherData;

  // Classifier Simulator states
  const [classifierModalOpen, setClassifierModalOpen] = useState<boolean>(false);
  const [simForm, setSimForm] = useState<SimFormState>({
    temperature: 26.5,
    humidity: 50.0,
    pm1_0: 6.0,
    pm2_5: 14.0,
    pm10: 25.0,
    outdoor_temperature: 33.5,
    outdoor_humidity: 68.0,
  });
  const [simResult, setSimResult] = useState<IndoorOutdoorResult | null>(null);
  const [simHeuristic, setSimHeuristic] = useState<IndoorOutdoorHeuristicResult | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  const loadData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      try {
        const [locsRes, healthRes, alertsRes] = await Promise.all([
          api.getLocations().catch(() => []),
          api.getHealth().catch(() => null),
          api.getAlerts({ limit: 5 }).catch(() => []),
        ]);

        setLocations(locsRes);
        setHealth(healthRes);
        setRecentAlerts(alertsRes);

        const activeLoc = selectedLocation || locsRes[0]?.id || "main-gate";

        const [latestRes, historyRes] = await Promise.all([
          api.getLatestReadings(activeLoc).catch(() => null),
          api
            .getReadingsHistory({ locationId: activeLoc, hours: 24, limit: 24 })
            .catch(() => ({ items: [] })),
        ]);

        setLatestReading(latestRes as ReadingItem | null);
        setRecentReadings(historyRes.items || []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedLocation],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fallback to network IP geolocation
  const fallbackToDeviceIpLocation = useCallback(async (reason?: string) => {
    setGeoStatus("requesting");
    try {
      const devLoc = await api.getDeviceLocation();
      const lat = devLoc.latitude;
      const lon = devLoc.longitude;
      const acc = devLoc.accuracy_m || 5000;

      setLatitude(lat);
      setLongitude(lon);
      setGpsAccuracy(acc);
      setGeoStatus("granted");
      setPlaceName(devLoc.display_name || `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);

      toast.info(
        reason
          ? `${reason} Falling back to network IP location (${devLoc.display_name}).`
          : `Device location resolved: ${devLoc.display_name}`,
      );

      // Fetch ambient weather from Open-Meteo
      setWeatherLoading(true);
      try {
        const w = await api.getAmbientWeather(lat, lon);
        setWeatherData(w);
        toast.success(
          `Outdoor Weather: ${w.temperature?.toFixed(1)}°C, ${w.humidity?.toFixed(1)}% RH (${w.weather_description})`,
        );
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch ambient weather");
      } finally {
        setWeatherLoading(false);
      }
    } catch {
      setGeoStatus("denied");
      toast.error("Could not resolve device location via GPS or network IP.");
    }
  }, []);

  const handleDetectLocation = useCallback(() => {
    const isSecure =
      typeof window !== "undefined" &&
      (window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    if (typeof navigator === "undefined" || !navigator.geolocation || !isSecure) {
      fallbackToDeviceIpLocation("Browser GPS restricted on non-HTTPS network origin.");
      return;
    }

    setGeoStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        setLatitude(lat);
        setLongitude(lon);
        setGpsAccuracy(acc);
        setGeoStatus("granted");
        toast.success(`Location acquired via GPS: ±${Math.round(acc)}m accuracy`);

        // Reverse geocode via backend helper
        try {
          const geoRes = await api.reverseGeocode(lat, lon);
          if (geoRes && geoRes.display_name) {
            setPlaceName(geoRes.display_name);
          }
        } catch {
          setPlaceName(`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
        }

        // Fetch ambient weather from Open-Meteo
        setWeatherLoading(true);
        try {
          const w = await api.getAmbientWeather(lat, lon);
          setWeatherData(w);
          toast.success(
            `Outdoor Weather: ${w.temperature?.toFixed(1)}°C, ${w.humidity?.toFixed(1)}% RH (${w.weather_description})`,
          );
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to fetch ambient weather");
        } finally {
          setWeatherLoading(false);
        }
      },
      () => {
        fallbackToDeviceIpLocation("Browser GPS permission not granted.");
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 60000,
      },
    );
  }, [fallbackToDeviceIpLocation]);

  // Handler for test reading submission
  const handleTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTest(true);
    try {
      const payload = {
        location_id: testForm.location_id,
        device_id: testForm.device_id,
        pm1_0: Number(testForm.pm1_0),
        pm2_5: Number(testForm.pm2_5),
        pm10: Number(testForm.pm10),
        temperature: Number(testForm.temperature),
        humidity: Number(testForm.humidity),
        data_source: "manual",
        environment_label: testForm.environment_label,
      };

      const result = await api.createReading(payload);
      toast.success(
        `Test reading persisted (AQI: ${result.indicative_aqi ?? "—"} · ${result.indicative_category || "Standard"})`,
      );
      setTestModalOpen(false);
      if (testForm.location_id !== selectedLocation) {
        setSelectedLocation(testForm.location_id);
      }
      await loadData(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to persist test reading");
    } finally {
      setSubmittingTest(false);
    }
  };

  const applyTestPreset = (type: "clean" | "ambient" | "smog") => {
    if (type === "clean") {
      setTestForm((prev) => ({
        ...prev,
        device_id: "HEPA-CLEAN-01",
        pm1_0: 4.5,
        pm2_5: 8.0,
        pm10: 15.0,
        temperature: 22.5,
        humidity: 45.0,
        environment_label: "indoor",
      }));
    } else if (type === "ambient") {
      setTestForm((prev) => ({
        ...prev,
        device_id: "OUTDOOR-AMBIENT-01",
        pm1_0: 18.0,
        pm2_5: 38.0,
        pm10: 75.0,
        temperature: 31.0,
        humidity: 62.0,
        environment_label: "outdoor",
      }));
    } else {
      setTestForm((prev) => ({
        ...prev,
        device_id: "HEAVY-DUST-01",
        pm1_0: 55.0,
        pm2_5: 145.0,
        pm10: 280.0,
        temperature: 34.0,
        humidity: 70.0,
        environment_label: "outdoor",
      }));
    }
  };

  const locName = locations.find((l) => l.id === selectedLocation)?.name || selectedLocation;

  // Run interactive classifier simulation
  const runClassifierSimulation = useCallback(
    async (customParams?: SimFormState, forceOutdoor?: boolean) => {
      const params = customParams || simForm;
      const isOutdoor = forceOutdoor !== undefined ? forceOutdoor : isDemoOutdoor;
      setSimulating(true);
      try {
        const [predRes, heurRes] = await Promise.all([
          api.predictIndoorOutdoor({
            temperature_c: params.temperature,
            temperature: params.temperature,
            humidity_pct: params.humidity,
            humidity: params.humidity,
            outdoor_reference_temperature_c: params.outdoor_temperature,
            outdoor_temperature: params.outdoor_temperature,
            outdoor_reference_humidity_pct: params.outdoor_humidity,
            outdoor_humidity: params.outdoor_humidity,
            temperature_delta_c: Math.round((params.temperature - params.outdoor_temperature) * 100) / 100,
            humidity_delta_pct: Math.round((params.humidity - params.outdoor_humidity) * 100) / 100,
            pm1_0: params.pm1_0,
            pm2_5: params.pm2_5,
            pm10: params.pm10,
            hour_of_day: new Date().getHours(),
            temporal_hour: new Date().getHours(),
            is_manual_entry: true,
            location_name: placeName || locName,
            latitude: latitude,
            longitude: longitude,
            data_source: "manual_simulation",
          }).catch(() => null),
          api.evaluateIndoorOutdoorHeuristic({
            local_temperature: params.temperature,
            local_humidity: params.humidity,
            outdoor_temperature: params.outdoor_temperature,
            outdoor_humidity: params.outdoor_humidity,
            pm1_0: params.pm1_0,
            pm2_5: params.pm2_5,
            pm10: params.pm10,
            local_temp_source: "manual",
            local_pm_source: "manual",
            outdoor_source: "Open-Meteo Baseline",
            latitude: latitude,
            longitude: longitude,
            location_name: placeName || locName,
          }).catch(() => null),
        ]);

        setSimResult(predRes);
        setSimHeuristic(heurRes);
      } finally {
        setSimulating(false);
      }
    },
    [simForm, isDemoOutdoor, placeName, locName, latitude, longitude],
  );

  const handleToggleDummyLocation = (turnOutdoor?: boolean) => {
    if (turnOutdoor !== undefined) {
      demoActions.setEnvironment(turnOutdoor ? "outdoor" : "indoor");
    } else {
      demoActions.toggleEnvironment();
    }
    toast.info(
      (!isDemoOutdoor)
        ? "Duplicate Location / Demo Sensor: Switched to ON — Outdoor Demo (Temp 29–36°C · Predictions: Outdoor)"
        : "Duplicate Location / Demo Sensor: Switched to OFF — Indoor Demo (Temp 25–28°C · Predictions: Indoor)",
    );
  };

  // Automatically run initial simulation when entering simulator tab if not already computed
  useEffect(() => {
    if (activeTab === "simulator" && !simResult && !simulating && !isDemoActive) {
      runClassifierSimulation(undefined, isDemoOutdoor);
    }
  }, [activeTab, isDemoOutdoor, isDemoActive, runClassifierSimulation, simResult, simulating]);

  // Prepare chart data chronologically: use demo history in demo mode; real readings in normal mode
  const chartData = isDemoActive
    ? demoState.history.map((h) => ({
        time: h.time,
        AQI: h.AQI,
        "PM2.5": h["PM2.5"],
        PM10: h.PM10,
        temperature: h.temperature,
        humidity: h.humidity,
      }))
    : [...recentReadings]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((r) => ({
          time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          AQI: r.indicative_aqi ?? 0,
          "PM2.5": r.pm2_5,
          PM10: r.pm10,
          temperature: r.temperature,
          humidity: r.humidity,
        }));

  return (
    <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
      <PageHeader
        title="AirPurify AI — Home Dashboard"
        description={`Active Location: ${locName} · Standard: ${health?.aqi_standard || "CPCB"}`}
      >
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger className="w-48 bg-card">
            <SelectValue placeholder="Select Location" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name} ({loc.environment_type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <Button size="sm" onClick={() => setTestModalOpen(true)} className="gap-1.5">
          <PlusCircle className="size-3.5" /> Submit Air Test
        </Button>
      </PageHeader>

      {/* Top Navigation Tabs on Home Page */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-3">
          <TabsList className="grid grid-cols-2 h-11 p-1 bg-muted/80 rounded-xl w-full sm:w-auto">
            <TabsTrigger
              value="overview"
              className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
            >
              <LayoutDashboard className="size-4" />
              Home Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="simulator"
              className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
            >
              <BrainCircuit className="size-4 text-primary" />
              Classifier Simulator
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium text-xs border border-primary/20">
              <Sparkles className="size-3" /> Multi-Parametric Environmental Verification
            </span>
          </div>
        </div>

        {/* Tab 1: Overview Dashboard */}
        <TabsContent value="overview" className="mt-0 space-y-6 focus-visible:outline-none">
          {/* Backend & DB Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              Persistence Engine:{" "}
              {health?.database.type === "mongodb_atlas"
                ? "MongoDB Atlas (Primary Cluster)"
                : "MongoDB (Active In-Memory Adapter)"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Database:{" "}
              <span className="font-mono">{health?.database.db_name || "airpurify_ai"}</span> ·{" "}
              {health?.database.details || "Ready"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BackendBadge
            connected={health?.database.connected ?? false}
            type={health?.database.type}
          />
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs text-secondary-foreground font-mono">
            API {health?.version || "v1.0.0"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Phase 2 Review Telemetry Controller & Duplicate Location Banner */}
          {isDemoActive ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-card via-amber-500/5 to-primary/10 p-3.5 shadow-xs">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-10 items-center justify-center rounded-lg border shadow-xs transition-colors ${
                    isDemoOutdoor
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-blue-500/15 border-blue-500/30 text-blue-400"
                  }`}
                >
                  {isDemoOutdoor ? (
                    <TreePine className="size-5 text-emerald-500" />
                  ) : (
                    <Building className="size-5 text-blue-500" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Duplicate Location / Demo Sensor
                    </span>
                    <Badge
                      variant="default"
                      className={`text-[10px] font-mono tracking-wider font-semibold ${
                        isDemoOutdoor
                          ? "bg-emerald-600 text-white hover:bg-emerald-600"
                          : "bg-blue-600 text-white hover:bg-blue-600"
                      }`}
                    >
                      {isDemoOutdoor ? "ON — Outdoor Demo" : "OFF — Indoor Demo"}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40">
                      <RefreshCw className="size-2.5 animate-spin text-primary" /> Auto-updates in {demoState.secondsRemaining}s
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono tracking-wider border-amber-500/40 text-amber-400 bg-amber-500/10"
                    >
                      SIMULATED DATA — PHASE 2 REVIEW
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isDemoOutdoor
                      ? "Simulated outdoor readings (Temp 29–36°C, RH 45–85%, CPCB Indicative AQI). Forced consensus: OUTDOOR."
                      : "Simulated indoor room readings (Temp 25–28°C, RH 40–65%, CPCB Indicative AQI). Forced consensus: INDOOR."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => demoActions.toggleEnvironment()}
                  className={`h-8 px-3.5 text-xs font-semibold gap-1.5 shadow-sm transition-all ${
                    isDemoOutdoor
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isDemoOutdoor ? (
                    <>
                      <Building className="size-3.5" />
                      Switch to: OFF — Indoor Demo
                    </>
                  ) : (
                    <>
                      <TreePine className="size-3.5" />
                      Switch to: ON — Outdoor Demo
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => demoActions.setDemoMode(false)}
                  className="h-8 text-xs font-medium border-border"
                >
                  Return to Real Hardware
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-foreground">Real Hardware Sensor Mode</span>
                <span className="text-muted-foreground">· ESP32 + Plantower PMS7003 Telemetry</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => demoActions.setDemoMode(true)}
                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
              >
                Activate Phase 2 Review Demo Mode
              </Button>
            </div>
          )}

          {/* Prominent Feature Cards: Live AQI & Weather, and Indoor vs Outdoor Estimation */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <LiveAqiWeatherCard
              reading={activeReading}
              loading={loading || refreshing}
              locationName={locName}
              locationId={selectedLocation}
              standard={health?.aqi_standard || "CPCB"}
              health={health}
              weatherData={activeWeather}
              weatherLoading={weatherLoading}
              geoStatus={geoStatus}
              geoAccuracy={gpsAccuracy}
              placeName={placeName}
              onDetectLocation={handleDetectLocation}
              onRefresh={() => loadData(true)}
              onOpenTestModal={() => setTestModalOpen(true)}
            />
            <IndoorOutdoorCard
              reading={activeReading}
              weatherData={activeWeather}
              geoStatus={geoStatus}
              geoAccuracy={gpsAccuracy}
              placeName={placeName}
              latitude={latitude}
              longitude={longitude}
              onDetectLocation={handleDetectLocation}
              onRefreshParent={() => loadData(true)}
              onOpenClassifierModal={() => {
                handleTabChange("simulator");
                window.scrollTo({ top: 0, behavior: "smooth" });
                if (!simResult && !isDemoActive) {
                  runClassifierSimulation();
                }
              }}
            />
          </div>

          {!activeReading ? (
            <EmptyState
              title={`No stored measurements recorded for ${locName}`}
              hint="The database currently holds no physical or manual test readings for this station. Submit an air quality observation using the Location & Air Testing tool."
              action={
                <Button onClick={() => setTestModalOpen(true)} className="gap-1.5">
                  <PlusCircle className="mr-1.5 size-4" /> Record Test Reading
                </Button>
              }
            />
          ) : (
            <>
              {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              title="Indicative AQI"
              value={String(activeReading.indicative_aqi ?? "—")}
              badge={
                activeReading.indicative_aqi ? (
                  <AqiBadge aqi={activeReading.indicative_aqi} />
                ) : undefined
              }
              tooltip="Sub-index calculated according to Indian CPCB standard piecewise linear breakpoints (PM-based indicative estimate)."
            />
            <KpiCard
              title="PM2.5"
              value={String(activeReading.pm2_5)}
              unit="µg/m³"
              tooltip="Fine particulate matter concentration."
            />
            <KpiCard
              title="PM10"
              value={String(activeReading.pm10)}
              unit="µg/m³"
              tooltip="Coarse particulate matter concentration."
            />
            <KpiCard
              title="PM1.0"
              value={String(activeReading.pm1_0)}
              unit="µg/m³"
              tooltip="Ultrafine particulate matter concentration."
            />
            <KpiCard
              title="Temperature"
              value={`${activeReading.temperature}°`}
              unit="C"
              tooltip="Ambient air temperature."
            />
            <KpiCard
              title="Humidity"
              value={`${activeReading.humidity}%`}
              unit="RH"
              tooltip="Relative humidity percentage."
            />
          </div>

          {/* Reading Metadata Details */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground border border-border/50">
            <span>
              Latest Reading:{" "}
              <strong className="text-foreground">
                {new Date(activeReading.timestamp).toLocaleTimeString()} · {new Date(activeReading.timestamp).toLocaleDateString()}
              </strong>
            </span>
            <span>
              Source:{" "}
              <span className={`font-semibold uppercase tracking-wider ${isDemoActive ? "text-amber-400" : "text-primary"}`}>
                {activeReading.data_source}
              </span>
              {activeReading.device_id && ` · Device: ${activeReading.device_id}`}
            </span>
            <span>
              Environment:{" "}
              <strong className="capitalize text-foreground">
                {activeReading.environment_label || "Unknown"}
              </strong>
            </span>
            <span>
              Quality Status:{" "}
              <strong className={isDemoActive ? "text-amber-400 uppercase" : "text-emerald-500 uppercase"}>
                {activeReading.data_quality}
              </strong>
            </span>
          </div>

          {/* Charts & Alerts Grid */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Recent 24-Hour Measurements ({locName})
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono">
                  24h Telemetry
                </span>
              </CardHeader>
              <CardContent className="h-72">
                {chartData.length < 2 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Accumulating time-series data. Record more test readings to view dynamic trends.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <ReferenceLine
                        y={100}
                        stroke="#d9a81c"
                        strokeDasharray="3 3"
                        label={{ value: "CPCB Moderate (100)", fontSize: 10, fill: "#d9a81c" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="AQI"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="PM2.5"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="PM10"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Recent Alerts</CardTitle>
                <span className="text-xs text-muted-foreground font-mono">
                  Live Thresholds
                </span>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {recentAlerts.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <ShieldCheck className="size-8 text-emerald-500 mb-2" />
                    All air quality parameters within normal thresholds.
                  </div>
                ) : (
                  recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-border p-3 text-xs space-y-1 bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded ${
                            alert.severity === "critical"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(alert.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{alert.message}</p>
                      <p className="text-muted-foreground text-[11px]">
                        Observed:{" "}
                        <strong className="text-foreground">{alert.observed_value}</strong> · Limit:{" "}
                        {alert.threshold}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
            </>
          )}
        </>
      )}
        </TabsContent>

        {/* Tab 2: Classifier Simulator */}
        <TabsContent value="simulator" className="mt-0 space-y-6 focus-visible:outline-none">
          <ClassifierSimulatorView
            simForm={simForm}
            setSimForm={setSimForm}
            simResult={simResult}
            simHeuristic={simHeuristic}
            simulating={simulating}
            onRunSimulation={(params) => runClassifierSimulation(params, isDemoOutdoor)}
            currentReading={activeReading}
            weatherData={activeWeather}
            dummyLocationOutdoor={isDemoOutdoor}
            onToggleDummyLocation={handleToggleDummyLocation}
            onSelectDummyMode={(outdoor) => handleToggleDummyLocation(outdoor)}
          />
        </TabsContent>
      </Tabs>

      {/* Test Reading Submission Modal */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="size-5 text-primary" />
              Submit Air Quality Observation
            </DialogTitle>
            <DialogDescription>
              Record an environmental observation to MongoDB Atlas. Feeds live AQI calculation, time-series charts, and micro-climate inference.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTestSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="target-location" className="text-xs font-semibold">Monitoring Station</Label>
                <Select value={testForm.location_id} onValueChange={(val) => setTestForm(prev => ({ ...prev, location_id: val }))}>
                  <SelectTrigger id="target-location" className="h-9 text-xs">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id} className="text-xs">
                        {loc.name} ({loc.environment_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="device-id" className="text-xs font-semibold">Device / Node Tag</Label>
                <Input
                  id="device-id"
                  className="h-9 text-xs font-mono"
                  value={testForm.device_id}
                  onChange={(e) => setTestForm(prev => ({ ...prev, device_id: e.target.value }))}
                  placeholder="e.g. ESP32-PMS7003-TEST"
                />
              </div>
            </div>

            {/* Quick Benchmark Presets */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Benchmark Presets</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => applyTestPreset("clean")}
                >
                  Indoor Clean HEPA
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => applyTestPreset("ambient")}
                >
                  Outdoor Ambient
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => applyTestPreset("smog")}
                >
                  High Dust Smog
                </Button>
              </div>
            </div>

            {/* Particulate Inputs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="pm1" className="text-xs">PM1.0 (µg/m³)</Label>
                <Input
                  id="pm1"
                  type="number"
                  step="0.1"
                  className="h-9 text-xs font-mono"
                  value={testForm.pm1_0}
                  onChange={(e) => setTestForm(prev => ({ ...prev, pm1_0: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm25" className="text-xs">PM2.5 (µg/m³)</Label>
                <Input
                  id="pm25"
                  type="number"
                  step="0.1"
                  className="h-9 text-xs font-mono"
                  value={testForm.pm2_5}
                  onChange={(e) => setTestForm(prev => ({ ...prev, pm2_5: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm10" className="text-xs">PM10 (µg/m³)</Label>
                <Input
                  id="pm10"
                  type="number"
                  step="0.1"
                  className="h-9 text-xs font-mono"
                  value={testForm.pm10}
                  onChange={(e) => setTestForm(prev => ({ ...prev, pm10: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
            </div>

            {/* Environmental Climate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="temperature" className="text-xs">Temperature (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  className="h-9 text-xs font-mono"
                  value={testForm.temperature}
                  onChange={(e) => setTestForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="humidity" className="text-xs">Humidity (% RH)</Label>
                <Input
                  id="humidity"
                  type="number"
                  step="0.1"
                  className="h-9 text-xs font-mono"
                  value={testForm.humidity}
                  onChange={(e) => setTestForm(prev => ({ ...prev, humidity: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Environment Label</Label>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="env_label"
                    checked={testForm.environment_label === "indoor"}
                    onChange={() => setTestForm(prev => ({ ...prev, environment_label: "indoor" }))}
                  />
                  Indoor Environment
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="env_label"
                    checked={testForm.environment_label === "outdoor"}
                    onChange={() => setTestForm(prev => ({ ...prev, environment_label: "outdoor" }))}
                  />
                  Outdoor Environment
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTestModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingTest} className="gap-1.5">
                {submittingTest && <RefreshCw className="size-3 animate-spin" />}
                Persist Reading to Database
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Classifier Simulator Modal */}
      <Dialog open={classifierModalOpen} onOpenChange={setClassifierModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <ClassifierSimulatorView
            simForm={simForm}
            setSimForm={setSimForm}
            simResult={simResult}
            simHeuristic={simHeuristic}
            simulating={simulating}
            onRunSimulation={(params) => runClassifierSimulation(params, isDemoOutdoor)}
            currentReading={activeReading}
            weatherData={activeWeather}
            dummyLocationOutdoor={isDemoOutdoor}
            onToggleDummyLocation={handleToggleDummyLocation}
            onSelectDummyMode={(outdoor) => handleToggleDummyLocation(outdoor)}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
