import csv
import io
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import StreamingResponse

from ..dependencies import get_database
from ..schemas import ReadingCreateSchema, ReadingResponseSchema, ReadingsListResponse
from ..services.aqi import calculate_aqi_data
from ..services.alert_engine import evaluate_reading_for_alerts

router = APIRouter(prefix="/readings", tags=["Sensor Readings"])


@router.post("", response_model=ReadingResponseSchema, status_code=201)
def create_reading(reading_in: ReadingCreateSchema, db=Depends(get_database)):
    # Look up location name
    loc = db.locations.find_one({"id": reading_in.location_id})
    loc_name = loc["name"] if loc else reading_in.location_id

    # If environment_label was unknown, use location's default if available
    env_label = reading_in.environment_label
    if (not env_label or env_label == "unknown") and loc:
        env_label = loc.get("environment_type", "unknown")

    # Compute indicative AQI
    aqi_result = calculate_aqi_data(
        pm2_5=reading_in.pm2_5,
        pm10=reading_in.pm10,
        pm1_0=reading_in.pm1_0
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    record_ts = reading_in.timestamp or now_iso

    reading_doc = {
        "id": f"SR-{uuid.uuid4().hex[:8]}",
        "device_id": reading_in.device_id,
        "location_id": reading_in.location_id,
        "location_name": loc_name,
        "environment_label": env_label,
        "timestamp": record_ts,
        "server_received_at": now_iso,
        "pm1_0": reading_in.pm1_0,
        "pm2_5": reading_in.pm2_5,
        "pm10": reading_in.pm10,
        "temperature": reading_in.temperature,
        "humidity": reading_in.humidity,
        "temp_humidity_source": reading_in.temp_humidity_source or ("sensor" if reading_in.temperature is not None and reading_in.data_source == "sensor" else ("manual" if reading_in.temperature is not None else None)),
        "data_source": reading_in.data_source,
        "data_quality": "valid",
        "indicative_aqi": aqi_result["indicative_aqi"],
        "indicative_category": aqi_result["indicative_category"],
        "indicative_color": aqi_result["indicative_color"],
        "health_guidance": aqi_result.get("health_guidance"),
    }

    db.sensor_readings.insert_one(reading_doc)

    # Evaluate for alerts
    try:
        evaluate_reading_for_alerts(reading_doc, db)
    except Exception:
        pass

    # Exclude MongoDB internal _id
    reading_doc.pop("_id", None)
    return reading_doc


@router.get("/latest")
def get_latest_readings(
    location_id: Optional[str] = Query(default=None),
    all_locations: bool = Query(default=False),
    db=Depends(get_database)
):
    """
    Returns latest persisted air quality reading:
    - If location_id is provided and location_id != 'all': latest reading for that location.
    - If all_locations is True: latest reading for each registered location.
    - Otherwise (location_id is None or 'all'): the overall latest persisted air-quality reading.
    """
    if location_id and location_id != "all":
        doc = db.sensor_readings.find_one(
            {"location_id": location_id},
            sort=[("timestamp", -1)]
        )
        if not doc:
            return None
        doc.pop("_id", None)
        return doc

    if all_locations:
        locations = list(db.locations.find({}))
        results = []
        for loc in locations:
            latest = db.sensor_readings.find_one(
                {"location_id": loc["id"]},
                sort=[("timestamp", -1)]
            )
            if latest:
                latest.pop("_id", None)
                results.append(latest)
        return results

    # Overall latest persisted reading across all locations
    doc = db.sensor_readings.find_one({}, sort=[("timestamp", -1)])
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


@router.get("/history", response_model=ReadingsListResponse)
def get_readings_history(
    location_id: Optional[str] = Query(default=None),
    hours: Optional[int] = Query(default=None, ge=1, le=8760),
    environment_label: Optional[str] = Query(default=None),
    data_source: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    db=Depends(get_database)
):
    query = {}
    if location_id and location_id != "all":
        query["location_id"] = location_id
    if environment_label and environment_label != "all":
        query["environment_label"] = environment_label
    if data_source and data_source != "all":
        query["data_source"] = data_source
    if hours:
        since_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        query["timestamp"] = {"$gte": since_time}

    total = db.sensor_readings.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.sensor_readings.find(query).sort("timestamp", -1).skip(skip).limit(limit)

    items = []
    for doc in cursor:
        doc.pop("_id", None)
        items.append(doc)

    total_pages = (total + limit - 1) // limit if limit > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.get("/export/csv")
def export_readings_csv(
    location_id: Optional[str] = Query(default=None),
    hours: Optional[int] = Query(default=None),
    db=Depends(get_database)
):
    """Exports actual stored MongoDB readings to CSV."""
    query = {}
    if location_id and location_id != "all":
        query["location_id"] = location_id
    if hours:
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        query["timestamp"] = {"$gte": since}

    cursor = db.sensor_readings.find(query).sort("timestamp", -1).limit(5000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Record ID", "Device ID", "Location ID", "Location Name", "Environment",
        "Timestamp (UTC)", "PM1.0 (ug/m3)", "PM2.5 (ug/m3)", "PM10 (ug/m3)",
        "Temperature (C)", "Humidity (%)", "Data Source", "Data Quality",
        "Indicative AQI", "Category"
    ])

    for doc in cursor:
        writer.writerow([
            doc.get("id"),
            doc.get("device_id", ""),
            doc.get("location_id"),
            doc.get("location_name"),
            doc.get("environment_label"),
            doc.get("timestamp"),
            doc.get("pm1_0"),
            doc.get("pm2_5"),
            doc.get("pm10"),
            doc.get("temperature"),
            doc.get("humidity"),
            doc.get("data_source"),
            doc.get("data_quality"),
            doc.get("indicative_aqi", ""),
            doc.get("indicative_category", "")
        ])

    output.seek(0)
    filename = f"airpurify_readings_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
