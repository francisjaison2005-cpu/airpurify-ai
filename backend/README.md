# AirPurify AI — Python FastAPI Backend (Phase 1)

This is the high-performance Python FastAPI backend for **AirPurify AI**, built for the Phase 1 academic review.

## Architecture & Features

- **Framework**: FastAPI with asynchronous endpoints and Pydantic validation schemas.
- **Database Persistence**: MongoDB Atlas with PyMongo / Motor driver and automatic schema indexing. Supports graceful fallback to `mongomock` in local development when offline or when Atlas credentials have not yet been supplied.
- **AQI Calculation Service**: Implements the official Indian Central Pollution Control Board (CPCB) NAQI standard, including piecewise linear interpolation, data sufficiency checks (minimum 3 monitored pollutants with at least one PM pollutant), and explicit distinction between Official AQI and Indicative particulate AQI.
- **Indoor/Outdoor Classification**: Dedicated ML classification service interface. Returns `model_not_configured` when model weights are not loaded (avoiding fabricated results), accompanied by a scikit-learn training pipeline (`train_classifier_pipeline`).
- **1D-CNN–BiGRU Forecasting**: Sliding time-series window sequence model architecture, chronological train/validation/test split, and persistence baseline comparison. Returns `model_not_configured` status when unweighted.
- **Rule-Based Alert Engine**: Configurable threshold evaluation with automatic active-alert deduplication.
- **RESTful Endpoints**: Full CRUD for sensor readings, locations, manual testing, alerts, profiles, and application settings.

## Directory Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app definition and lifespan
│   ├── config.py            # Pydantic environment configuration
│   ├── database.py          # MongoDB Atlas client, indexes, and fallback
│   ├── models.py            # MongoDB domain models
│   ├── schemas.py           # Pydantic request & response schemas
│   ├── dependencies.py      # Dependency injection for database
│   ├── routes/              # Modular API routers
│   │   ├── health.py        # System health and model status
│   │   ├── readings.py      # Telemetry ingest, history & CSV export
│   │   ├── locations.py     # Registered monitoring stations
│   │   ├── predictions.py   # AQI calculation, classifier, & forecasting
│   │   ├── alerts.py        # Alert query and status lifecycle
│   │   ├── profile.py       # User profile management
│   │   └── settings.py      # Global application preferences
│   └── services/            # Core business & ML logic
│       ├── aqi.py           # CPCB standard implementation
│       ├── indoor_outdoor.py# Classification service & pipeline
│       ├── forecasting.py   # 1D-CNN–BiGRU time-series pipeline
│       └── alert_engine.py  # Alert rules & deduplication engine
├── tests/                   # Pytest test suite
│   ├── conftest.py
│   ├── test_aqi.py
│   ├── test_readings.py
│   ├── test_locations.py
│   ├── test_alerts.py
│   └── test_indoor_outdoor.py
├── requirements.txt
├── .env.example
└── README.md
```

## Running the Backend

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

Copy `.env.example` to `.env` and set your MongoDB Atlas connection string:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/airpurify_ai?retryWrites=true&w=majority
```

### 3. Run development server

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 4. Running Backend Tests

```bash
pytest backend/tests
```
