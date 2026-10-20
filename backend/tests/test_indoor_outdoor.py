import pytest
from backend.app.services.indoor_outdoor import train_classifier_pipeline


def test_indoor_outdoor_unconfigured_model(client):
    payload = {
        "temperature": 25.5,
        "humidity": 55.0,
        "pm1_0": 12.0,
        "pm2_5": 24.0,
        "pm10": 45.0,
        "temporal_hour": 14,
        "is_manual_entry": True
    }
    res = client.post("/api/predictions/indoor-outdoor", json=payload)
    assert res.status_code == 200
    data = res.json()
    # Incomplete or unconfigured model returns appropriate status
    assert data["model_status"] in ("model_not_configured", "trained", "insufficient_data")
    if data["model_status"] in ("model_not_configured", "insufficient_data"):
        assert data["confidence_score"] is None
        assert data["predicted_class"] in ("Unknown", "Insufficient Data")
        assert data["input_feature_availability"]["pm2_5"] is True


def test_ambient_weather_endpoint(client):
    """Verifies that the Open-Meteo ambient weather endpoint returns live outdoor assimilation."""
    res = client.get("/api/analysis/ambient-weather?latitude=12.9716&longitude=77.5946")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "Open-Meteo Weather API"
    assert "temperature" in data
    assert "humidity" in data
    assert "units" in data
    assert "temperature" in data["units"]
    assert data["is_model_estimate"] is True
    assert "disclaimer" in data


def test_ambient_weather_invalid_coordinates(client):
    """Verifies coordinate validation bounds on the ambient weather endpoint."""
    res = client.get("/api/analysis/ambient-weather?latitude=150.0&longitude=77.5946")
    assert res.status_code == 422  # Pydantic validation error for latitude > 90


def test_reverse_geocode_endpoint(client):
    """Verifies reverse geocoding endpoint returns human-readable place name."""
    res = client.get("/api/analysis/reverse-geocode?latitude=12.9716&longitude=77.5946")
    assert res.status_code == 200
    data = res.json()
    assert "display_name" in data
    assert len(data["display_name"]) > 0


def test_indoor_outdoor_with_location_and_source(client):
    """Verifies indoor/outdoor endpoint preserves location metadata and provenance tag."""
    payload = {
        "temperature": 26.0,
        "humidity": 60.0,
        "pm1_0": 10.0,
        "pm2_5": 22.0,
        "pm10": 40.0,
        "temporal_hour": 12,
        "is_manual_entry": False,
        "latitude": 12.9716,
        "longitude": 77.5946,
        "location_name": "Bangalore Campus Core",
        "gps_accuracy_m": 14.5,
        "data_source": "weather_api",
        "weather_provider": "Open-Meteo Weather API",
        "observation_timestamp": "2026-10-18T01:00:00Z"
    }
    res = client.post("/api/analysis/indoor-outdoor", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["model_status"] in ("trained", "model_not_configured", "insufficient_data")
    if data["model_status"] == "trained":
        assert data["predicted_class"].lower() in ("indoor", "outdoor")
        assert data["confidence_score"] is not None
    else:
        assert data["predicted_class"] in ("Unknown", "Insufficient Data")
        assert data["confidence_score"] is None
        assert data["scientific_disclaimer"] is not None
    assert data["data_source"] == "weather_api"
    assert data["location_context"]["latitude"] == 12.9716
    assert data["location_context"]["location_name"] == "Bangalore Campus Core"
    assert data["location_context"]["gps_accuracy_m"] == 14.5
    assert data["heuristic_evaluation"]["status"] == "unvalidated_heuristic"


def test_indoor_outdoor_training_pipeline(tmp_path):
    dataset = [
        {"temperature": 22.0, "humidity": 45.0, "pm1_0": 5.0, "pm2_5": 12.0, "pm10": 20.0, "hour": 10, "label": "indoor"},
        {"temperature": 23.0, "humidity": 48.0, "pm1_0": 6.0, "pm2_5": 14.0, "pm10": 22.0, "hour": 11, "label": "indoor"},
        {"temperature": 21.5, "humidity": 42.0, "pm1_0": 4.5, "pm2_5": 10.0, "pm10": 18.0, "hour": 12, "label": "indoor"},
        {"temperature": 22.5, "humidity": 46.0, "pm1_0": 5.5, "pm2_5": 11.5, "pm10": 19.0, "hour": 13, "label": "indoor"},
        {"temperature": 24.0, "humidity": 49.0, "pm1_0": 7.0, "pm2_5": 15.0, "pm10": 25.0, "hour": 14, "label": "indoor"},
        {"temperature": 23.5, "humidity": 47.0, "pm1_0": 6.0, "pm2_5": 13.0, "pm10": 21.0, "hour": 15, "label": "indoor"},
        {"temperature": 32.0, "humidity": 70.0, "pm1_0": 22.0, "pm2_5": 55.0, "pm10": 110.0, "hour": 10, "label": "outdoor"},
        {"temperature": 34.0, "humidity": 65.0, "pm1_0": 28.0, "pm2_5": 65.0, "pm10": 130.0, "hour": 11, "label": "outdoor"},
        {"temperature": 35.0, "humidity": 62.0, "pm1_0": 30.0, "pm2_5": 72.0, "pm10": 145.0, "hour": 12, "label": "outdoor"},
        {"temperature": 33.5, "humidity": 68.0, "pm1_0": 25.0, "pm2_5": 58.0, "pm10": 115.0, "hour": 13, "label": "outdoor"},
        {"temperature": 31.0, "humidity": 72.0, "pm1_0": 20.0, "pm2_5": 48.0, "pm10": 98.0, "hour": 14, "label": "outdoor"},
        {"temperature": 30.5, "humidity": 75.0, "pm1_0": 18.0, "pm2_5": 44.0, "pm10": 90.0, "hour": 15, "label": "outdoor"},
    ]

    target_file = str(tmp_path / "test_rf_model.joblib")
    res = train_classifier_pipeline(dataset, save_path=target_file)
    assert res["status"] == "success"
    assert "accuracy" in res["evaluation_metrics"]
    assert res["evaluation_metrics"]["accuracy"] > 0.5


def test_heuristic_missing_local_climate():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    # PMS7003 only: PM measured, but local temperature & humidity missing
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=None,
        local_humidity=None,
        outdoor_temperature=32.0,
        outdoor_humidity=65.0,
        pm1_0=10.0,
        pm2_5=22.0,
        pm10=45.0,
    )
    assert res["estimate"] == "Inconclusive"
    assert "PMS7003" in res["explanation"]
    assert "Missing local temperature & humidity sensor" in res["influencing_factors"]
    assert "confidence_score" not in res  # zero fabricated confidence scores


