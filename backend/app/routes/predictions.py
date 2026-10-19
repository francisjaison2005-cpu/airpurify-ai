from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException

from ..dependencies import get_database
from ..schemas import (
    AQICalculateRequest,
    AQICalculateResponse,
    IndoorOutdoorPredictRequest,
    IndoorOutdoorPredictResponse,
    ForecastResponse,
    ForecastStatusResponse,
)
from ..services.aqi import calculate_aqi_data
from ..services.indoor_outdoor import predict_indoor_outdoor
from ..services.forecasting import get_aqi_forecast, get_forecast_status

router = APIRouter(prefix="/predictions", tags=["Predictions & ML Analysis"])


@router.get("/forecast/status", response_model=ForecastStatusResponse)
def get_forecast_status_endpoint():
    """Reports 1D-CNNâ€“BiGRU short-term AQI forecasting model readiness, architecture specs, and requirements."""
    return get_forecast_status()


@router.post("/aqi-calculate", response_model=AQICalculateResponse)
def calculate_aqi_endpoint(req: AQICalculateRequest):
    """Calculates official CPCB AQI, data sufficiency validation, and particulate sub-indices."""
    result = calculate_aqi_data(
        pm2_5=req.pm2_5,
        pm10=req.pm10,
        pm1_0=req.pm1_0,
        no2=req.no2,
        so2=req.so2,
        co=req.co,
        o3=req.o3,
        nh3=req.nh3,
        pb=req.pb,
    )
    return result


@router.post("/indoor-outdoor", response_model=IndoorOutdoorPredictResponse)
def predict_indoor_outdoor_endpoint(req: IndoorOutdoorPredictRequest, db=Depends(get_database)):
    """
    Evaluates environmental features for indoor vs outdoor classification.
    Returns model_not_configured if model weights are not loaded.
    Persists evaluation request to classification_results collection.
    """
    result = predict_indoor_outdoor(
        temperature=req.temperature,
        humidity=req.humidity,
        pm1_0=req.pm1_0,
        pm2_5=req.pm2_5,
        pm10=req.pm10,
        temporal_hour=req.temporal_hour,
        is_manual_entry=req.is_manual_entry,
        location_id=req.location_id,
        latitude=req.latitude,
        longitude=req.longitude,
        location_name=req.location_name,
        gps_accuracy_m=req.gps_accuracy_m,
        data_source=req.data_source,
        weather_provider=req.weather_provider,
        observation_timestamp=req.observation_timestamp,
    )

    # Save to MongoDB classification_results collection
    try:
        log_entry = {
            **result,
            "inputs": req.model_dump(),
            "created_at": result["prediction_timestamp"]
        }
        db.classification_results.insert_one(log_entry)
    except Exception:
        pass

    return result


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast_endpoint(
    location_id: str = Query(default="main-gate"),
    horizon_hours: int = Query(default=6, ge=1, le=24),
    db=Depends(get_database)
):
    """
    Retrieves short-term 1D-CNNâ€“BiGRU forecasts.
    Returns model_not_configured if model weights are not configured.
    """
    loc = db.locations.find_one({"id": location_id})
    loc_name = loc["name"] if loc else location_id

    forecast_data = get_aqi_forecast(
        location_id=location_id,
        location_name=loc_name,
        horizon_hours=horizon_hours,
        db=db
    )
    return forecast_data

