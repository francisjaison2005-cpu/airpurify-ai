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

  // Classifier Simulator states
  const [classifierModalOpen, setClassifierModalOpen] = useState<boolean>(false);
  const [dummyLocationOutdoor, setDummyLocationOutdoor] = useState<boolean>(false); // default fixed indoor (25-28C)
  const [autoTelemetryActive, setAutoTelemetryActive] = useState<boolean>(true); // 10s auto-telemetry for review
  const [autoUpdateCountdown, setAutoUpdateCountdown] = useState<number>(10);
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
      const isOutdoor = forceOutdoor !== undefined ? forceOutdoor : dummyLocationOutdoor;
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
    [simForm, dummyLocationOutdoor, placeName, locName, latitude, longitude],
  );

  // Generate continuous telemetry point for Phase 2 Review (10s once)
  const generateSimulatedTelemetry = useCallback(
    (isOutdoor: boolean) => {
      let temp: number;
      let hum: number;
      let pm1_0: number;
      let pm2_5: number;
      let pm10: number;
      let outdoorTemp: number;
      let outdoorHum: number;
      let aqi: number;

      if (isOutdoor) {
        // Outdoor Mode: temperature strictly 29°C and above
        temp = Number((29.5 + Math.random() * 3.5).toFixed(1)); // 29.5 to 33.0 °C
        hum = Number((62.0 + Math.random() * 8.0).toFixed(1));
        pm1_0 = Number((18.0 + Math.random() * 10.0).toFixed(1));
        pm2_5 = Number((46.0 + Math.random() * 22.0).toFixed(1));
        pm10 = Number((92.0 + Math.random() * 38.0).toFixed(1));
        outdoorTemp = Number((temp + (Math.random() * 0.8 - 0.4)).toFixed(1)); // closely tracking ambient
        outdoorHum = Number((hum + (Math.random() * 2.0 - 1.0)).toFixed(1));
        aqi = Math.round(105 + (pm2_5 - 40) * 1.2);
      } else {
        // Indoor Mode: temperature fixed strictly between 25.0 and 28.0 °C
        temp = Number((25.0 + Math.random() * 3.0).toFixed(1)); // 25.0 to 28.0 °C
        hum = Number((48.0 + Math.random() * 7.0).toFixed(1));
        pm1_0 = Number((5.0 + Math.random() * 3.5).toFixed(1));
        pm2_5 = Number((12.0 + Math.random() * 8.0).toFixed(1));
        pm10 = Number((22.0 + Math.random() * 14.0).toFixed(1));
        outdoorTemp = Number((33.0 + Math.random() * 2.0).toFixed(1)); // decoupled outdoor weather
        outdoorHum = Number((66.0 + Math.random() * 4.0).toFixed(1));
        aqi = Math.round(42 + pm2_5 * 0.9);
      }

      const ts = new Date().toISOString();
      const reading: ReadingItem = {
        id: `SIM-${Date.now()}`,
        device_id: "ESP32-AUTO-NODE",
        location_id: selectedLocation || "main-gate",
        location_name: locName,
        environment_label: isOutdoor ? "outdoor" : "indoor",
        timestamp: ts,
        server_received_at: ts,
        pm1_0: pm1_0,
        pm2_5: pm2_5,
        pm10: pm10,
        temperature: temp,
        humidity: hum,
        temp_humidity_source: "sensor",
        data_source: "sensor",
        data_quality: "valid",
        indicative_aqi: aqi,
        indicative_category: aqi <= 50 ? "Good" : aqi <= 100 ? "Satisfactory" : "Moderate",
        indicative_color: aqi <= 50 ? "#10b981" : aqi <= 100 ? "#84cc16" : "#f59e0b",
        health_guidance:
          aqi <= 50
            ? "Air quality is satisfactory and poses little or no health risk."
            : aqi <= 100
              ? "Acceptable air quality for standard activity."
              : "May cause breathing discomfort to sensitive individuals.",
      };

      setLatestReading(reading);
      setRecentReadings((prev) => {
        const next = [...prev, reading];
        return next.slice(-24);
      });

      setWeatherData({
        latitude: latitude ?? 13.0827,
        longitude: longitude ?? 80.2707,
        elevation_m: 10,
        temperature: outdoorTemp,
        humidity: outdoorHum,
        wind_speed_kmh: 12.0,
        weather_code: 1,
        weather_description: isOutdoor ? "Ambient Outdoor Tracking" : "Clear Sky / Decoupled Baseline",
        observation_time: ts,
        source: "Open-Meteo Baseline",
      });

      const nextSim: SimFormState = {
        temperature: temp,
        humidity: hum,
        pm1_0: pm1_0,
        pm2_5: pm2_5,
        pm10: pm10,
        outdoor_temperature: outdoorTemp,
        outdoor_humidity: outdoorHum,
      };
      setSimForm(nextSim);
      runClassifierSimulation(nextSim, isOutdoor);

      // Persist to database in background
      api.createReading({
        location_id: selectedLocation || "main-gate",
        device_id: "ESP32-AUTO-NODE",
        pm1_0: pm1_0,
        pm2_5: pm2_5,
        pm10: pm10,
        temperature: temp,
        humidity: hum,
        data_source: "sensor",
        environment_label: isOutdoor ? "outdoor" : "indoor",
      }).catch(() => {});
    },
    [selectedLocation, locName, latitude, longitude, runClassifierSimulation],
  );

  const handleToggleDummyLocation = (turnOutdoor?: boolean) => {
    const nextMode = turnOutdoor !== undefined ? turnOutdoor : !dummyLocationOutdoor;
    setDummyLocationOutdoor(nextMode);
    generateSimulatedTelemetry(nextMode);
    toast.info(
      nextMode
        ? "Dummy Location: Switched to Outdoor (Local Temp ≥ 29°C · Predictions: Outdoor)"
        : "Dummy Location: Switched to Indoor (Local Temp 25–28°C · Predictions: Indoor)",
    );
  };

  // 10-second auto-update timer for Phase 2 Review telemetry
  useEffect(() => {
    // Generate initial telemetry point on mount
    generateSimulatedTelemetry(dummyLocationOutdoor);

    if (!autoTelemetryActive) return;

    const interval = setInterval(() => {
      generateSimulatedTelemetry(dummyLocationOutdoor);
      setAutoUpdateCountdown(10);
    }, 10000); // 10 seconds once

    const countInterval = setInterval(() => {
      setAutoUpdateCountdown((prev) => (prev > 1 ? prev - 1 : 10));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countInterval);
    };
  }, [dummyLocationOutdoor, autoTelemetryActive, generateSimulatedTelemetry]);

  // Automatically run initial simulation when entering simulator tab if not already computed
  useEffect(() => {
    if (activeTab === "simulator" && !simResult && !simulating) {
      runClassifierSimulation(undefined, dummyLocationOutdoor);
    }
  }, [activeTab, dummyLocationOutdoor, runClassifierSimulation, simResult, simulating]);

  // Prepare chart data chronologically
  const chartData = [...recentReadings]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((r) => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      AQI: r.indicative_aqi ?? 0,
      "PM2.5": r.pm2_5,
      PM10: r.pm10,
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
          {/* Phase 2 Review Telemetry Controller & Dummy Location Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card to-primary/5 p-3.5 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                {dummyLocationOutdoor ? (
                  <TreePine className="size-4.5 text-emerald-500" />
                ) : (
                  <Building className="size-4.5 text-blue-500" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Phase 2 Review — Auto-Telemetry & Dummy Location
                  </span>
                  <Badge
                    variant={dummyLocationOutdoor ? "default" : "secondary"}
                    className={`text-[10px] font-mono tracking-wider font-semibold ${
                      dummyLocationOutdoor
                        ? "bg-emerald-600 text-white hover:bg-emerald-600"
                        : "bg-blue-600 text-white hover:bg-blue-600"
                    }`}
                  >
                    {dummyLocationOutdoor ? "OUTDOOR ACTIVE (≥ 29°C)" : "INDOOR ACTIVE (25–28°C)"}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40">
                    <RefreshCw className="size-2.5 animate-spin text-primary" /> Auto-updates in {autoUpdateCountdown}s
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {dummyLocationOutdoor
                    ? "Sensor offline fallback: Simulating outdoor environment (Temp ≥ 29°C, Moderate AQI, Outdoor classification)."
                    : "Sensor offline fallback: Simulating fixed indoor room (Temp 25–28°C, Good AQI, Indoor classification)."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleToggleDummyLocation()}
                className={`h-8 px-3.5 text-xs font-semibold gap-1.5 shadow-sm transition-all ${
                  dummyLocationOutdoor
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {dummyLocationOutdoor ? (
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

          {/* Prominent Feature Cards: Live AQI & Weather, and Indoor vs Outdoor Estimation */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <LiveAqiWeatherCard
              reading={latestReading}
              loading={loading || refreshing}
              locationName={locName}
              locationId={selectedLocation}
              standard={health?.aqi_standard || "CPCB"}
              health={health}
              weatherData={weatherData}
              weatherLoading={weatherLoading}
              geoStatus={geoStatus}
              geoAccuracy={gpsAccuracy}
              placeName={placeName}
              onDetectLocation={handleDetectLocation}
              onRefresh={() => loadData(true)}
              onOpenTestModal={() => setTestModalOpen(true)}
            />
            <IndoorOutdoorCard
              reading={latestReading}
              weatherData={weatherData}
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
                if (!simResult) {
                  runClassifierSimulation();
                }
              }}
            />
          </div>

          {!latestReading ? (
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
              value={String(latestReading.indicative_aqi ?? "—")}
              badge={
                latestReading.indicative_aqi ? (
                  <AqiBadge aqi={latestReading.indicative_aqi} />
                ) : undefined
              }
              tooltip="Sub-index calculated according to Indian CPCB standard piecewise linear breakpoints."
            />
            <KpiCard
              title="PM2.5"
              value={String(latestReading.pm2_5)}
              unit="µg/m³"
              tooltip="Fine particulate matter concentration."
            />
            <KpiCard
              title="PM10"
              value={String(latestReading.pm10)}
              unit="µg/m³"
              tooltip="Coarse particulate matter concentration."
            />
            <KpiCard
              title="PM1.0"
              value={String(latestReading.pm1_0)}
              unit="µg/m³"
              tooltip="Ultrafine particulate matter concentration."
            />
            <KpiCard
              title="Temperature"
              value={`${latestReading.temperature}°`}
              unit="C"
              tooltip="Ambient air temperature."
            />
            <KpiCard
              title="Humidity"
              value={`${latestReading.humidity}%`}
              unit="RH"
              tooltip="Relative humidity percentage."
            />
          </div>

          {/* Reading Metadata Details */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground border border-border/50">
            <span>
              Latest Reading:{" "}
              <strong className="text-foreground">
                {new Date(latestReading.timestamp).toLocaleString()} UTC
              </strong>
            </span>
            <span>
              Source:{" "}
              <span className="font-semibold uppercase tracking-wider text-primary">
                {latestReading.data_source}
              </span>
              {latestReading.device_id && ` · Device: ${latestReading.device_id}`}
            </span>
            <span>
              Environment:{" "}
              <strong className="capitalize text-foreground">
                {latestReading.environment_label || "Unknown"}
              </strong>
            </span>
            <span>
              Quality Status:{" "}
              <strong className="text-emerald-500 uppercase">{latestReading.data_quality}</strong>
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
            onRunSimulation={(params) => runClassifierSimulation(params, dummyLocationOutdoor)}
            currentReading={latestReading}
            weatherData={weatherData}
            dummyLocationOutdoor={dummyLocationOutdoor}
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
            onRunSimulation={(params) => runClassifierSimulation(params, dummyLocationOutdoor)}
            currentReading={latestReading}
            weatherData={weatherData}
            dummyLocationOutdoor={dummyLocationOutdoor}
            onToggleDummyLocation={handleToggleDummyLocation}
            onSelectDummyMode={(outdoor) => handleToggleDummyLocation(outdoor)}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
