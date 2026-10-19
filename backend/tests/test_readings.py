import pytest


def test_create_and_fetch_reading(client):
    payload = {
        "location_id": "main-gate",
        "device_id": "ESP32-DEV-01",
        "pm1_0": 18.5,
        "pm2_5": 38.0,
        "pm10": 72.0,
        "temperature": 27.5,
        "humidity": 64.0,
        "data_source": "manual",
        "environment_label": "outdoor"
    }

    res = client.post("/api/readings", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["id"].startswith("SR-")
    assert data["location_id"] == "main-gate"
    assert data["indicative_aqi"] is not None
    assert data["indicative_category"] == "Satisfactory"
    assert "health_guidance" in data
    assert data["health_guidance"] is not None

    # Fetch latest for specific location
    res_latest = client.get("/api/readings/latest?location_id=main-gate")
    assert res_latest.status_code == 200
    latest = res_latest.json()
    assert latest["id"] == data["id"]

    # Fetch overall latest reading (no location_id provided)
    res_overall = client.get("/api/readings/latest")
    assert res_overall.status_code == 200
    overall = res_overall.json()
    assert overall["id"] == data["id"]

    # Fetch latest with all_locations=true
    res_all = client.get("/api/readings/latest?all_locations=true")
    assert res_all.status_code == 200
    all_readings = res_all.json()
    assert isinstance(all_readings, list)

    # Fetch history
    res_hist = client.get("/api/readings/history?location_id=main-gate")
    assert res_hist.status_code == 200
    hist = res_hist.json()
    assert hist["total"] >= 1
    assert len(hist["items"]) >= 1


def test_export_readings_csv(client):
    # Insert a reading first
    client.post("/api/readings", json={
        "location_id": "library",
        "pm1_0": 10.0,
        "pm2_5": 20.0,
        "pm10": 35.0,
        "temperature": 23.0,
        "humidity": 50.0,
        "data_source": "sensor",
        "environment_label": "indoor"
    })

    res = client.get("/api/readings/export/csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    content = res.text
    assert "Record ID" in content
    assert "library" in content
