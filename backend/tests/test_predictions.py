import pytest


def test_forecast_endpoint_model_status(client):
    res = client.get("/api/predictions/forecast?location_id=main-gate&horizon_hours=6")
    assert res.status_code == 200
    data = res.json()
    assert "model_status" in data
    assert data["model_architecture"] == "1D-CNN–BiGRU (1D Convolution + Bidirectional GRU)"
    assert data["target_horizon_hours"] == 6
    if data["model_status"] == "model_not_configured":
        assert len(data["forecasts"]) == 0
        assert "not loaded" in data["message"].lower() or "train the model" in data["message"].lower()


def test_forecast_status_endpoint(client):
    res = client.get("/api/predictions/forecast/status")
    assert res.status_code == 200
    data = res.json()
    assert data["model_architecture"] == "1D-CNN–BiGRU (1D Convolution + Bidirectional GRU)"
    assert data["target_variable"] == "CPCB AQI / PM2.5 hourly time-series"
    assert data["sequence_length_hours"] == 12
    assert data["forecast_horizon_hours"] == 6
    assert "Strict chronological split" in data["split_strategy"]
    assert "MinMaxScaler" in data["feature_scaling"]
    assert "Persistence model" in data["baseline_benchmark"]
    assert "MAE" in data["evaluation_metrics"]
    assert len(data["operational_requirements"]) >= 4


def test_analysis_indoor_outdoor_endpoint(client, mock_db):
    payload = {
        "temperature": 23.5,
        "humidity": 48.0,
        "pm1_0": 6.0,
        "pm2_5": 14.0,
        "pm10": 26.0,
        "temporal_hour": 14,
        "is_manual_entry": True,
        "location_id": "library",
    }
    res = client.post("/api/analysis/indoor-outdoor", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["model_status"] in ("model_not_configured", "trained", "insufficient_data")
    assert "temperature_c" in data["input_feature_availability"]
    assert data["input_feature_availability"]["pm2_5"] is True

    # Verify persisted to classification_results
    persisted = mock_db.classification_results.find_one({"inputs.location_id": "library"})
    assert persisted is not None
    assert persisted["inputs"]["temperature"] == 23.5


def test_profile_endpoints(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    prof = res.json()
    assert "email" in prof

    # Update profile
    patch_res = client.patch("/api/profile", json={"display_name": "Senior Air Quality Lead"})
    assert patch_res.status_code == 200
    assert patch_res.json()["display_name"] == "Senior Air Quality Lead"


def test_settings_endpoints(client):
    res = client.get("/api/settings")
    assert res.status_code == 200
    sett = res.json()
    assert sett["aqi_standard"] == "CPCB"

    # Update settings
    patch_res = client.patch("/api/settings", json={"theme": "dark", "alert_pm25_threshold": 65.0})
    assert patch_res.status_code == 200
    assert patch_res.json()["theme"] == "dark"
    assert patch_res.json()["alert_pm25_threshold"] == 65.0
