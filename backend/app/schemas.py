from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ReadingCreateSchema(BaseModel):
    location_id: str
    device_id: Optional[str] = None
    pm1_0: float = Field(..., ge=0, le=1000, description="PM1.0 in ug/m3")
    pm2_5: float = Field(..., ge=0, le=1000, description="PM2.5 in ug/m3")
    pm10: float = Field(..., ge=0, le=1500, description="PM10 in ug/m3")
    temperature: Optional[float] = Field(default=None, ge=-50, le=70, description="Temperature in deg C (None if PMS7003 without separate temp sensor)")
    humidity: Optional[float] = Field(default=None, ge=0, le=100, description="Relative humidity in % (None if PMS7003 without separate humidity sensor)")
    temp_humidity_source: Optional[str] = Field(default=None, description="sensor, weather_api, manual, or none")
    timestamp: Optional[str] = None
    data_source: str = Field(default="manual", description="sensor, manual, weather_api, or simulation")
    environment_label: Optional[str] = Field(default="unknown", description="indoor, outdoor, or unknown")


class ReadingResponseSchema(BaseModel):
    id: str
    device_id: Optional[str] = None
    location_id: str
    location_name: str
    environment_label: Optional[str] = "unknown"
    timestamp: str
    server_received_at: str
    pm1_0: float
    pm2_5: float
    pm10: float
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    temp_humidity_source: Optional[str] = None
    data_source: str
    data_quality: str
    indicative_aqi: Optional[int] = None
    indicative_category: Optional[str] = None
    indicative_color: Optional[str] = None
    health_guidance: Optional[str] = None


class ReadingsListResponse(BaseModel):
    items: List[ReadingResponseSchema]
    total: int
    page: int
    limit: int
    total_pages: int


class LocationCreateSchema(BaseModel):
    id: str
    name: str
    campus_area: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    environment_type: str = "unknown"
    description: Optional[str] = None


class LocationResponseSchema(BaseModel):
    id: str
    name: str
    campus_area: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    environment_type: str
    description: Optional[str] = None
    created_at: str


class AQICalculateRequest(BaseModel):
    pm2_5: float = Field(..., ge=0, le=1000)
    pm10: Optional[float] = Field(default=None, ge=0, le=1500)
    pm1_0: Optional[float] = Field(default=None, ge=0, le=1000)
    temperature: Optional[float] = Field(default=None, ge=-50, le=70)
    humidity: Optional[float] = Field(default=None, ge=0, le=100)
    no2: Optional[float] = Field(default=None, ge=0)
    so2: Optional[float] = Field(default=None, ge=0)
    co: Optional[float] = Field(default=None, ge=0)
    o3: Optional[float] = Field(default=None, ge=0)
    nh3: Optional[float] = Field(default=None, ge=0)
    pb: Optional[float] = Field(default=None, ge=0)


class AQICalculateResponse(BaseModel):
    standard: str = "CPCB"
    calculation_method: str = "CPCB NAQI Piecewise Linear Interpolation (Max sub-index formula)"
    official_status: str  # "available" or "unavailable"
    official_reason: Optional[str] = None
    official_aqi: Optional[int] = None
    official_category: Optional[str] = None
    indicative_aqi: int
    indicative_category: str
    indicative_color: str
    dominant_pollutant: str
    sub_indices: Dict[str, Optional[int]]
    concentrations: Dict[str, Optional[float]]
    available_measurements: List[str] = Field(default_factory=list)
    missing_inputs: List[str] = Field(default_factory=list)
    health_guidance: str
    summary: str


class AmbientWeatherResponse(BaseModel):
    provider: str
    latitude: float
    longitude: float
    elevation: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    weather_code: Optional[int] = None
    weather_description: str
    wind_speed_10m: Optional[float] = None
    surface_pressure: Optional[float] = None
    observation_timestamp: str
    units: Dict[str, str]
    is_model_estimate: bool = True
    observation_type: str
    disclaimer: str


class ReverseGeocodeResponse(BaseModel):
    display_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    latitude: float
    longitude: float
    source: str


class IndoorOutdoorPredictRequest(BaseModel):
    temperature: float = Field(..., ge=-50, le=70)
    humidity: float = Field(..., ge=0, le=100)
    pm1_0: float = Field(..., ge=0, le=1000)
    pm2_5: float = Field(..., ge=0, le=1000)
    pm10: float = Field(..., ge=0, le=1500)
    temporal_hour: Optional[int] = Field(default=None, ge=0, le=23)
    is_manual_entry: bool = True
    location_id: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    location_name: Optional[str] = None
    gps_accuracy_m: Optional[float] = None
    data_source: Optional[str] = Field(default="manual")
    weather_provider: Optional[str] = None
    observation_timestamp: Optional[str] = None


