from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from ..dependencies import get_database
from ..schemas import ProfileUpdateSchema
from ..models import UserProfileModel

router = APIRouter(prefix="/profile", tags=["User Profile"])


@router.get("")
def get_user_profile(db=Depends(get_database)):
    doc = db.user_profiles.find_one({"id": "default_user"})
    if not doc:
        default_profile = UserProfileModel().model_dump()
        db.user_profiles.insert_one(default_profile)
        doc = default_profile

    doc.pop("_id", None)
    return doc


@router.patch("")
def update_user_profile(update_in: ProfileUpdateSchema, db=Depends(get_database)):
    now_iso = datetime.now(timezone.utc).isoformat()
    fields = {k: v for k, v in update_in.model_dump().items() if v is not None}
    fields["updated_at"] = now_iso

    db.user_profiles.update_one(
        {"id": "default_user"},
        {"$set": fields},
        upsert=True
    )
    doc = db.user_profiles.find_one({"id": "default_user"})
    doc.pop("_id", None)
    return doc
