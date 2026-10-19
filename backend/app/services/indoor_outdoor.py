import os
import joblib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import numpy as np

from ..config import settings

#
# In-memory cached model
_cached_classifier = None
_model_version = "v1.0-untrained"


def load_classifier():
    """Attempts to load a trained scikit-learn or joblib pipeline if available on disk."""
    global _cached_classifier, _model_version
    path = settings.CLASSIFIER_MODEL_PATH
    if os.path.exists(path):
        try:
            _cached_classifier = joblib.load(path)
            _model_version = "v1.0-trained"
            return _cached_classifier
        except Exception:
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
    temperature: Optional[float] = None,
    humidity: Optional[float] = None,
    pm1_0: Optional[float] = None,
    pm2_5: Optional[float] = None,
    pm10: Optional[float] = None,
    temporal_hour: Optional[int] = None,
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
    Evaluates environmental features for indoor vs outdoor classification.
    Adheres strictly to scientific requirements:
    - If no trained model is loaded, returns `model_status: 'model_not_configured'`.
    - Does NOT invent synthetic confidence scores or fabricate classifications.
    - Accurately tracks input feature availability and provenance (sensor, weather_api, manual).
    - Highlights scientific reality: Temperature and humidity alone cannot reliably distinguish
      indoor from outdoor environments due to overlapping micro-climates.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    feature_availability = {
        "temperature": temperature is not None,
        "humidity": humidity is not None,
        "pm1_0": pm1_0 is not None,
        "pm2_5": pm2_5 is not None,
        "pm10": pm10 is not None,
        "temporal_hour": temporal_hour is not None,
        "location": (latitude is not None and longitude is not None),
    }

    location_context = {
        "latitude": latitude,
        "longitude": longitude,
        "location_name": location_name,
        "gps_accuracy_m": gps_accuracy_m,
        "location_id": location_id,
        "weather_provider": weather_provider,
        "observation_timestamp": observation_timestamp or now_iso,
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
        "Prediction unavailable â€” a validated indoor/outdoor model is not configured. "
        "Temperature and relative humidity alone cannot reliably distinguish indoor from outdoor "
        "environments because ambient and indoor ranges frequently overlap (e.g., HVAC conditioned "
        "rooms vs temperate weather). Plantower PMS7003 sensors measure particulate matter only; "
        "ambient weather values reflect outdoor assimilation at geographical coordinates, not indoor "
        "room micro-climates. A scientifically honest classification requires trained multi-sensor "
        "differential models calibrated against ground-truth indoor/outdoor labels."
    )

    clf = _cached_classifier or load_classifier()

    if clf is None:
        return {
            "predicted_class": "Unknown",
            "prediction_timestamp": now_iso,
            "model_version": "untrained-placeholder",
            "model_status": "model_not_configured",
            "confidence_score": None,
            "input_feature_availability": feature_availability,
            "feature_importance": None,
            "notes": (
                "Prediction unavailable â€” a validated indoor/outdoor model is not configured. "
                "The supervised training pipeline is available via train_classifier_pipeline(). "
                "Labelled sensor observations are required to train and evaluate the classifier."
            ),
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": scientific_disclaimer,
        }

    # If model is loaded, run real inference
    try:
        hour = temporal_hour if temporal_hour is not None else datetime.now(timezone.utc).hour
        features = np.array([[temperature, humidity, pm1_0, pm2_5, pm10, hour]])
        pred = clf.predict(features)[0]
        prob = None
        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba(features)[0]
            prob = float(np.max(probs))

        importance = None
        if hasattr(clf, "feature_importances_"):
            feature_names = ["temp", "humidity", "pm1_0", "pm2_5", "pm10", "hour"]
            importance = {k: float(v) for k, v in zip(feature_names, clf.feature_importances_)}

        return {
            "predicted_class": str(pred).capitalize(),
            "prediction_timestamp": now_iso,
            "model_version": _model_version,
            "model_status": "trained",
            "confidence_score": round(prob, 3) if prob is not None else None,
            "input_feature_availability": feature_availability,
            "feature_importance": importance,
            "notes": f"Predicted using trained classifier {_model_version} on validated input features.",
            "data_source": data_source,
            "location_context": location_context,
            "heuristic_evaluation": heuristic_info,
            "scientific_disclaimer": None,
        }
    except Exception as e:
        return {
            "predicted_class": "Unknown",
            "prediction_timestamp": now_iso,
            "model_version": _model_version,
            "model_status": "model_not_configured",
            "confidence_score": None,
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

    global _cached_classifier, _model_version
    _cached_classifier = clf
    _model_version = f"v1.0-rf-n{len(dataset)}"

    return {
        "status": "success",
        "model_version": _model_version,
        "saved_path": target,
        "evaluation_metrics": metrics    }




