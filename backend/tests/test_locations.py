import pytest


def test_list_and_create_locations(client):
    # Seeded locations should exist
    res = client.get("/api/locations")
    assert res.status_code == 200
    locs = res.json()
    assert len(locs) >= 6

    # Register new location
    new_loc = {
        "id": "chem-lab",
        "name": "Chemistry Research Wing",
        "campus_area": "Science Complex",
        "coordinates": {"lat": 12.9750, "lng": 77.5960},
        "environment_type": "indoor",
        "description": "Specialized fume hoods and particulate monitoring station"
    }
    create_res = client.post("/api/locations", json=new_loc)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["id"] == "chem-lab"

    # Duplicate should fail
    dup_res = client.post("/api/locations", json=new_loc)
    assert dup_res.status_code == 400
