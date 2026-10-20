function resolveApiBase(): string {
  const envBase = typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_API_BASE : undefined;
  if (envBase && typeof envBase === "string" && envBase.trim().length > 0) {
    let clean = envBase.trim().replace(/\/+$/, "");
    if (!clean.endsWith("/api")) {
      clean = `${clean}/api`;
    }
    return clean;
  }
  return typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000/api"
    : "/api";
}

export const API_BASE = resolveApiBase();

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  aqi_standard: string;
  database: {
    connected: boolean;
    type: string;
    db_name: string;
    target?: string;
    details: string;
  };
  models: {
    indoor_outdoor_classifier: {
      configured: boolean;
      status: string;
      version: string;
      path: string;
    };
    aqi_forecaster_1d_cnn_bigru: {
      configured: boolean;
      status: string;
      version: string;
      path: string;
    };
  };
}

export interface LocationItem {
  id: string;
  name: string;
  campus_area?: string;
  coordinates?: { lat: number; lng: number };
  environment_type: "indoor" | "outdoor" | "unknown";
  description?: string;
  created_at: string;
}

export interface ReadingItem {
  id: string;
  device_id?: string;
  location_id: string;
  location_name: string;
  environment_label?: string;
  timestamp: string;
  server_received_at: string;
  pm1_0: number;
  pm2_5: number;
  pm10: number;
  temperature?: number | null;
  humidity?: number | null;
  temp_humidity_source?: string | null;
  data_source: "sensor" | "manual" | "simulation" | string;
  data_quality: string;
  indicative_aqi?: number;
  indicative_category?: string;
  indicative_color?: string;
  health_guidance?: string;
}

