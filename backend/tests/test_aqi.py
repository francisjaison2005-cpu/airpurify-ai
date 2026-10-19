import pytest
from backend.app.services.aqi import (
    calculate_aqi_data,
    calculate_sub_index,
    aqi_category,
)


def test_aqi_breakpoints_pm25():
    # Good band: 0-30 -> 0-50
    assert calculate_sub_index("pm2_5", 15.0) == 25
    assert calculate_sub_index("pm2_5", 30.0) == 50

    # Satisfactory: 31-60 -> 51-100
    assert calculate_sub_index("pm2_5", 60.0) == 100

    # Moderate: 61-90 -> 101-200
    assert calculate_sub_index("pm2_5", 90.0) == 200

    # Poor: 91-120 -> 201-300
    assert calculate_sub_index("pm2_5", 120.0) == 300


def test_aqi_category_mapping():
    assert aqi_category(40)[0] == "Good"
    assert aqi_category(85)[0] == "Satisfactory"
    assert aqi_category(150)[0] == "Moderate"
    assert aqi_category(250)[0] == "Poor"
    assert aqi_category(350)[0] == "Very Poor"
    assert aqi_category(450)[0] == "Severe"


def test_cpcb_data_sufficiency_rule():
    # Only particulate inputs available (PMS7003 / PMS5003 scenario)
    res = calculate_aqi_data(pm2_5=45.0, pm10=80.0, pm1_0=25.0)

    # Official AQI must be UNAVAILABLE
    assert res["official_status"] == "unavailable"
    assert res["official_aqi"] is None
    assert "at least 3 monitored pollutants" in res["official_reason"]

    # Indicative particulate AQI must be AVAILABLE
    assert res["indicative_aqi"] is not None
    assert res["indicative_aqi"] > 0
    assert res["indicative_category"] in ("Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe")


def test_cpcb_official_aqi_with_sufficient_parameters():
    # When 3+ pollutants are monitored including PM2.5, official AQI is available
    res = calculate_aqi_data(pm2_5=55.0, pm10=110.0, no2=45.0, so2=30.0)

    assert res["official_status"] == "available"
    assert res["official_aqi"] is not None
    assert res["official_reason"] is None
    assert res["official_category"] is not None
    assert res["calculation_method"] == "CPCB NAQI Piecewise Linear Interpolation (Max sub-index formula)"
    assert "health_guidance" in res
    assert "PM2.5" in res["available_measurements"]
    assert "CO" in res["missing_inputs"]


def test_analysis_aqi_api_endpoint(client):
    payload = {
        "pm2_5": 25.0,
        "pm10": 45.0,
        "pm1_0": 10.0,
        "temperature": 24.5,
        "humidity": 55.0,
    }
    res = client.post("/api/analysis/aqi", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["standard"] == "CPCB"
    assert data["indicative_category"] == "Good"
    assert data["health_guidance"] is not None
    assert "minimal impact" in data["health_guidance"].lower()
    assert data["official_status"] == "unavailable"
    assert len(data["missing_inputs"]) >= 4
