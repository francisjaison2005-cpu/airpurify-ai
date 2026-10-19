# AirPurify AI — Development Roadmap & Implementation Status

## Phase 1 — Project Scoping & Core Architecture (Completed)

- [x] **Branding & Scope Alignment**: Refocused application on AirPurify AI with clean 10-section navigation.
- [x] **FastAPI Backend Setup**: Modular routers, Pydantic schemas, and automated test suite.
- [x] **Database Schema & Indexes**: MongoDB collections for `sensor_readings`, `locations`, `alerts`, `forecasts`, `user_profiles`, and `app_settings`.
- [x] **CPCB NAQI Standard**: Piecewise linear sub-index calculation and strict enforcement of the 3-pollutant data sufficiency rule.
- [x] **Indoor/Outdoor Classification Interface**: Dedicated endpoint, manual test entry form, supervised training pipeline, and `model_not_configured` readiness handling.
- [x] **1D-CNN–BiGRU Sequence Forecasting Interface**: Sliding time-series window pipeline, chronological train/val/test splitting, and persistence baseline comparison.
- [x] **Verification**: All backend and routing tests passing; clean client + SSR production build.

---

## Phase 2 — Backend Integration & Real Data Flow (Completed)

- [x] **Direct MongoDB Integration**: Connected FastAPI backend to live MongoDB instance (`airpurify_ai` database) with full fallback resilience for Atlas clusters.
- [x] **Elimination of Simulated Data**: Removed mock generators from production views; dashboard cards, charts, and tables display real database records.
- [x] **Dedicated Analysis Endpoints**:
  - `POST /api/analysis/aqi`: CPCB standard evaluation with calculation method, available measurements, missing inputs, and category health guidance.
  - `POST /api/analysis/indoor-outdoor`: Micro-climate signature evaluation with persistence to MongoDB `classification_results`.
- [x] **1D-CNN–BiGRU Model Readiness Reporting**:
  - `GET /api/predictions/forecast/status`: Live endpoint exposing architecture specifications, sequence length (12h), target horizon (6h), chronological split strategy, and persistence benchmark.
- [x] **Enhanced Reading Retrieval**:
  - `GET /api/readings/latest`: Supports overall latest persisted reading across stations as well as location-filtered queries.
- [x] **Frontend API Base Configuration**:
  - Dynamic `VITE_API_BASE` configuration in `.env` and `api.ts`.
- [x] **Comprehensive Test Suite**:
  - 16 Pytest tests executed and passing with 100% success.
  - 14 Vitest tests passing.
  - Production build compiled with zero errors.

---

## Phase 3 — Hardware Integration (Pending)

- [ ] **ESP32 & PMS7003 Hardware Setup**: Physical wiring of PMS7003 optical particulate sensor to ESP32 UART pins.
- [ ] **Firmware Deployment**: Flash Arduino/ESP-IDF firmware reading PM1.0, PM2.5, PM10, temperature, and relative humidity.
- [ ] **Live Telemetry Transmission**: Stream physical sensor readings directly to `POST /api/readings` over WiFi.
- [ ] **Operational Sequence Model Weights**: Ingest continuous 72-hour physical telemetry to fit MinMaxScaler and train 1D-CNN–BiGRU weights for live inference.
