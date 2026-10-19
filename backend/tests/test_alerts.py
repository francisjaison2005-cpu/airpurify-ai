import pytest


def test_alert_generation_and_deduplication(client):
    # Post high PM2.5 reading to trigger alert
    payload = {
        "location_id": "workshop",
        "pm1_0": 45.0,
        "pm2_5": 140.0,  # Exceeds threshold (60.0)
        "pm10": 260.0,
        "temperature": 29.0,
        "humidity": 45.0,
        "data_source": "sensor"
    }
    res = client.post("/api/readings", json=payload)
    assert res.status_code == 201

    # Check alert list
    alerts_res = client.get("/api/alerts?location_id=workshop&status=Active")
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert len(alerts) >= 1
    pm_alert = next((a for a in alerts if a["pollutant"] == "PM2.5"), None)
    assert pm_alert is not None
    assert pm_alert["severity"] == "critical"
    initial_id = pm_alert["id"]

    # Post another high reading - should NOT create duplicate active alert
    payload["pm2_5"] = 150.0
    client.post("/api/readings", json=payload)

    alerts_res_2 = client.get("/api/alerts?location_id=workshop&status=Active")
    alerts_2 = alerts_res_2.json()
    pm_alerts_2 = [a for a in alerts_2 if a["pollutant"] == "PM2.5"]
    assert len(pm_alerts_2) == 1  # Deduplication verified!

    # Update alert status to Acknowledged
    patch_res = client.patch(f"/api/alerts/{initial_id}", json={"status": "Acknowledged"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Acknowledged"
