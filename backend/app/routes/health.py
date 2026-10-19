import os
from fastapi import APIRouter
from ..database import get_db_status
from ..config import settings
from ..services.indoor_outdoor import _cached_classifier, _model_version as clf_ver
from ..services.forecasting import _forecasting_model_version

router = APIRouter(prefix="/health", tags=["Health & Status"])


@router.get("")
def health_check():
    db_status = get_db_status()
    clf_exists = os.path.exists(settings.CLASSIFIER_MODEL_PATH) or _cached_classifier is not None
    fc_exists = os.path.exists(settings.FORECASTING_MODEL_PATH)

    return {
        "status": "healthy",
        "service": "AirPurify AI Backend",
        "version": "2.0.0",
        "aqi_standard": settings.AQI_STANDARD,
        "database": db_status,
        "models": {
            "indoor_outdoor_classifier": {
                "configured": clf_exists,
                "status": "trained" if clf_exists else "model_not_configured",
                "version": clf_ver if clf_exists else "none",
                "path": settings.CLASSIFIER_MODEL_PATH
            },
            "aqi_forecaster_1d_cnn_bigru": {
                "configured": fc_exists,
                "status": "trained" if fc_exists else "model_not_configured",
                "version": _forecasting_model_version if fc_exists else "none",
                "path": settings.FORECASTING_MODEL_PATH
            }
        }
    }
