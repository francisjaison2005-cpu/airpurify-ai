# AirPurify AI — Phase 2: Backend Integration & Real Data Flow

AirPurify AI is a production-grade environmental intelligence platform integrating a React 19 + TypeScript + Vite frontend, a FastAPI backend, and persistent MongoDB Atlas database collections.

The platform provides real-time CPCB National Air Quality Index (NAQI) calculation, short-term 1D-CNN–BiGRU sequence forecasting interfaces, indoor/outdoor micro-climate classification, location-based testing, threshold alert engines, and historical telemetry archives.

---

## 1. System Architecture

- **Frontend**: React 19, TypeScript, Vite, TanStack Router & Start, Tailwind CSS, Radix UI, Recharts, Lucide Icons. Configured with environment variable `VITE_API_BASE`.
- **Backend**: Python 3.12, FastAPI, Pydantic v2, PyMongo, Motor, Scikit-learn, NumPy, Pytest, Uvicorn.
- **Database**: MongoDB Atlas / local MongoDB with indexed collections:
  - `sensor_readings` (indexes: `timestamp` DESC, `location_id` + `timestamp`, `device_id`, `data_source`)
  - `locations` (seeded with campus stations)
  - `alerts` (indexes: `status`, `created_at`, `location_id`)
  - `classification_results` (persisted indoor/outdoor inference logs)
  - `forecasts` (persisted sequence forecast trajectories)
  - `user_profiles` (administrative credentials)
  - `app_settings` (threshold and theme preferences)
- **Standards Compliance**: Indian Central Pollution Control Board (CPCB) NAQI standard with piecewise linear sub-indices, 3-pollutant data sufficiency validation, and specific health advisories.
- **Hardware Integration Boundary**: Physical sensor hardware (ESP32 / PMS7003) is strictly reserved for Phase 3.

---

## 2. 10 Core Application Pages

1. **Home** (`/`): Real-time air quality dashboard displaying latest persisted station readings from MongoDB, CPCB NAQI badges, 24-hour historical trends, active alert feeds, and live database status indicators.
2. **Air Quality Analysis** (`/analysis`): Deep particulate analysis (PM1.0, PM2.5, PM10), temperature and humidity correlation, statistical aggregates (min/max/average), peak excursion timestamps, official CPCB data completeness reporting, and stored CSV export.
3. **Indoor/Outdoor Prediction** (`/indoor-outdoor`): Environmental classification evaluating micro-climate signatures (temperature, humidity, particulate ratios, temporal hour). Displays unweighted `model_not_configured` readiness contract when supervised model weights are not loaded.
4. **AQI Forecasting** (`/forecast`): Short-term 1D-CNN–BiGRU sequence deep learning interface with sliding window temporal evaluation, lookback horizon (12h sequence, 1 to 6h target horizon), and persistence benchmark comparison.
5. **Location & Air Testing** (`/testing`): Register campus monitoring locations and submit laboratory or manual test observations with provenance tags (`manual`, `test`, `sensor`).
6. **Historical Data** (`/history`): Paginated telemetry archive with multi-parameter filtering (station, environment, data source, time window), inspection drawer, and direct CSV export from MongoDB.
7. **Recent Alerts** (`/alerts`): Automated threshold breach detection engine with active-alert deduplication and status transitions (`Active`, `Acknowledged`, `Resolved`).
8. **Profile** (`/profile`): Administrator credentials and research role metadata persisted in MongoDB.
9. **Settings** (`/settings`): Theme selection (Light/Dark/System), default location and timeframe preferences, CPCB particulate alert thresholds, and live database readiness audit.
10. **Help & About** (`/help`): Comprehensive documentation covering particulate matter sizes, CPCB NAQI mathematical formulas, 1D-CNN–BiGRU sequence methodology, and architecture FAQ.

---

## 3. Environment Variables Configuration

### Backend (`backend/.env`)

```ini
# MongoDB Connection String (Atlas or Local Standalone)
# For Atlas: mongodb+srv://<username>:<password>@<cluster-url>/<dbname>?retryWrites=true&w=majority
# For Local: mongodb://localhost:27017
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=airpurify_ai

# Server Binding
PORT=8000
HOST=0.0.0.0
ENVIRONMENT=development

# CORS Whitelist (JSON array or comma-separated list)
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000","http://127.0.0.1:5173"]

# Standards & Models
AQI_STANDARD=CPCB
FORECASTING_MODEL_PATH=backend/app/ml_artifacts/cnn_bigru_forecast.pt
CLASSIFIER_MODEL_PATH=backend/app/ml_artifacts/indoor_outdoor_clf.joblib

# Set to true for offline development mock fallback if primary database is unreachable
FALLBACK_TO_MOCK_DB=true
```

