from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_database
from ..schemas import LocationCreateSchema, LocationResponseSchema

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("", response_model=List[LocationResponseSchema])
def list_locations(db=Depends(get_database)):
    cursor = db.locations.find({}).sort("name", 1)
    results = []
    for doc in cursor:
        doc.pop("_id", None)
        results.append(doc)
    return results


@router.post("", response_model=LocationResponseSchema, status_code=201)
def create_location(loc_in: LocationCreateSchema, db=Depends(get_database)):
    existing = db.locations.find_one({"id": loc_in.id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Location with ID '{loc_in.id}' already exists.")

    loc_doc = {
        "id": loc_in.id,
        "name": loc_in.name,
        "campus_area": loc_in.campus_area,
        "coordinates": loc_in.coordinates,
        "environment_type": loc_in.environment_type,
        "description": loc_in.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    db.locations.insert_one(loc_doc)
    loc_doc.pop("_id", None)
    return loc_doc


@router.get("/{location_id}", response_model=LocationResponseSchema)
def get_location(location_id: str, db=Depends(get_database)):
    doc = db.locations.find_one({"id": location_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    doc.pop("_id", None)
    return doc
