import os
import re
import logging
from typing import Dict, Any, Optional
from pymongo import MongoClient
from pymongo.errors import PyMongoError, ConnectionFailure, ServerSelectionTimeoutError
import mongomock

from .config import settings

logger = logging.getLogger("airpurify.database")

_client: Optional[Any] = None
_db: Optional[Any] = None
_db_status: Dict[str, Any] = {
    "connected": False,
    "type": "uninitialized",
    "db_name": settings.MONGODB_DB_NAME,
    "details": "Not connected yet"
}


def mask_mongodb_uri(uri: str) -> str:
    """Mask credentials in MongoDB connection string for safe logging and status reporting."""
    if not uri:
        return ""
    # Mask mongodb://user:pass@host or mongodb+srv://user:pass@host
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", uri)


def init_db() -> Any:
    global _client, _db, _db_status

    if os.environ.get("TESTING") == "true":
        logger.info("TESTING=true detected, initializing mongomock directly for testing...")
        _client = mongomock.MongoClient()
        _db = _client[settings.MONGODB_DB_NAME]
        _db_status = {
            "connected": True,
            "type": "mongomock_fallback",
            "db_name": settings.MONGODB_DB_NAME,
            "target": "mock://test",
            "details": "Active test mongomock connection"
        }
        setup_indexes_and_seed(_db)
        return _db

    target_uri = settings.MONGODB_URI
    masked_uri = mask_mongodb_uri(target_uri)

    logger.info(f"Attempting connection to MongoDB at {masked_uri}...")

    # Attempt real MongoDB / Atlas connection first
    try:
        client_kwargs = {
            "serverSelectionTimeoutMS": 10000,
            "connectTimeoutMS": 10000,
            "socketTimeoutMS": 10000,
        }
        try:
            import certifi
            client_kwargs["tlsCAFile"] = certifi.where()
        except ImportError:
            pass

        real_client = MongoClient(target_uri, **client_kwargs)
        # Force a command to test connection
        real_client.admin.command('ping')
        _client = real_client
        _db = _client[settings.MONGODB_DB_NAME]
        _db_status = {
            "connected": True,
            "type": "mongodb_atlas" if "mongodb+srv" in target_uri else "mongodb_standalone",
            "db_name": settings.MONGODB_DB_NAME,
            "target": masked_uri,
            "details": "Active connection established"
        }
        logger.info(f"Successfully connected to MongoDB: {_db_status['type']}")
    except (ConnectionFailure, ServerSelectionTimeoutError, PyMongoError, Exception) as e:
        err_msg = str(e)
        logger.warning(f"Failed to connect to primary MongoDB ({masked_uri}): {err_msg}")

        if settings.FALLBACK_TO_MOCK_DB:
            logger.info("Initializing mongomock fallback database for development and testing...")
            _client = mongomock.MongoClient()
            _db = _client[settings.MONGODB_DB_NAME]
            _db_status = {
                "connected": True,
                "type": "mongomock_fallback",
                "db_name": settings.MONGODB_DB_NAME,
                "target": masked_uri,
                "details": "MongoDB Atlas unreachable; using mock database to ensure seamless offline development and testing"
            }
        else:
            _client = None
            _db = None
            _db_status = {
                "connected": False,
                "type": "disconnected",
                "db_name": settings.MONGODB_DB_NAME,
                "target": masked_uri,
                "details": f"Connection failed: {err_msg}"
            }
            raise e

    # Create indexes and seed initial metadata
    setup_indexes_and_seed(_db)
    return _db


def setup_indexes_and_seed(database: Any):
    if database is None:
        return

    try:
        # 1. sensor_readings indexes
        database.sensor_readings.create_index([("timestamp", -1)])
        database.sensor_readings.create_index([("location_id", 1), ("timestamp", -1)])
        database.sensor_readings.create_index([("device_id", 1)])
        database.sensor_readings.create_index([("data_source", 1)])

        # 2. locations indexes
        database.locations.create_index([("id", 1)], unique=True)

        # 3. alerts indexes
        database.alerts.create_index([("status", 1)])
        database.alerts.create_index([("location_id", 1), ("created_at", -1)])
        database.alerts.create_index([("created_at", -1)])

        # 4. classification_results indexes
        database.classification_results.create_index([("created_at", -1)])
        database.classification_results.create_index([("location_id", 1)])

        # 5. forecasts indexes
        database.forecasts.create_index([("location_id", 1), ("issued_at", -1)])

        # 6. user_profiles and settings
        database.user_profiles.create_index([("email", 1)], unique=True)
        database.app_settings.create_index([("key", 1)], unique=True)

        # Seed standard campus locations if empty (registered stations)
        if database.locations.count_documents({}) == 0:
            initial_locations = [
                {
                    "id": "main-gate",
                    "name": "Main Gate",
                    "campus_area": "North Entrance",
                    "coordinates": {"lat": 12.9716, "lng": 77.5946},
                    "environment_type": "outdoor",
                    "description": "Primary campus entrance monitor facing arterial road",
                    "created_at": "2026-01-15T00:00:00Z"
                },
                {
                    "id": "library",
                    "name": "Central Library",
                    "campus_area": "Academic Core",
                    "coordinates": {"lat": 12.9720, "lng": 77.5955},
                    "environment_type": "indoor",
                    "description": "2nd Floor main reading hall with central HVAC",
                    "created_at": "2026-01-15T00:00:00Z"
                },
                {
                    "id": "hostel-a",
                    "name": "Hostel Block A",
                    "campus_area": "Residential Zone",
                    "coordinates": {"lat": 12.9735, "lng": 77.5970},
                    "environment_type": "indoor",
                    "description": "Student residence common room",
                    "created_at": "2026-02-01T00:00:00Z"
                },
                {
                    "id": "sports",
                    "name": "Sports Complex",
                    "campus_area": "Athletic Field",
                    "coordinates": {"lat": 12.9740, "lng": 77.5930},
                    "environment_type": "outdoor",
                    "description": "Open-air track and gymnasium perimeter",
                    "created_at": "2026-02-01T00:00:00Z"
                },
                {
                    "id": "workshop",
                    "name": "Mechanical Workshop",
                    "campus_area": "Engineering Block",
                    "coordinates": {"lat": 12.9705, "lng": 77.5920},
                    "environment_type": "indoor",
                    "description": "Heavy fabrication and machining lab",
                    "created_at": "2026-03-01T00:00:00Z"
                },
                {
                    "id": "cafeteria",
                    "name": "Central Cafeteria",
                    "campus_area": "Student Amenities",
                    "coordinates": {"lat": 12.9728, "lng": 77.5940},
                    "environment_type": "indoor",
                    "description": "Dining hall and kitchen ventilation perimeter",
                    "created_at": "2026-03-01T00:00:00Z"
                }
            ]
            database.locations.insert_many(initial_locations)
            logger.info("Seeded initial registered campus locations.")

    except Exception as e:
        logger.warning(f"Error setting up indexes or seeding: {e}")


def get_db():
    global _db
    if _db is None:
        init_db()
    return _db


def get_db_status() -> Dict[str, Any]:
    global _db_status
    return _db_status
