from fastapi import HTTPException
from .database import get_db, get_db_status


def get_database():
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Database service is unavailable. Check MongoDB connection configuration."
        )
    return db