export interface ReadingsPage {
  items: ReadingItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AQICalculateResult {
  standard: string;
  calculation_method: string;
  official_status: "available" | "unavailable";
  official_reason?: string;
  official_aqi?: number;
  official_category?: string;
  indicative_aqi: number;
  indicative_category: string;
  indicative_color: string;
  dominant_pollutant: string;
  sub_indices: Record<string, number | null>;
  concentrations: Record<string, number | null>;
  available_measurements?: string[];
  missing_inputs?: string[];
  health_guidance: string;
  summary: string;
}

export interface ForecastStatusResult {
  model_architecture: string;
  target_variable: string;
  model_status: "trained" | "model_not_configured";
  model_version: string;
  artifact_path: string;
  is_model_loaded: boolean;
  sequence_length_hours: number;
  forecast_horizon_hours: number;
  split_strategy: string;
  feature_scaling: string;
  features_monitored: string[];
  baseline_benchmark: string;
  evaluation_metrics: string[];
  training_data_period?: string | null;
  operational_requirements: string[];
  message: string;
}

export interface AmbientWeatherResult {
  provider: string;
  latitude: number;
  longitude: number;
  elevation?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  weather_code?: number | null;
  weather_description: string;
  wind_speed_10m?: number | null;
  surface_pressure?: number | null;
  observation_timestamp: string;
  units: Record<string, string>;
  is_model_estimate: boolean;
  observation_type: string;
  disclaimer: string;
}

export interface ReverseGeocodeResult {
  display_name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  source: string;
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  display_name: string;
  source: "network_ip" | "browser_gps" | "fallback_regional";
  accuracy_m: number;
}

export interface IndoorOutdoorResult {
  predicted_class: "indoor" | "outdoor" | "Indoor" | "Outdoor" | "Insufficient Data" | "Unknown";
  class_probabilities?: Record<string, number> | null;
  confidence_score?: number | null;
  temperature_difference?: number | null;
  humidity_difference?: number | null;
  model_name?: string;
  model_version: string;
  model_status: "trained" | "model_not_configured" | "insufficient_data" | "error";
  dataset_provenance?: "synthetic" | string;
  uncalibrated_probability_note?: string;
  prediction_timestamp: string;
  input_feature_availability: Record<string, boolean>;
  feature_importance?: Record<string, number> | null;
  notes: string;
  data_source?: string | null;
  location_context?: {
    latitude?: number | null;
    longitude?: number | null;
    location_name?: string | null;
    gps_accuracy_m?: number | null;
    location_id?: string | null;
    weather_provider?: string | null;
    observation_timestamp?: string | null;
  } | null;
  heuristic_evaluation?: {
    status: string;
    label: string;
    indicative_signature: string;
    explanation: string;
  } | null;
  scientific_disclaimer?: string | null;
}

export interface IndoorOutdoorHeuristicResult {
  estimate: "Likely indoor" | "Likely outdoor" | "Inconclusive";
  evaluation_type: string;
  summary: string;
  explanation: string;
  influencing_factors: string[];
  scientific_disclaimer: string;
  metrics?: {
    local_temperature?: number | null | undefined;
    local_humidity?: number | null | undefined;
    outdoor_temperature?: number | null | undefined;
    outdoor_humidity?: number | null | undefined;
    temp_diff_c?: number | null | undefined;
    abs_temp_diff_c?: number | null | undefined;
    humidity_diff_pct?: number | null | undefined;
    abs_humidity_diff_pct?: number | null | undefined;
    pm1_0?: number | null | undefined;
    pm2_5?: number | null | undefined;
    pm10?: number | null | undefined;
    pm_ratio?: number | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    location_name?: string | null | undefined;
    gps_accuracy_m?: number | null | undefined;
  } | undefined;
  sources?: {
    local_temperature?: string | undefined;
    local_humidity?: string | undefined;
    particulates?: string | undefined;
    outdoor_weather?: string | undefined;
    location?: string | undefined;
  } | undefined;
  evaluation_timestamp: string;
}

export interface ForecastItem {
  timestamp: string;
  horizon_hours: number;
  predicted_aqi: number;
  category: string;
  confidence_interval?: [number, number];
}

export interface ForecastResult {
  location_id: string;
  location_name: string;
  model_status: "trained" | "model_not_configured";
  model_architecture: string;
  target_horizon_hours: number;
  issued_at: string;
  forecasts: ForecastItem[];
  baseline_comparison?: {
    model_mae: number;
    model_rmse: number;
    model_r2: number;
    persistence_mae: number;
    persistence_rmse: number;
    persistence_r2: number;
    mae_improvement_pct: number;
  } | null;
  message: string;
}

export interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  alert_type: string;
  message: string;
  location_id: string;
  location_name: string;
  pollutant?: string;
  threshold?: string;
  observed_value?: string;
  status: "Active" | "Acknowledged" | "Resolved";
  forecast_based: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertsSummary {
  active: number;
  acknowledged: number;
  resolved: number;
  critical_active: number;
  total: number;
}

export interface UserProfile {
  id: string;
  display_name: string;
  email: string;
  role: string;
  avatar: string;
  bio?: string;
  updated_at: string;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  preferred_dashboard: string;
  default_location: string;
  default_time_range: string;
  temp_unit: "C" | "F";
  refresh_interval_sec: number;
  aqi_standard: string;
  alert_pm25_threshold: number;
  alert_pm10_threshold: number;
  alert_aqi_threshold: number;
  updated_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    let parsedMessage = errorText;
    try {
      const json = JSON.parse(errorText);
      parsedMessage = json.detail || json.message || errorText;
    } catch {
      // Fall back to raw error text
    }
    throw new Error(parsedMessage || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  getHealth: () => request<SystemHealth>("/health"),

  getLocations: () => request<LocationItem[]>("/locations"),
  createLocation: (data: Partial<LocationItem>) =>
    request<LocationItem>("/locations", { method: "POST", body: JSON.stringify(data) }),

  getLatestReadings: (locationId?: string) =>
    request<ReadingItem | ReadingItem[]>(
      locationId
        ? `/readings/latest?location_id=${encodeURIComponent(locationId)}`
        : "/readings/latest",
    ),

  getReadingsHistory: (params: {
    locationId?: string;
    hours?: number;
    environmentLabel?: string;
    dataSource?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.locationId) q.append("location_id", params.locationId);
    if (params.hours) q.append("hours", String(params.hours));
    if (params.environmentLabel) q.append("environment_label", params.environmentLabel);
    if (params.dataSource) q.append("data_source", params.dataSource);
    if (params.page) q.append("page", String(params.page));
    if (params.limit) q.append("limit", String(params.limit));
    return request<ReadingsPage>(`/readings/history?${q.toString()}`);
  },

  createReading: (data: {
    location_id: string;
    device_id?: string;
    pm1_0: number;
    pm2_5: number;
    pm10: number;
    temperature: number;
    humidity: number;
    timestamp?: string;
    data_source?: string;
    environment_label?: string;
  }) => request<ReadingItem>("/readings", { method: "POST", body: JSON.stringify(data) }),

  calculateAqi: (data: {
    pm2_5: number;
    pm10?: number;
    pm1_0?: number;
    temperature?: number;
    humidity?: number;
    no2?: number;
    so2?: number;
    co?: number;
    o3?: number;
  }) =>
    request<AQICalculateResult>("/analysis/aqi", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAmbientWeather: (lat: number, lon: number) =>
    request<AmbientWeatherResult>(
      `/analysis/ambient-weather?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`,
    ),

  reverseGeocode: (lat: number, lon: number) =>
    request<ReverseGeocodeResult>(
      `/analysis/reverse-geocode?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`,
    ),

  getDeviceLocation: () => request<DeviceLocationResult>("/analysis/device-location"),

  predictIndoorOutdoor: (data: {
    temperature_c?: number | null;
    temperature?: number | null;
    humidity_pct?: number | null;
    humidity?: number | null;
    outdoor_reference_temperature_c?: number | null;
    outdoor_temperature?: number | null;
    outdoor_reference_humidity_pct?: number | null;
    outdoor_humidity?: number | null;
    temperature_delta_c?: number | null;
    humidity_delta_pct?: number | null;
    hour_of_day?: number | null;
    temporal_hour?: number | null;
    season?: "summer" | "monsoon" | "winter" | string | null;
    pm1_0?: number | null;
    pm2_5?: number | null;
    pm10?: number | null;
    is_manual_entry?: boolean;
    location_id?: string;
    latitude?: number | null;
    longitude?: number | null;
    location_name?: string | null;
    gps_accuracy_m?: number | null;
    data_source?: string;
    weather_provider?: string | null;
    observation_timestamp?: string;
  }) =>
    request<IndoorOutdoorResult>("/analysis/indoor-outdoor", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  evaluateIndoorOutdoorHeuristic: (data: {
    local_temperature?: number | null;
    local_humidity?: number | null;
    outdoor_temperature?: number | null;
    outdoor_humidity?: number | null;
    pm1_0?: number | null;
    pm2_5?: number | null;
    pm10?: number | null;
    local_temp_source?: string;
    local_pm_source?: string;
    outdoor_source?: string;
    latitude?: number | null;
    longitude?: number | null;
    location_name?: string | null;
    gps_accuracy_m?: number | null;
    observation_timestamp?: string | null;
  }) =>
    request<IndoorOutdoorHeuristicResult>("/analysis/indoor-outdoor-heuristic", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getForecast: (locationId: string, horizonHours = 6) =>
    request<ForecastResult>(
      `/predictions/forecast?location_id=${encodeURIComponent(locationId)}&horizon_hours=${horizonHours}`,
    ),

  getForecastStatus: () => request<ForecastStatusResult>("/predictions/forecast/status"),

  getAlerts: (params?: { status?: string; locationId?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append("status", params.status);
    if (params?.locationId) q.append("location_id", params.locationId);
    if (params?.limit) q.append("limit", String(params.limit));
    return request<AlertItem[]>(`/alerts?${q.toString()}`);
  },

  getAlertsSummary: () => request<AlertsSummary>("/alerts/summary"),

  updateAlertStatus: (alertId: string, status: "Active" | "Acknowledged" | "Resolved") =>
    request<AlertItem>(`/alerts/${alertId}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  getProfile: () => request<UserProfile>("/profile"),
  updateProfile: (data: Partial<UserProfile>) =>
    request<UserProfile>("/profile", { method: "PATCH", body: JSON.stringify(data) }),

  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (data: Partial<AppSettings>) =>
    request<AppSettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),

  getExportCsvUrl: (locationId?: string, hours?: number) => {
    const q = new URLSearchParams();
    if (locationId) q.append("location_id", locationId);
    if (hours) q.append("hours", String(hours));
    return `${API_BASE}/readings/export/csv?${q.toString()}`;
  },
};
