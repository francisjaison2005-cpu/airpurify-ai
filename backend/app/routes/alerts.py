from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException

from ..dependencies import get_database
from ..schemas import AlertResponseSchema, AlertUpdateSchema

router = APIRouter(prefix="/alerts", tags=["Alerts & Notifications"])


@router.get("", response_model=List[AlertResponseSchema])
def list_alerts(
    status: Optional[str] = Query(default=None),
    location_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db=Depends(get_database)
):
    query = {}
    if status and status != "all":
        query["status"] = status
    if location_id and location_id != "all":
        query["location_id"] = location_id

    cursor = db.alerts.find(query).sort("created_at", -1).limit(limit)
    results = []
    for doc in cursor:
        doc.pop("_id", None)
        results.append(doc)
    return results


@router.get("/summary")
def get_alerts_summary(db=Depends(get_database)):
    active = db.alerts.count_documents({"status": "Active"})
    ack = db.alerts.count_documents({"status": "Acknowledged"})
    resolved = db.alerts.count_documents({"status": "Resolved"})
    critical = db.alerts.count_documents({"status": "Active", "severity": "critical"})
    return {
        "active": active,
        "acknowledged": ack,
        "resolved": resolved,
        "critical_active": critical,
        "total": active + ack + resolved
    }


@router.patch("/{alert_id}", response_model=AlertResponseSchema)
def update_alert_status(
    alert_id: str,
    update_in: AlertUpdateSchema,
    db=Depends(get_database)
):
    now_iso = datetime.now(timezone.utc).isoformat()
    result = db.alerts.find_one_and_update(
        {"id": alert_id},
        {"$set": {"status": update_in.status, "updated_at": now_iso}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    result.pop("_id", None)
    return result
