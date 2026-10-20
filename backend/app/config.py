import os
import json
from typing import List
from dotenv import load_dotenv

# Load .env file from backend directory if present
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()


class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "airpurify_ai")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    AQI_STANDARD: str = os.getenv("AQI_STANDARD", "CPCB")
    FORECASTING_MODEL_PATH: str = os.getenv(
        "FORECASTING_MODEL_PATH",
        os.path.join(os.path.dirname(__file__), "ml_artifacts", "cnn_bigru_forecast.pt"),
    )
    CLASSIFIER_MODEL_PATH: str = os.getenv(
        "CLASSIFIER_MODEL_PATH",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "indoor_outdoor_rf.joblib"),
    )
    FALLBACK_TO_MOCK_DB: bool = os.getenv("FALLBACK_TO_MOCK_DB", "true").lower() in ("true", "1", "yes")

    @property
    def cors_origins(self) -> List[str]:
        raw = os.getenv("CORS_ORIGINS")
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return [origin.strip() for origin in raw.split(",") if origin.strip()]
        return [
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://10.151.186.69:8080",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "*",
        ]


settings = Settings()
