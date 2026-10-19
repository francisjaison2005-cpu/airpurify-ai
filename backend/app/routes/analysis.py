import json
import urllib.request
from fastapi import APIRouter, Depends, Query, HTTPException
from ..dependencies import get_database
from ..schemas import (
    AQICalculateRequest,
    AQICalculateResponse,
    IndoorOutdoorPredictRequest,
    IndoorOutdoorPredictResponse,
    IndoorOutdoorHeuristicRequest,
    IndoorOutdoorHeuristicResponse,
    AmbientWeatherResponse,
    ReverseGeocodeResponse,
)
from ..services.aqi import calculate_aqi_data
from ..services.indoor_outdoor import predict_indoor_outdoor, evaluate_indoor_outdoor_heuristic
from ..services.weather import get_ambient_weather, reverse_geocode

router = APIRouter(prefix="/analysis", tags=["Air Quality & Environmental Analysis"])


@router.post("/aqi", response_model=AQICalculateResponse)
def calculate_aqi_analysis_endpoint(req: AQICalculateRequest):
    """
    Calculates official CPCB NAQI and indicative particulate AQI.
    Enforces CPCB data completeness rules, breakpoints, and sub-index interpolation.
    Returns calculation method, available measurements, missing inputs, and health guidance.
    """
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


@router.get("/ambient-weather", response_model=AmbientWeatherResponse)
def get_ambient_weather_endpoint(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
):
    """
    Fetches real-time ambient outdoor meteorological conditions (temperature, humidity)
    for the provided geographical coordinates from Open-Meteo Weather API.
    Values are explicitly labelled as outdoor assimilation estimates.
    """
    try:
        data = get_ambient_weather(latitude, longitude)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Weather service error: {str(e)}")


@router.get("/reverse-geocode", response_model=ReverseGeocodeResponse)
def get_reverse_geocode_endpoint(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
):
    """
    Reverse geocodes coordinates to a human-readable place name using OpenStreetMap Nominatim.
    """
    try:
        data = reverse_geocode(latitude, longitude)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Reverse geocode error: {str(e)}")


@router.post("/indoor-outdoor", response_model=IndoorOutdoorPredictResponse)
def classify_indoor_outdoor_endpoint(req: IndoorOutdoorPredictRequest, db=Depends(get_database)):
    """
    Evaluates environmental features (temperature, relative humidity, particulate matter)
    alongside location and data source provenance for indoor vs outdoor classification.
    Returns model_not_configured with explicit scientific contract when weights are unconfigured.
    Persists evaluation records to MongoDB Atlas classification_results collection.
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

    try:
        log_entry = {
            **result,
            "inputs": req.model_dump(),
            "created_at": result["prediction_timestamp"],
        }
        db.classification_results.insert_one(log_entry)
    except Exception:
        pass

    return result


@router.post("/indoor-outdoor-heuristic", response_model=IndoorOutdoorHeuristicResponse)
def evaluate_indoor_outdoor_heuristic_endpoint(req: IndoorOutdoorHeuristicRequest):
    """
    Evaluates rule-based heuristic for indoor vs outdoor estimation by comparing local sensor readings
    (temperature, humidity, particulate matter) against ambient weather conditions.
    Explicitly labelled as a heuristic rule-based estimate, not a trained ML model.
    """
    result = evaluate_indoor_outdoor_heuristic(
        local_temperature=req.local_temperature,
        local_humidity=req.local_humidity,
        outdoor_temperature=req.outdoor_temperature,
        outdoor_humidity=req.outdoor_humidity,
        pm1_0=req.pm1_0,
        pm2_5=req.pm2_5,
        pm10=req.pm10,
        local_temp_source=req.local_temp_source,
        local_pm_source=req.local_pm_source,
        outdoor_source=req.outdoor_source,
        latitude=req.latitude,
        longitude=req.longitude,
        location_name=req.location_name,
        gps_accuracy_m=req.gps_accuracy_m,
        observation_timestamp=req.observation_timestamp,
    )
    return result


@router.get("/device-location")
def get_device_location():
    """
    Resolves device location via IP geolocation service.
    Useful when browser Geolocation is restricted by insecure contexts.
    """
    try:
        req = urllib.request.Request("http://ip-api.com/json/", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "success":
                return {
                    "latitude": data.get("lat"),
                    "longitude": data.get("lon"),
                    "city": data.get("city"),
                    "region": data.get("regionName"),
                    "country": data.get("country"),
                    "display_name": f"{data.get('city')}, {data.get('regionName')}, {data.get('country')}",
                    "source": "network_ip",
                    "accuracy_m": 5000.0,
                }
    except Exception:
        pass
    return {
        "latitude": 13.0827,
        "longitude": 80.2707,
        "city": "Chennai",
        "region": "Tamil Nadu",
        "country": "India",
        "display_name": "Chennai, Tamil Nadu, India",
        "source": "fallback_regional",
        "accuracy_m": 10000.0,
    }