def test_heuristic_missing_outdoor_baseline():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=24.0,
        local_humidity=50.0,
        outdoor_temperature=None,
        outdoor_humidity=None,
        pm1_0=8.0,
        pm2_5=18.0,
        pm10=35.0,
    )
    assert res["estimate"] == "Inconclusive"
    assert "Outdoor baseline weather data unavailable" in res["summary"]


def test_heuristic_contrasting_thermal_decoupling():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    # Local AC: 21.5°C, 45% RH vs Hot outdoor: 35.0°C, 68% RH (ΔT = 13.5°C, ΔRH = 23%)
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=21.5,
        local_humidity=45.0,
        outdoor_temperature=35.0,
        outdoor_humidity=68.0,
        pm1_0=6.0,
        pm2_5=14.0,
        pm10=22.0,
    )
    assert res["estimate"] == "Likely indoor"
    assert res["metrics"]["abs_temp_diff_c"] == 13.5
    assert "Thermal decoupling detected" in res["summary"]


def test_heuristic_similar_ambient_tracking():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    # Outdoor hot/humid: 33°C, 72% RH vs Local sensor: 32.8°C, 71% RH, coarse crustal dust PM10=80, PM2.5=24
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=32.8,
        local_humidity=71.0,
        outdoor_temperature=33.0,
        outdoor_humidity=72.0,
        pm1_0=12.0,
        pm2_5=24.0,
        pm10=80.0,
    )
    assert res["estimate"] == "Likely outdoor"
    assert "closely match" in res["summary"].lower()


def test_heuristic_contradictory_evidence():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    # Thermal decoupling (local 22°C vs outdoor 35°C), BUT heavy coarse road dust (PM10=120, PM2.5=25, ratio=0.21)
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=22.0,
        local_humidity=48.0,
        outdoor_temperature=35.0,
        outdoor_humidity=65.0,
        pm1_0=12.0,
        pm2_5=25.0,
        pm10=120.0,
    )
    assert res["estimate"] == "Inconclusive"
    assert "Contradictory" in res["summary"] or "conflicting" in res["explanation"].lower()


def test_heuristic_temperate_overlap():
    from backend.app.services.indoor_outdoor import evaluate_indoor_outdoor_heuristic
    # Outdoor: 23.5°C, 50% RH (temperate comfort). Local: 23.8°C, 51% RH. Cannot rule out indoor with open windows.
    res = evaluate_indoor_outdoor_heuristic(
        local_temperature=23.8,
        local_humidity=51.0,
        outdoor_temperature=23.5,
        outdoor_humidity=50.0,
        pm1_0=8.0,
        pm2_5=16.0,
        pm10=32.0,
    )
    assert res["estimate"] == "Inconclusive"
    assert "overlap" in res["summary"].lower() or "overlap" in res["explanation"].lower()


def test_heuristic_api_endpoint(client):
    payload = {
        "local_temperature": 21.0,
        "local_humidity": 44.0,
        "outdoor_temperature": 34.0,
        "outdoor_humidity": 65.0,
        "pm1_0": 5.0,
        "pm2_5": 12.0,
        "pm10": 20.0,
        "local_temp_source": "sensor",
        "outdoor_source": "Open-Meteo Weather API",
        "latitude": 12.9716,
        "longitude": 77.5946,
    }
    res = client.post("/api/analysis/indoor-outdoor-heuristic", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["estimate"] == "Likely indoor"
    assert data["evaluation_type"] == "rule_based_heuristic"
    assert "Temperature and relative humidity alone" in data["scientific_disclaimer"]


def test_device_location_endpoint(client):
    res = client.get("/api/analysis/device-location")
    assert res.status_code == 200
    data = res.json()
    assert "latitude" in data
    assert "longitude" in data
    assert "display_name" in data
    assert data["source"] in ("network_ip", "fallback_regional")
    assert isinstance(data["latitude"], float)
    assert isinstance(data["longitude"], float)



