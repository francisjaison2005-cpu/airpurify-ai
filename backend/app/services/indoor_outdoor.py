import os
import joblib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import numpy as np

from ..config import settings

import json
import logging
import pandas as pd

logger = logging.getLogger("indoor_outdoor_service")

#
# In-memory cached model
_cached_classifier = None
_model_version = "rf-synthetic-v1.0"
_model_name = "RandomForestClassifier"
_model_metadata = {}


def load_classifier(force: bool = False):
    """Attempts to load trained scikit-learn pipeline and metadata if available on disk."""
    global _cached_classifier, _model_version, _model_name, _model_metadata
    if _cached_classifier is not None and not force and hasattr(_cached_classifier, "named_steps"):
        return _cached_classifier

    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "indoor_outdoor_rf.joblib"),
        settings.CLASSIFIER_MODEL_PATH,
        os.path.join(os.path.dirname(__file__), "ml_artifacts", "indoor_outdoor_clf.joblib"),
    ]
    target_path = None
    for p in candidates:
        if p and os.path.exists(p):
            target_path = p
            break

    if target_path:
        try:
            loaded_obj = joblib.load(target_path)
            _cached_classifier = loaded_obj
            meta_path = os.path.join(os.path.dirname(target_path), "indoor_outdoor_metadata.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    _model_metadata = json.load(f)
                    _model_version = _model_metadata.get("model_version", "rf-synthetic-v1.0")
                    _model_name = _model_metadata.get("algorithm", "RandomForestClassifier")
            else:
                _model_version = "rf-synthetic-v1.0"
                _model_name = "RandomForestClassifier"
            return _cached_classifier
        except Exception as e:
            logger.error(f"Error loading classifier from {target_path}: {e}")
            _cached_classifier = None
    return None


def evaluate_indoor_outdoor_heuristic(
    local_temperature: Optional[float] = None,
    local_humidity: Optional[float] = None,
    outdoor_temperature: Optional[float] = None,
    outdoor_humidity: Optional[float] = None,
    pm1_0: Optional[float] = None,
    pm2_5: Optional[float] = None,
    pm10: Optional[float] = None,
    local_temp_source: Optional[str] = "sensor",
    local_pm_source: Optional[str] = "sensor",
    outdoor_source: Optional[str] = "Open-Meteo Weather API",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    location_name: Optional[str] = None,
    gps_accuracy_m: Optional[float] = None,
    observation_timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Explicitly labelled rule-based heuristic estimate for Indoor vs Outdoor environmental classification.
    Adheres strictly to scientific and hardware constraints:
    - Never uses simplistic 'high temperature = outdoor' or 'high humidity = indoor'.
    - Compares local micro-climate against ambient outdoor weather baseline when both exist.
    - Uses particulate measurements as contextual auxiliary evidence, not proof.
    - Treats GPS coordinates as geographic context, not proof of being outdoors.
    - Returns 'Likely indoor', 'Likely outdoor', or 'Inconclusive' when evidence is insufficient or contradictory.
    - If local temp/humidity measurements do not exist (PMS7003 measures PM only), highlights that estimation
      requires local environmental sensors or manual measurements.
    - Never fabricates confidence scores.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    ts = observation_timestamp or now_iso

    scientific_disclaimer = (
        "This is an explicitly labelled rule-based heuristic estimate, NOT a trained machine learning model. "
        "Temperature and relative humidity alone cannot reliably determine indoor vs outdoor status because "
        "conditioned rooms and temperate ambient weather frequently overlap. Plantower PMS7003 measures "
        "particulate matter only; ambient weather values reflect outdoor assimilation at geographical coordinates, "
        "not internal room micro-climates."
    )

    sources = {
        "local_temperature": local_temp_source if local_temperature is not None else "unavailable",
        "local_humidity": local_temp_source if local_humidity is not None else "unavailable",
        "particulates": local_pm_source if pm2_5 is not None else "unavailable",
        "outdoor_weather": outdoor_source if outdoor_temperature is not None else "unavailable",
        "location": "GPS Browser Geolocation" if (latitude is not None and longitude is not None) else "unspecified",
    }

    metrics = {
        "local_temperature": local_temperature,
        "local_humidity": local_humidity,
        "outdoor_temperature": outdoor_temperature,
        "outdoor_humidity": outdoor_humidity,
        "temp_diff_c": None,
        "abs_temp_diff_c": None,
        "humidity_diff_pct": None,
        "abs_humidity_diff_pct": None,
        "pm1_0": pm1_0,
        "pm2_5": pm2_5,
        "pm10": pm10,
        "pm_ratio": round(pm2_5 / pm10, 3) if (pm2_5 is not None and pm10 is not None and pm10 > 0) else None,
        "latitude": latitude,
        "longitude": longitude,
        "location_name": location_name,
        "gps_accuracy_m": gps_accuracy_m,
    }

    # Case 1: Missing local environmental measurements (e.g. PMS7003 connected without temp/humidity sensor)
    if local_temperature is None or local_humidity is None:
        return {
            "estimate": "Inconclusive",
            "evaluation_type": "rule_based_heuristic",
            "summary": "Local environmental temperature/humidity readings unavailable.",
            "explanation": (
                "The Plantower PMS7003 sensor measures particulate matter only and lacks temperature or humidity sensing. "
                "No separate physical temperature/humidity sensor is connected, and outdoor weather cannot be assumed to "
                "represent an indoor micro-climate. Estimation requires local environmental measurements or manual entry."
            ),
            "influencing_factors": [
                "PMS7003 particulate-only telemetry",
                "Missing local temperature & humidity sensor",
            ],
            "scientific_disclaimer": scientific_disclaimer,
            "metrics": metrics,
            "sources": sources,
            "evaluation_timestamp": ts,
        }

    # Case 2: Missing outdoor meteorological baseline
    if outdoor_temperature is None or outdoor_humidity is None:
        return {
            "estimate": "Inconclusive",
            "evaluation_type": "rule_based_heuristic",
            "summary": "Outdoor baseline weather data unavailable for comparison.",
            "explanation": (
                "Local sensor readings are present, but outdoor meteorological baseline conditions are unavailable. "
                "Grant browser geolocation permission or select a monitoring station to retrieve ambient weather from "
                "Open-Meteo for micro-climate comparison."
            ),
            "influencing_factors": [
                f"Local temperature: {local_temperature}°C, humidity: {local_humidity}%",
                "Missing outdoor meteorological baseline",
            ],
            "scientific_disclaimer": scientific_disclaimer,
            "metrics": metrics,
            "sources": sources,
            "evaluation_timestamp": ts,
        }

    # Case 3: Both local measurements and outdoor baseline are present
    diff_temp = round(local_temperature - outdoor_temperature, 2)
    abs_diff_temp = round(abs(diff_temp), 2)
    diff_hum = round(local_humidity - outdoor_humidity, 2)
    abs_diff_hum = round(abs(diff_hum), 2)

    metrics["temp_diff_c"] = diff_temp
    metrics["abs_temp_diff_c"] = abs_diff_temp
    metrics["humidity_diff_pct"] = diff_hum
    metrics["abs_humidity_diff_pct"] = abs_diff_hum

    pm_ratio = metrics["pm_ratio"]
    influencing_factors = []

    # Physical threshold criteria:
    # 1. Thermal decoupling: abs(dT) >= 3.5°C or abs(dRH) >= 15% suggests conditioned/insulated indoor micro-climate
    # 2. Thermal equilibrium tracking: abs(dT) <= 1.5°C and abs(dRH) <= 8% suggests ambient tracking
    has_thermal_decoupling = abs_diff_temp >= 3.5 or abs_diff_hum >= 15.0
    has_ambient_tracking = abs_diff_temp <= 1.5 and abs_diff_hum <= 8.0

    coarse_dust_signature = (pm_ratio is not None and pm_ratio < 0.35 and pm10 is not None and pm10 > 50)
    fine_indoor_signature = (pm_ratio is not None and pm_ratio >= 0.55 and pm2_5 is not None and pm2_5 < 30 and pm10 is not None and pm10 < 45)
    indoor_combustion_spike = (pm2_5 is not None and pm2_5 > 75 and pm_ratio is not None and pm_ratio > 0.70)

    # If outdoor weather is in comfort range (20°C - 26°C and 40% - 60% RH), naturally matches room conditions
    is_temperate_outdoor = (20.0 <= outdoor_temperature <= 26.0 and 40.0 <= outdoor_humidity <= 60.0)

    if has_thermal_decoupling:
        influencing_factors.append(f"Thermal/moisture differential: ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%")
        if fine_indoor_signature:
            influencing_factors.append(f"Filtered particulate profile (PM2.5/PM10 ratio: {pm_ratio})")
        if indoor_combustion_spike:
            influencing_factors.append(f"Localized sub-micron PM spike (PM2.5: {pm2_5} µg/m³), possible indoor activity")

        # Contradiction check: significant thermal decoupling, but heavy coarse crustal dust typical of open road
        if coarse_dust_signature:
            influencing_factors.append(f"Contradictory factor: Coarse dust dominance (PM10: {pm10} µg/m³, ratio: {pm_ratio}) typical of outdoor environment")
            estimate = "Inconclusive"
            summary = "Contradictory environmental signals: thermal decoupling conflicts with coarse dust particulate profile."
            explanation = (
                f"Local temperature/humidity differs substantially from outdoor baseline (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%), "
                f"which normally indicates an indoor space. However, particulate readings show coarse crustal dust dominance (PM10 = {pm10} µg/m³, "
                f"PM2.5/PM10 = {pm_ratio}), which is characteristic of outdoor resuspension. Due to these conflicting signals, "
                f"the classification is inconclusive."
            )
        else:
            estimate = "Likely indoor"
            summary = f"Thermal decoupling detected (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%), consistent with an enclosed micro-climate."
            explanation = (
                f"Local readings deviate significantly from ambient weather (local: {local_temperature}°C / {local_humidity}% RH vs "
                f"outdoor: {outdoor_temperature}°C / {outdoor_humidity}% RH). This differential (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%) "
                f"is consistent with artificial HVAC conditioning or building envelope thermal buffer decoupling the space from outdoor atmosphere."
            )

    elif has_ambient_tracking:
        influencing_factors.append(f"Ambient weather tracking: ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%")
        if coarse_dust_signature:
            influencing_factors.append(f"Coarse particulate signature (PM2.5/PM10 ratio: {pm_ratio}, PM10: {pm10} µg/m³)")
        if indoor_combustion_spike:
            influencing_factors.append("Contradictory factor: localized sub-micron particulate spike")

        # Check for contradiction: ambient tracking, but localized high sub-micron smoke
        if indoor_combustion_spike:
            estimate = "Inconclusive"
            summary = "Contradictory signals: local temperature tracks outdoor weather, but particulate levels indicate indoor combustion."
            explanation = (
                f"Local temperature and humidity closely track ambient weather (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%), "
                f"but particulate readings show a sharp sub-micron spike (PM2.5 = {pm2_5} µg/m³, PM2.5/PM10 = {pm_ratio}) characteristic "
                f"of indoor cooking or smoke. The evidence is contradictory."
            )
        elif is_temperate_outdoor and not coarse_dust_signature:
            influencing_factors.append(f"Temperate outdoor baseline ({outdoor_temperature}°C, {outdoor_humidity}% RH) overlaps with indoor comfort range")
            estimate = "Inconclusive"
            summary = "Ambient weather overlaps with indoor comfort range; thermal tracking is insufficient to prove outdoor location."
            explanation = (
                f"Local readings closely mirror outdoor conditions (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%), but ambient weather "
                f"({outdoor_temperature}°C, {outdoor_humidity}% RH) falls directly into typical indoor comfort conditions. An indoor room with open windows "
                f"or natural ventilation exhibits identical metrics. Without strong particulate divergence, indoor vs outdoor cannot be reliably determined."
            )
        else:
            estimate = "Likely outdoor"
            summary = f"Local measurements closely match ambient weather baseline (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%)."
            explanation = (
                f"Local temperature ({local_temperature}°C) and relative humidity ({local_humidity}%) match outdoor meteorological assimilation "
                f"({outdoor_temperature}°C, {outdoor_humidity}%) within tracking thresholds (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%), "
                f"consistent with sensor exposure to ambient outdoor atmosphere."
            )

    else:
        influencing_factors.append(f"Intermediate differential: ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%")
        estimate = "Inconclusive"
        summary = f"Moderate differential (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%) provides insufficient evidence."
        explanation = (
            f"The difference between local sensor readings ({local_temperature}°C, {local_humidity}%) and outdoor weather "
            f"({outdoor_temperature}°C, {outdoor_humidity}%) is in the intermediate zone (ΔT = {abs_diff_temp}°C, ΔRH = {abs_diff_hum}%). "
            f"This could arise from building thermal inertia, open windows, sheltered outdoor micro-climates, or solar heating of the sensor casing. "
            f"Evidence is insufficient for a confident classification."
        )

    return {
        "estimate": estimate,
        "evaluation_type": "rule_based_heuristic",
        "summary": summary,
        "explanation": explanation,
        "influencing_factors": influencing_factors,
        "scientific_disclaimer": scientific_disclaimer,
        "metrics": metrics,
        "sources": sources,
        "evaluation_timestamp": ts,
    }


def predict_indoor_outdoor(
    temperature_c: Optional[float] = None,
    temperature: Optional[float] = None,
    humidity_pct: Optional[float] = None,
    humidity: Optional[float] = None,
    outdoor_reference_temperature_c: Optional[float] = None,
    outdoor_temperature: Optional[float] = None,
    outdoor_reference_humidity_pct: Optional[float] = None,
    outdoor_humidity: Optional[float] = None,
    temperature_delta_c: Optional[float] = None,
    humidity_delta_pct: Optional[float] = None,
    hour_of_day: Optional[int] = None,
    temporal_hour: Optional[int] = None,
    season: Optional[str] = None,
    pm1_0: Optional[float] = None,
    pm2_5: Optional[float] = None,
    pm10: Optional[float] = None,
    is_manual_entry: bool = True,
    location_id: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    location_name: Optional[str] = None,
    gps_accuracy_m: Optional[float] = None,
    data_source: Optional[str] = "manual",
    weather_provider: Optional[str] = None,
    observation_timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Evaluates environmental features for indoor vs outdoor classification using the trained
    Random Forest pipeline (fitted on temperature, humidity, outdoor reference readings, deltas, hour, and season).

    Scientific & Hardware Constraints:
    - Never fabricates temperature or humidity from PMS7003 readings (PMS7003 measures PM only).
    - If local temp/humidity or outdoor reference values are missing, returns 'Insufficient Data' with status 'insufficient_data'.
    - If model artifact is not configured or missing, returns explicit 'model_not_configured' status.
    - Model probabilities are explicitly documented as uncalibrated model estimates from synthetic training data.
    - Identifies dataset provenance as 'synthetic' with clear experimental disclaimers.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    ts = observation_timestamp or now_iso

    # Resolve parameter aliases
    local_temp = temperature_c if temperature_c is not None else temperature
    local_hum = humidity_pct if humidity_pct is not None else humidity
    outdoor_temp = outdoor_reference_temperature_c if outdoor_reference_temperature_c is not None else outdoor_temperature
    outdoor_hum = outdoor_reference_humidity_pct if outdoor_reference_humidity_pct is not None else outdoor_humidity
    hour = hour_of_day if hour_of_day is not None else (temporal_hour if temporal_hour is not None else datetime.now(timezone.utc).hour)

    # Determine season if not provided
    season_val = season.lower() if season else None
    if season_val not in ("summer", "monsoon", "winter"):
        month = datetime.now(timezone.utc).month
        if observation_timestamp:
            try:
                month = datetime.fromisoformat(observation_timestamp.replace("Z", "+00:00")).month
            except Exception:
                pass
        if month in (3, 4, 5, 6):
            season_val = "summer"
        elif month in (7, 8, 9, 10):
            season_val = "monsoon"
        else:
            season_val = "winter"

    # If outdoor reference readings not provided directly, but GPS coordinates are present,
    # attempt outdoor meteorological retrieval from Open-Meteo.
    # (Note: Weather API readings are strictly outdoor references, never local sensor measurements)
    if (outdoor_temp is None or outdoor_hum is None) and latitude is not None and longitude is not None:
        try:
            from .weather import get_ambient_weather
            w_res = get_ambient_weather(latitude, longitude)
            if outdoor_temp is None and w_res.get("temperature") is not None:
                outdoor_temp = w_res["temperature"]
            if outdoor_hum is None and w_res.get("humidity") is not None:
                outdoor_hum = w_res["humidity"]
        except Exception as w_err:
            logger.debug(f"Could not fetch outdoor baseline for coordinates ({latitude}, {longitude}): {w_err}")

    # Compute differentials if both local and outdoor reference exist
    if local_temp is not None and outdoor_temp is not None:
        temp_delta = round(local_temp - outdoor_temp, 2) if temperature_delta_c is None else round(temperature_delta_c, 2)
    else:
        temp_delta = round(temperature_delta_c, 2) if temperature_delta_c is not None else None

    if local_hum is not None and outdoor_hum is not None:
        hum_delta = round(local_hum - outdoor_hum, 2) if humidity_delta_pct is None else round(humidity_delta_pct, 2)
    else:
        hum_delta = round(humidity_delta_pct, 2) if humidity_delta_pct is not None else None

    feature_availability = {
        "temperature_c": local_temp is not None,
        "humidity_pct": local_hum is not None,
        "outdoor_reference_temperature_c": outdoor_temp is not None,
        "outdoor_reference_humidity_pct": outdoor_hum is not None,
        "temperature_delta_c": temp_delta is not None,
        "humidity_delta_pct": hum_delta is not None,
        "hour_of_day": hour is not None,
        "season": season_val is not None,
        "pm1_0": pm1_0 is not None,
        "pm2_5": pm2_5 is not None,
        "pm10": pm10 is not None,
        "location": (latitude is not None and longitude is not None),
    }

    location_context = {
        "latitude": latitude,
        "longitude": longitude,
        "location_name": location_name,
        "gps_accuracy_m": gps_accuracy_m,
        "location_id": location_id,
        "weather_provider": weather_provider,
        "observation_timestamp": ts,
    }

    ratio_heuristic = "Indeterminate"
    if pm10 and pm10 > 0 and pm2_5 is not None:
        ratio = pm2_5 / pm10
        if ratio < 0.35 and pm10 > 50:
            ratio_heuristic = "Indicative Outdoor Signature (Coarse crustal dust dominance)"
        elif ratio >= 0.55 and pm2_5 < 30 and pm10 < 45:
            ratio_heuristic = "Indicative Enclosed Signature (Sub-micron particulate profile)"
        else:
            ratio_heuristic = "Mixed / Overlapping Signature"

    heuristic_info = {
        "status": "unvalidated_heuristic",
        "label": "Unvalidated Heuristic (Demonstration Reference Only)",
        "indicative_signature": ratio_heuristic,
        "explanation": (
            "Rule-of-thumb ratio based on PM2.5/PM10 proportion. This is an unvalidated demonstration "
            "heuristic and is NOT a trained AI model prediction. It does not carry confidence scores."
        ),
    }

    scientific_disclaimer = (
        "Experimental prediction trained on synthetic data. "
        "Indoor/outdoor classification requires validation with real sensor measurements."
    )
    uncalibrated_note = (
        "Model probabilities are uncalibrated model estimates from synthetic training data, "
        "not guaranteed confidence or real-world reliability."
    )

    clf = _cached_classifier or load_classifier()
    if clf is not None and not hasattr(clf, "named_steps"):
        clf = load_classifier(force=True)

    # Case 1: Model artifact is missing
    if clf is None:
        return {
            "predicted_class": "Unknown",
            "class_probabilities": None,
            "confidence_score": None,
            "temperature_difference": temp_delta,
            "humidity_difference": hum_delta,
            "model_name": _model_name,
            "model_version": "none",
            "model_status": "model_not_configured",
            "dataset_provenance": "synthetic",
            "uncalibrated_probability_note": uncalibrated_note,
            "prediction_timestamp": ts,
            "input_feature_availability": feature_availability,
            "feature_importance": None,
            "notes": (
                "Prediction unavailable — Indoor/Outdoor Random Forest model is not configured. "
                "The training script is available at backend/scripts/train_indoor_outdoor.py."
            ),
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": scientific_disclaimer,
        }

    # Case 2: Required inputs are incomplete
    required_features_present = (
        local_temp is not None
        and local_hum is not None
        and outdoor_temp is not None
        and outdoor_hum is not None
    )

    if not required_features_present:
        missing_reasons = []
        if local_temp is None or local_hum is None:
            missing_reasons.append("local temperature and relative humidity")
        if outdoor_temp is None or outdoor_hum is None:
            missing_reasons.append("outdoor reference temperature and relative humidity")

        missing_text = " and ".join(missing_reasons)
        return {
            "predicted_class": "Insufficient Data",
            "class_probabilities": None,
            "confidence_score": None,
            "temperature_difference": temp_delta,
            "humidity_difference": hum_delta,
            "model_name": _model_name,
            "model_version": _model_version,
            "model_status": "insufficient_data",
            "dataset_provenance": "synthetic",
            "uncalibrated_probability_note": uncalibrated_note,
            "prediction_timestamp": ts,
            "input_feature_availability": feature_availability,
            "feature_importance": None,
            "notes": (
                f"Prediction unavailable — Insufficient Data ({missing_text} missing). "
                "The Plantower PMS7003 sensor measures particulate matter only and does not measure temperature or humidity. "
                "A physical BME280 or SHT31 sensor is required for local telemetry, and outdoor baseline weather must be available."
            ),
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": scientific_disclaimer,
        }

    # Case 3: Run real inference using the trained Pipeline
    try:
        input_data = pd.DataFrame([{
            "temperature_c": float(local_temp),
            "humidity_pct": float(local_hum),
            "outdoor_reference_temperature_c": float(outdoor_temp),
            "outdoor_reference_humidity_pct": float(outdoor_hum),
            "temperature_delta_c": float(temp_delta),
            "humidity_delta_pct": float(hum_delta),
            "hour_of_day": int(hour),
            "season": str(season_val).lower(),
        }])

        pred_raw = clf.predict(input_data)[0]
        predicted_class = str(pred_raw).lower()

        class_probabilities = None
        confidence_score = None
        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba(input_data)[0]
            classes = [str(c).lower() for c in clf.classes_.tolist()]
            class_probabilities = {c: round(float(p), 4) for c, p in zip(classes, probs)}
            confidence_score = round(float(np.max(probs)), 4)

        feature_importances = None
        try:
            if hasattr(clf, "named_steps") and "classifier" in clf.named_steps and "preprocessor" in clf.named_steps:
                clf_step = clf.named_steps["classifier"]
                prep_step = clf.named_steps["preprocessor"]
                if hasattr(clf_step, "feature_importances_"):
                    names = prep_step.get_feature_names_out().tolist()
                    feature_importances = {
                        k: round(float(v), 4)
                        for k, v in zip(names, clf_step.feature_importances_)
                    }
        except Exception:
            pass

        return {
            "predicted_class": predicted_class,
            "class_probabilities": class_probabilities,
            "confidence_score": confidence_score,
            "temperature_difference": temp_delta,
            "humidity_difference": hum_delta,
            "model_name": _model_name,
            "model_version": _model_version,
            "model_status": "trained",
            "dataset_provenance": "synthetic",
            "uncalibrated_probability_note": uncalibrated_note,
            "prediction_timestamp": ts,
            "input_feature_availability": feature_availability,
            "feature_importance": feature_importances,
            "notes": (
                f"Predicted as {predicted_class.upper()} using trained {_model_name} ({_model_version}). "
                "Inputs include local & outdoor reference temperature/humidity, deltas, hour, and season. "
                "Probabilities are uncalibrated model estimates from synthetic data."
            ),
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": scientific_disclaimer,
        }
    except Exception as e:
        logger.error(f"Inference error: {e}", exc_info=True)
        return {
            "predicted_class": "Unknown",
            "class_probabilities": None,
            "confidence_score": None,
            "temperature_difference": temp_delta,
            "humidity_difference": hum_delta,
            "model_name": _model_name,
            "model_version": _model_version,
            "model_status": "error",
            "dataset_provenance": "synthetic",
            "uncalibrated_probability_note": uncalibrated_note,
            "prediction_timestamp": ts,
            "input_feature_availability": feature_availability,
            "feature_importance": None,
            "notes": f"Inference execution error: {str(e)}",
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": scientific_disclaimer,
        }




def train_classifier_pipeline(dataset: List[Dict[str, Any]], save_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Standard training pipeline for labelled indoor/outdoor environmental observations.
    Input format:list of dicts with:
      {'temperature': ..., 'humidity': ..., 'pm1_0': ..., 'pm2_5': ..., 'pm10': ..., 'hour': ..., 'label': 'indoor'|'outdoor'}
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

    if len(dataset) < 10:
        raise ValueError("Dataset requires at least 10 labelled observations to train.")

    X = []
    y = []
    for row in dataset:
        X.append([
            row["temperature"],
            row["humidity"],
            row["pm1_0"],
            row["pm2_5"],
            row["pm10"],
            row.get("hour", 12)
        ])
        y.append(row["label"].lower())

    X = np.array(X)
    y = np.array(y)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    clf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 3),
        "precision": round(float(precision_score(y_test, y_pred, average='weighted', zero_division=0)), 3),
        "recall": round(float(recall_score(y_test, y_pred, average='weighted', zero_division=0)), 3),
        "f1": round(float(f1_score(y_test, y_pred, average='weighted', zero_division=0)), 3),
    }

    target = save_path or settings.CLASSIFIER_MODEL_PATH
    os.makedirs(os.path.dirname(target), exist_ok=True)
    joblib.dump(clf, target)

    if save_path is None or save_path == settings.CLASSIFIER_MODEL_PATH:
        global _cached_classifier, _model_version
        _cached_classifier = clf
        _model_version = f"v1.0-rf-n{len(dataset)}"

    return {
        "status": "success",
        "model_version": _model_version,
        "saved_path": target,
        "evaluation_metrics": metrics
    }


# Attempt initial model load
load_classifier()