### Frontend (`.env`)

```ini
# Base URL for FastAPI Backend
VITE_API_BASE=http://127.0.0.1:8000/api
```

---

## 4. Startup Instructions

### 1. Start the FastAPI Backend

```bash
# Navigate to project directory
cd insight-hub-main

# Install python dependencies
pip install -r backend/requirements.txt

# Start backend server on port 8000
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API Interactive Documentation (Swagger UI): `http://localhost:8000/docs`
- Health Readiness Endpoint: `http://localhost:8000/api/health`

### 2. Start the Frontend Dashboard

```bash
# In a separate terminal
npm install --legacy-peer-deps
npm run dev
```

- Frontend Application: `http://localhost:5173`

---

## 5. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Application health and database connection readiness status |
| `GET` | `/api/readings/latest` | Latest persisted reading (overall or filtered by `location_id`) |
| `GET` | `/api/readings/history` | Historical readings with pagination, time range, and station filters |
| `POST` | `/api/readings` | Ingest and validate an environmental reading with CPCB AQI computation |
| `GET` | `/api/readings/export/csv` | Stream stored readings to a CSV download |
| `GET` | `/api/locations` | Retrieve all registered monitoring stations |
| `POST` | `/api/locations` | Register a new monitoring station |
| `POST` | `/api/analysis/aqi` | Calculate CPCB NAQI, data sufficiency, missing inputs, and health guidance |
| `POST` | `/api/analysis/indoor-outdoor` | Classify indoor vs outdoor environment and persist evaluation log |
| `GET` | `/api/predictions/forecast/status` | Report 1D-CNN–BiGRU model readiness, architecture specs, and requirements |
| `GET` | `/api/predictions/forecast` | Retrieve short-term AQI forecast trajectory |
| `GET` | `/api/alerts` | Retrieve alerts filtered by status and location |
| `GET` | `/api/alerts/summary` | Retrieve active, acknowledged, and critical alert counts |
| `PATCH` | `/api/alerts/{alert_id}` | Update alert lifecycle status (`Active`, `Acknowledged`, `Resolved`) |
| `GET` | `/api/profile` | Retrieve administrator profile |
| `PATCH` | `/api/profile` | Update administrator profile details |
| `GET` | `/api/settings` | Retrieve user settings and threshold preferences |
| `PATCH` | `/api/settings` | Update preferences and alert thresholds |

---

## 6. Verification and Testing

### Backend Test Suite (Pytest)

```bash
python -m pytest backend/tests -v
```

_Runs 16 integration and unit tests covering health checks, location registries, reading ingestion, overall/filtered latest queries, CSV streaming, CPCB data completeness rules, health guidance, 1D-CNN–BiGRU status contracts, indoor/outdoor classification persistence, and profile/settings updates._

### Frontend Test Suite (Vitest)

```bash
npm test
```

_Runs 14 routing unit tests validating that all 10 core routes render correctly and obsolete legacy routes remain completely removed._

### Production Build Validation

```bash
npm run build
```

_Validates TypeScript compilation, client bundling, and server-side rendering bundle generation with zero errors._

---

## 7. Model Readiness & Training Requirements

- **1D-CNN–BiGRU Forecaster**:
  - **Architecture**: 1D Convolutional Neural Network (feature extraction) + Bidirectional GRU (temporal sequence dependencies).
  - **Sequence Lookback**: 12 hourly observations.
  - **Target Horizon**: 1 to 6 hours ahead.
  - **Target Variable**: CPCB AQI / PM2.5.
  - **Split Strategy**: Strict chronological split (70% train, 15% validation, 15% test; zero future data leakage). Preprocessing scaler fit strictly on train split.
  - **Baseline Benchmark**: Naive persistence model ($y_{t+h} = y_t$). Must achieve lower MAE/RMSE than persistence before weights are deployed.
  - **Current Status**: Reported as `model_not_configured` when unweighted, displaying explicit data requirements rather than fabricating synthetic forecasts.

- **Indoor/Outdoor Classifier**:
  - **Features**: Temperature (°C), Relative Humidity (%), PM1.0, PM2.5, PM10 (µg/m³), temporal hour.
  - **Validation**: Temperature and humidity alone cannot reliably distinguish indoor from outdoor air. The service reports `model_not_configured` until trained on verified dual-environment datasets.

---

## 8. Phase 3 Next Steps (Hardware Integration)

1. Connect physical ESP32 microcontroller with PMS7003 optical particulate sensor.
2. Flash firmware configured with WiFi telemetry transmission to `POST /api/readings`.
3. Ingest real-time physical sensor data into MongoDB Atlas with source tag `sensor`.
4. Trigger real-time alert notifications upon physical threshold breaches.
