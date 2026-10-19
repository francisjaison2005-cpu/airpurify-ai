from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SensorReadingModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: Optional[str] = None
    location_id: str
    location_name: str
    environment_label: Optional[str] = "unknown"  # "indoor", "outdoor", "unknown"
    timestamp: str = Field(default_factory=utc_now_iso)
    server_received_at: str = Field(default_factory=utc_now_iso)
    pm1_0: float = Field(..., ge=0, le=1000)
    pm2_5: float = Field(..., ge=0, le=1000)
    pm10: float = Field(..., ge=0, le=1500)
    temperature: float = Field(..., ge=-20, le=70)
    humidity: float = Field(..., ge=0, le=100)
    data_source: str = "sensor"  # "sensor", "manual", "simulation"
    data_quality: str = "valid"  # "valid", "flagged", "missing"
    # Derived air quality fields
    indicative_aqi: Optional[int] = None
    indicative_category: Optional[str] = None
    indicative_color: Optional[str] = None


class LocationModel(BaseModel):
    id: str
    name: str
    campus_area: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None  # {"lat": 12.9716, "lng": 77.5946}
    environment_type: str = "unknown"  # "indoor", "outdoor"
    description: Optional[str] = None
    created_at: str = Field(default_factory=utc_now_iso)


class AlertModel(BaseModel):
    id: str = Field(default_factory=lambda: f"AL-{uuid.uuid4().hex[:6].upper()}")
    severity: str = "warning"  # "critical", "warning", "info"
    alert_type: str  # "threshold_exceeded", "sensor_delayed", "forecast_warning", "data_quality"
    message: str
    location_id: str
    location_name: str
    pollutant: Optional[str] = None  # "PM2.5", "PM10", "AQI", "Temperature", "Humidity"
    threshold: Optional[str] = None
    observed_value: Optional[str] = None
    status: str = "Active"  # "Active", "Acknowledged", "Resolved"
    forecast_based: bool = False
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class UserProfileModel(BaseModel):
    id: str = "default_user"
    display_name: str = "AirPurify Administrator"
    email: str = "admin@airpurify.ai"
    role: str = "Research Administrator"
    avatar: str = "FJ"
    bio: Optional[str] = "Phase 1 Environmental Research & IoT Fleet Lead"
    updated_at: str = Field(default_factory=utc_now_iso)


class AppSettingsModel(BaseModel):
    theme: str = "system"  # "light", "dark", "system"
    preferred_dashboard: str = "/"
    default_location: str = "main-gate"
    default_time_range: str = "24"  # "1", "6", "24", "168", "720" (hours)
    temp_unit: str = "C"  # "C", "F"
    refresh_interval_sec: int = 30
    aqi_standard: str = "CPCB"
    alert_pm25_threshold: float = 60.0
    alert_pm10_threshold: float = 100.0
    alert_aqi_threshold: int = 150
    updated_at: str = Field(default_factory=utc_now_iso)
