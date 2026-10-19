import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import init_db, get_db_status
from .routes import (
    health,
    readings,
    locations,
    analysis,
    predictions,
    alerts,
    profile,
    settings as app_settings,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("airpurify.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing AirPurify AI backend...")
    try:
        init_db()
    except Exception as e:
        logger.error(f"Error during database startup: {e}")
    yield
    logger.info("Shutting down AirPurify AI backend.")


app = FastAPI(
    title="AirPurify AI API",
    description="AirPurify AI Backend — Environmental Monitoring, CPCB NAQI, Indoor/Outdoor ML & 1D-CNN–BiGRU Forecasting",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include core routers
app.include_router(health.router, prefix="/api")
app.include_router(readings.router, prefix="/api")
app.include_router(locations.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(predictions.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(app_settings.router, prefix="/api")

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {
        "project": "AirPurify AI",
        "phase": "Phase 2 Backend Integration & Real Data Flow",
        "version": "2.0.0",
        "docs_url": "/docs",
        "health_url": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
