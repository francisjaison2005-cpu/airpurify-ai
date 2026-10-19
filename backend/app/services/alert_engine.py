from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import uuid

from ..models import AlertModel


def evaluate_reading_for_alerts(
    reading: Dict[str, Any],
    db: Any,
    thresholds: Optional[Dict[str, float]] = None
) -> List[Dict[str, Any]]:
    """
    Evaluates a single sensor reading against configurable thresholds and creates alerts.
    Implements deduplication: if an active alert for the same location and pollutant exists,
    does not create a duplicate active alert.
    """
    if db is None:
        return []

    alerts_created = []
    now_iso = datetime.now(timezone.utc).isoformat()
    location_id = reading.get("location_id", "unknown")
    location_name = reading.get("location_name", location_id)

    # Defaults
    pm25_thresh = thresholds.get("pm25", 60.0) if thresholds else 60.0
    pm10_thresh = thresholds.get("pm10", 100.0) if thresholds else 100.0
    aqi_thresh = thresholds.get("aqi", 150) if thresholds else 150

    pm2_5 = reading.get("pm2_5", 0.0)
    pm10 = reading.get("pm10", 0.0)
    indicative_aqi = reading.get("indicative_aqi") or 0
    temp = reading.get("temperature", 25.0)
    hum = reading.get("humidity", 50.0)

    checks = []

    # Check 1: Severe AQI
    if indicative_aqi > aqi_thresh:
        checks.append({
            "severity": "critical" if indicative_aqi > 250 else "warning",
            "alert_type": "threshold_exceeded",
            "message": f"Indicative AQI ({indicative_aqi}) crossed threshold ({aqi_thresh})",
            "pollutant": "AQI",
            "threshold": f"> {aqi_thresh}",
            "observed_value": str(indicative_aqi)
        })

    # Check 2: PM2.5
    if pm2_5 > pm25_thresh:
        checks.append({
            "severity": "critical" if pm2_5 > 120 else "warning",
            "alert_type": "threshold_exceeded",
            "message": f"PM2.5 ({pm2_5} µg/m³) exceeded threshold ({pm25_thresh} µg/m³)",
            "pollutant": "PM2.5",
            "threshold": f"> {pm25_thresh} µg/m³",
            "observed_value": f"{pm2_5} µg/m³"
        })

    # Check 3: PM10
    if pm10 > pm10_thresh:
        checks.append({
            "severity": "warning",
            "alert_type": "threshold_exceeded",
            "message": f"PM10 ({pm10} µg/m³) exceeded threshold ({pm10_thresh} µg/m³)",
            "pollutant": "PM10",
            "threshold": f"> {pm10_thresh} µg/m³",
            "observed_value": f"{pm10} µg/m³"
        })

    # Check 4: Humidity extreme
    if hum < 15.0 or hum > 95.0:
        checks.append({
            "severity": "info",
            "alert_type": "data_quality",
            "message": f"Relative humidity ({hum}%) is in extreme range (<15% or >95%)",
            "pollutant": "Humidity",
            "threshold": "15–95%",
            "observed_value": f"{hum}%"
        })

    for check in checks:
        # Deduplication query: look for an existing Active alert for this location + pollutant
        existing = db.alerts.find_one({
            "location_id": location_id,
            "pollutant": check["pollutant"],
            "status": "Active"
        })

        if existing:
            # Active alert already exists; update its timestamp and observed value
            db.alerts.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "observed_value": check["observed_value"],
                    "updated_at": now_iso
                }}
            )
        else:
            # Create fresh active alert
            alert_doc = {
                "id": f"AL-{uuid.uuid4().hex[:6].upper()}",
                "severity": check["severity"],
                "alert_type": check["alert_type"],
                "message": check["message"],
                "location_id": location_id,
                "location_name": location_name,
                "pollutant": check["pollutant"],
                "threshold": check["threshold"],
                "observed_value": check["observed_value"],
                "status": "Active",
                "forecast_based": False,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            db.alerts.insert_one(alert_doc)
            alerts_created.append(alert_doc)

    return alerts_created
