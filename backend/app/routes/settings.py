from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from ..dependencies import get_database
from ..schemas import SettingsUpdateSchema
from ..models import AppSettingsModel

router = APIRouter(prefix="/settings", tags=["Application Settings"])


@router.get("")
def get_app_settings(db=Depends(get_database)):
    doc = db.app_settings.find_one({"key": "global_settings"})
    if not doc:
        default_settings = AppSettingsModel().model_dump()
        default_settings["key"] = "global_settings"
        db.app_settings.insert_one(default_settings)
        doc = default_settings

    doc.pop("_id", None)
    return doc


@router.patch("")
def update_app_settings(update_in: SettingsUpdateSchema, db=Depends(get_database)):
    now_iso = datetime.now(timezone.utc).isoformat()
    fields = {k: v for k, v in update_in.model_dump().items() if v is not None}
    fields["updated_at"] = now_iso

    db.app_settings.update_one(
        {"key": "global_settings"},
        {"$set": fields},
        upsert=True
    )
    doc = db.app_settings.find_one({"key": "global_settings"})
    doc.pop("_id", None)
    return doc
