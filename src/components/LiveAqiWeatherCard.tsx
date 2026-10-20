import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Wind,
  Thermometer,
  Droplets,
  CloudSun,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Clock,
  MapPin,
  Cpu,
  Info,
  Radio,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PlusCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AqiBadge, getAqiCategoryInfo } from "@/components/aq";
import { type ReadingItem, type AmbientWeatherResult, type SystemHealth } from "@/lib/api";

interface LiveAqiWeatherCardProps {
  reading: ReadingItem | null;
  loading: boolean;
  locationName: string;
  locationId: string;
  standard: string;
  health: SystemHealth | null;
  weatherData: AmbientWeatherResult | null;
  weatherLoading: boolean;
  geoStatus: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout";
  geoAccuracy: number | null;
  placeName: string | null;
  onDetectLocation: () => void;
  onRefresh: () => void;
  onOpenTestModal?: () => void;
}

export function LiveAqiWeatherCard({
  reading,
  loading,
  locationName,
  standard,
  health,
  weatherData,
  weatherLoading,
  geoStatus,
  geoAccuracy,
  placeName,
  onDetectLocation,
  onRefresh,
  onOpenTestModal,
}: LiveAqiWeatherCardProps) {
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // Data freshness and staleness calculation
  const readingTime = reading ? new Date(reading.timestamp).getTime() : null;
  const now = Date.now();
  const ageMinutes = readingTime ? Math.max(0, Math.floor((now - readingTime) / 60000)) : null;
  const isStale = ageMinutes !== null && ageMinutes > 15;

  const aqiScore = reading?.indicative_aqi ?? null;
  const aqiCategory = reading?.indicative_category ?? (aqiScore ? getAqiCategoryInfo(aqiScore).category : "Unknown");
  const aqiColor = aqiScore ? getAqiCategoryInfo(aqiScore).hex : "#888888";

  // PMS7003 measurement awareness
  const hasLocalTemp = reading?.temperature !== null && reading?.temperature !== undefined;
  const hasLocalHumidity = reading?.humidity !== null && reading?.humidity !== undefined;

  return (
    <Card className="relative overflow-hidden border-border/80 bg-card shadow-sm transition-all hover:shadow-md">
      {/* Top accent gradient bar */}
      <div
        className="h-1.5 w-full transition-colors duration-500"
        style={{
          background: aqiScore
            ? `linear-gradient(90deg, ${aqiColor} 0%, var(--primary) 100%)`
            : "var(--border)",
        }}
      />

      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Radio className="size-4 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                Live AQI & Environmental Analysis
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  {standard || "CPCB"} Standard
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="size-3" /> Station: <strong className="text-foreground">{locationName}</strong>
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Hardware & Stream Status Badges */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {reading ? (
            <>
              {reading.data_source === "demo" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                  SIMULATED SENSOR DATA — PHASE 2 REVIEW
                </span>
              ) : isStale ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-medium text-amber-500">
                  <AlertTriangle className="size-3" />
                  Stale Data ({ageMinutes > 120 ? `${Math.floor(ageMinutes / 60)} hrs` : `${ageMinutes} mins`} ago)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-500">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Sensor Stream ({ageMinutes}m ago)
                </span>
              )}

              <Badge
                variant="secondary"
                className="text-[10px] font-mono uppercase tracking-wider"
              >
                Source: {reading.data_source === "demo" ? "DEMO SENSOR" : (reading.data_source === "sensor" ? "ESP32 + PMS7003" : reading.data_source)}
              </Badge>

              {reading.device_id && (
                <span className="text-muted-foreground font-mono text-[10px]">
                  ID: {reading.device_id}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-medium text-amber-500">
              <Clock className="size-3" />
              Waiting for sensor data (ESP32 Offline)
            </span>
          )}

          <span className="text-muted-foreground ml-auto text-[10px]">
            API: <strong className="text-foreground">{health?.status === "healthy" ? "Online" : "Connecting"}</strong>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!reading ? (
          /* Empty / Waiting State */
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Cpu className="mx-auto size-10 text-muted-foreground/60 mb-3 animate-pulse" />
            <h4 className="text-sm font-semibold text-foreground">Waiting for Sensor Data</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              No physical ESP32 or PMS7003 sensor packet has been received yet for station &ldquo;{locationName}&rdquo;.
              Power on the hardware sensor or submit a test record from the testing center.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {onOpenTestModal ? (
                <Button size="sm" variant="outline" onClick={onOpenTestModal} className="gap-1.5">
                  <PlusCircle className="size-3.5" /> Record Test Reading
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
                  <RefreshCw className={`mr-1 size-3 ${loading ? "animate-spin" : ""}`} /> Check Connection
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading}>
                <RefreshCw className={`mr-1 size-3 ${loading ? "animate-spin" : ""}`} /> Check Connection
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* AQI Score Highlight Box */}
            <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-12 sm:items-center">
                {/* Score Column */}
                <div className="sm:col-span-5 flex flex-col justify-center border-b sm:border-b-0 sm:border-r border-border/60 pb-3 sm:pb-0 sm:pr-4">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="text-5xl font-extrabold tracking-tight font-mono"
                      style={{ color: aqiColor }}
                    >
                      {aqiScore ?? "—"}
                    </span>
                    <div>
                      {aqiScore && <AqiBadge aqi={aqiScore} />}
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                        CPCB Indicative AQI (PM-based)
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs font-medium text-foreground">
                    Category: <span style={{ color: aqiColor }}>{aqiCategory}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {reading.health_guidance || "Minimal impact. Clean air posing negligible health risk."}
                  </p>
                  <p className="text-[9px] text-muted-foreground/75 italic mt-1 border-t border-border/30 pt-1">
                    * Indicative sub-index from PM2.5/PM10. Full official CPCB NAQI requires gaseous monitors (NO2, SO2, CO, O3).
                  </p>
                </div>

                {/* Particulate Concentrations Column */}
                <div className="sm:col-span-7 space-y-3 sm:pl-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Wind className="size-3.5 text-primary" />
                      PMS7003 Particulate Telemetry
                    </span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      Concentration in µg/m³
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2.5 text-center border border-border/40">
                      <p className="text-[10px] text-muted-foreground">PM1.0 (Ultrafine)</p>
                      <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                        {reading.pm1_0}
                      </p>
                      <p className="text-[9px] text-muted-foreground">µg/m³</p>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-2.5 text-center border border-border/40">
                      <p className="text-[10px] text-muted-foreground">PM2.5 (Fine)</p>
                      <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                        {reading.pm2_5}
                      </p>
                      <p className="text-[9px] text-muted-foreground">µg/m³</p>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-2.5 text-center border border-border/40">
                      <p className="text-[10px] text-muted-foreground">PM10 (Coarse)</p>
                      <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                        {reading.pm10}
                      </p>
                      <p className="text-[9px] text-muted-foreground">µg/m³</p>
                    </div>
                  </div>

                  {/* Particulate ratio context */}
                  {reading.pm10 > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20 px-2 py-1 rounded">
                      <span>
                        PM2.5 / PM10 Ratio:{" "}
                        <strong className="text-foreground font-mono">
                          {(reading.pm2_5 / reading.pm10).toFixed(2)}
                        </strong>
                      </span>
                      <span className="text-[10px]">
                        {reading.pm2_5 / reading.pm10 < 0.4
                          ? "Crustal coarse dust dominance"
                          : reading.pm2_5 / reading.pm10 > 0.6
                            ? "Fine combustion/sub-micron signature"
                            : "Mixed particulate profile"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible AQI Calculation Explanation */}
              <div className="mt-3 pt-3 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="flex w-full items-center justify-between text-xs text-primary hover:underline focus:outline-none"
                >
                  <span className="flex items-center gap-1">
                    <Info className="size-3.5" />
                    How is this AQI value calculated under CPCB?
                  </span>
                  {showExplanation ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>

                {showExplanation && (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground border border-border/40">
                    <p>
                      <strong className="text-foreground">CPCB Standard Rule:</strong> Official CPCB NAQI requires at least 3 monitored pollutants with at least one being particulate (PM2.5 or PM10). When monitoring using a particulate-only PMS7003 sensor, the system provides an <strong>Indicative Particulate AQI</strong> based on the piecewise linear maximum sub-index formula.
                    </p>
                    <p>
                      <strong className="text-amber-500 font-semibold">Important Distinction:</strong> Raw PM2.5 concentration ({reading.pm2_5} µg/m³) is <em>not</em> the AQI score. The CPCB sub-index maps concentrations to standardized health breakpoints ({aqiCategory}).
                    </p>
                    <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                      Calculated from latest sensor observation received at {new Date(reading.timestamp).toLocaleTimeString()} ({new Date(reading.timestamp).toLocaleDateString()}).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Local Environment vs Outdoor Weather Baseline Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Box 1: Local Environmental Climate */}
              <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Thermometer className="size-3.5 text-primary" />
                    Local Environmental Climate
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {hasLocalTemp ? (reading.temp_humidity_source || "Separate Sensor") : "PMS7003 PM-Only"}
                  </Badge>
                </div>

                {hasLocalTemp && hasLocalHumidity ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Local Temp</p>
                      <p className="text-base font-bold font-mono text-foreground">
                        {reading.temperature?.toFixed(1)}°C
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Local Humidity</p>
                      <p className="text-base font-bold font-mono text-foreground">
                        {reading.humidity?.toFixed(1)}% RH
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 p-2.5 text-xs text-muted-foreground border border-border/40">
                    <p className="text-[11px] leading-relaxed">
                      PMS7003 measures particulate matter only. No separate temperature/humidity sensor is connected to this station.
                    </p>
                    <p className="text-[10px] text-primary mt-1">
                      Outdoor weather values are not substituted as indoor sensor readings.
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Timestamp: {new Date(reading.timestamp).toLocaleTimeString()}
                </p>
              </div>

              {/* Box 2: Outdoor Ambient Weather (Open-Meteo) */}
              <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <CloudSun className="size-3.5 text-sky-500" />
                    Outdoor Ambient Weather
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    Open-Meteo API
                  </Badge>
                </div>

                {geoStatus === "granted" && weatherData ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Outdoor Temp</p>
                        <p className="text-base font-bold font-mono text-foreground">
                          {weatherData.temperature?.toFixed(1)}°C
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Outdoor Humidity</p>
                        <p className="text-base font-bold font-mono text-foreground">
                          {weatherData.humidity?.toFixed(1)}% RH
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Condition: <strong className="text-foreground">{weatherData.weather_description}</strong></span>
                      {weatherData.wind_speed_10m !== undefined && (
                        <span>Wind: {weatherData.wind_speed_10m} km/h</span>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground truncate" title={placeName || undefined}>
                      Location: <strong className="text-foreground">{placeName || "GPS Coordinates"}</strong>
                      {geoAccuracy && ` (±${Math.round(geoAccuracy)}m)`}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 p-2.5 text-xs text-muted-foreground border border-border/40 space-y-2">
                    <p className="text-[11px]">
                      {geoStatus === "denied"
                        ? "Location permission denied. Ambient outdoor weather unavailable."
                        : geoStatus === "requesting"
                          ? "Acquiring browser GPS coordinates..."
                          : "Enable browser geolocation to retrieve outdoor ambient weather from Open-Meteo."}
                    </p>
                    {geoStatus !== "requesting" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onDetectLocation}
                        disabled={weatherLoading}
                        className="h-7 text-xs w-full gap-1"
                      >
                        <MapPin className="size-3" />
                        {geoStatus === "denied" ? "Retry Geolocation" : "Detect Location for Outdoor Baseline"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