class IndoorOutdoorPredictResponse(BaseModel):
    predicted_class: str  # "Indoor", "Outdoor", "Unknown"
    prediction_timestamp: str
    model_version: str
    model_status: str  # "trained", "model_not_configured"
    confidence_score: Optional[float] = None
    input_feature_availability: Dict[str, bool]
    feature_importance: Optional[Dict[str, float]] = None
    notes: str
    data_source: Optional[str] = None
    location_context: Optional[Dict[str, Any]] = None
    heuristic_evaluation: Optional[Dict[str, Any]] = None
    scientific_disclaimer: Optional[str] = None


class IndoorOutdoorHeuristicRequest(BaseModel):
    local_temperature: Optional[float] = Field(default=None, ge=-50, le=70)
    local_humidity: Optional[float] = Field(default=None, ge=0, le=100)
    outdoor_temperature: Optional[float] = Field(default=None, ge=-50, le=70)
    outdoor_humidity: Optional[float] = Field(default=None, ge=0, le=100)
    pm1_0: Optional[float] = Field(default=None, ge=0, le=1000)
    pm2_5: Optional[float] = Field(default=None, ge=0, le=1000)
    pm10: Optional[float] = Field(default=None, ge=0, le=1500)
    local_temp_source: Optional[str] = "sensor"
    local_pm_source: Optional[str] = "sensor"
    outdoor_source: Optional[str] = "Open-Meteo Weather API"
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    location_name: Optional[str] = None
    gps_accuracy_m: Optional[float] = None
    observation_timestamp: Optional[str] = None


class IndoorOutdoorHeuristicResponse(BaseModel):
    estimate: str  # "Likely indoor", "Likely outdoor", or "Inconclusive"
    evaluation_type: str = "rule_based_heuristic"
    summary: str
    explanation: str
    influencing_factors: List[str] = Field(default_factory=list)
    scientific_disclaimer: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    sources: Dict[str, Any] = Field(default_factory=dict)
    evaluation_timestamp: str


class ForecastResponseItem(BaseModel):
    timestamp: str
    horizon_hours: int
    predicted_aqi: int
    category: str
    confidence_interval: Optional[List[int]] = None


class ForecastResponse(BaseModel):
    location_id: str
    location_name: str
    model_status: str  # "trained" or "model_not_configured"
    model_architecture: str = "1D-CNN-BiGRU"
    target_horizon_hours: int
    issued_at: str
    forecasts: List[ForecastResponseItem]
    baseline_comparison: Optional[Dict[str, Any]] = None
    message: str


class ForecastStatusResponse(BaseModel):
    model_architecture: str = "1D-CNN-BiGRU (1D Convolution + Bidirectional GRU)"
    target_variable: str = "CPCB AQI / PM2.5 hourly time-series"
    model_status: str  # "trained" or "model_not_configured"
    model_version: str
    artifact_path: str
    is_model_loaded: bool
    sequence_length_hours: int = 12
    forecast_horizon_hours: int = 6
    split_strategy: str = "Strict chronological split: 70% train, 15% validation, 15% test (zero future data leakage)"
    feature_scaling: str = "MinMaxScaler fitted strictly on training partition"
    features_monitored: List[str] = ["pm2_5", "pm10", "temperature", "humidity", "temporal_hour"]
    baseline_benchmark: str = "Persistence model (y_(t+h) = y_t)"
    evaluation_metrics: List[str] = ["MAE", "RMSE", "R2"]
    training_data_period: Optional[str] = None
    operational_requirements: List[str] = Field(default_factory=list)
    message: str


class AlertResponseSchema(BaseModel):
    id: str
    severity: str
    alert_type: str
    message: str
    location_id: str
    location_name: str
    pollutant: Optional[str] = None
    threshold: Optional[str] = None
    observed_value: Optional[str] = None
    status: str
    forecast_based: bool
    created_at: str
    updated_at: str


class AlertUpdateSchema(BaseModel):
    status: str = Field(..., pattern="^(Active|Acknowledged|Resolved)$")


class ProfileUpdateSchema(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None


class SettingsUpdateSchema(BaseModel):
    theme: Optional[str] = None
    preferred_dashboard: Optional[str] = None
    default_location: Optional[str] = None
    default_time_range: Optional[str] = None
    temp_unit: Optional[str] = None
    refresh_interval_sec: Optional[int] = None
    aqi_standard: Optional[str] = None
    alert_pm25_threshold: Optional[float] = None
    alert_pm10_threshold: Optional[float] = None
    alert_aqi_threshold: Optional[int] = None
