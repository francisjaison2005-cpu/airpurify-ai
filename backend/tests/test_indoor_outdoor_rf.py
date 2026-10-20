"""
Tests for Random Forest Indoor/Outdoor ML Classifier:
- Dataset loading and validation
- Pipeline training and reloading
- Reproducible inference using identical ColumnTransformer pipeline
- Both prediction classes ('indoor', 'outdoor')
- Pydantic validation and rejection of invalid inputs
- Incomplete input handling ('Insufficient Data')
- Missing model artifact safe handling ('model_not_configured')
- Metric and metadata provenance ('synthetic')
"""

import os
import json
import pytest
import joblib
import pandas as pd
from unittest.mock import patch
from sklearn.pipeline import Pipeline

from backend.scripts.train_indoor_outdoor import (
    load_and_validate_dataset,
    DEFAULT_DATASET_PATH,
    DEFAULT_OUTPUT_DIR,
    NUMERIC_FEATURES,
    CATEGORICAL_FEATURES,
)


def test_dataset_loading_and_validation():
    """Verify dataset loading, row counts, columns, zero nulls, and delta consistency."""
    df = load_and_validate_dataset(DEFAULT_DATASET_PATH)
    assert len(df) == 2000
    assert set(df["label"].unique()) == {"indoor", "outdoor"}
    assert (df["label"] == "indoor").sum() == 1000
    assert (df["label"] == "outdoor").sum() == 1000
    assert df.isnull().sum().sum() == 0

    # Physical range validations
    assert (df["humidity_pct"] >= 0).all() and (df["humidity_pct"] <= 100).all()
    assert (df["hour_of_day"] >= 0).all() and (df["hour_of_day"] <= 23).all()

    # Differential consistency
    temp_err = (df["temperature_c"] - df["outdoor_reference_temperature_c"] - df["temperature_delta_c"]).abs().max()
    hum_err = (df["humidity_pct"] - df["outdoor_reference_humidity_pct"] - df["humidity_delta_pct"]).abs().max()
    assert temp_err <= 0.02
    assert hum_err <= 0.02


def test_saved_model_reloading():
    """Verify saved Random Forest model can be reloaded and maintains pipeline steps."""
    model_path = os.path.join(DEFAULT_OUTPUT_DIR, "indoor_outdoor_rf.joblib")
    assert os.path.exists(model_path), f"Trained model not found at {model_path}"

    loaded_pipe = joblib.load(model_path)
    assert isinstance(loaded_pipe, Pipeline)
    assert "preprocessor" in loaded_pipe.named_steps
    assert "classifier" in loaded_pipe.named_steps
    assert hasattr(loaded_pipe.named_steps["classifier"], "predict_proba")
    assert hasattr(loaded_pipe.named_steps["classifier"], "feature_importances_")


def test_both_prediction_classes_via_api(client):
    """Verify that both 'indoor' and 'outdoor' classes are predicted on typical archetypes."""
    # Archetype 1: AC Enclosed Room (large thermal decoupling: ΔT = -12°C, ΔRH = -23%)
    indoor_payload = {
        "temperature_c": 22.0,
        "humidity_pct": 45.0,
        "outdoor_reference_temperature_c": 34.0,
        "outdoor_reference_humidity_pct": 68.0,
        "temperature_delta_c": -12.0,
        "humidity_delta_pct": -23.0,
        "hour_of_day": 14,
        "season": "summer",
    }
    res_in = client.post("/api/predictions/indoor-outdoor", json=indoor_payload)
    assert res_in.status_code == 200
    data_in = res_in.json()
    assert data_in["model_status"] == "trained"
    assert data_in["predicted_class"] == "indoor"
    assert data_in["dataset_provenance"] == "synthetic"
    assert "uncalibrated" in data_in["uncalibrated_probability_note"].lower()
    assert "indoor" in data_in["class_probabilities"]
    assert "outdoor" in data_in["class_probabilities"]
    assert data_in["class_probabilities"]["indoor"] > 0.50
    assert abs(data_in["temperature_difference"] - (-12.0)) < 0.1
    assert abs(data_in["humidity_difference"] - (-23.0)) < 0.1

    # Archetype 2: Ambient Tracking (outdoor roadside in equilibrium: ΔT = 0.2°C, ΔRH = 0.5%)
    outdoor_payload = {
        "temperature_c": 33.2,
        "humidity_pct": 65.5,
        "outdoor_reference_temperature_c": 33.0,
        "outdoor_reference_humidity_pct": 65.0,
        "temperature_delta_c": 0.2,
        "humidity_delta_pct": 0.5,
        "hour_of_day": 12,
        "season": "summer",
    }
    res_out = client.post("/api/predictions/indoor-outdoor", json=outdoor_payload)
    assert res_out.status_code == 200
    data_out = res_out.json()
    assert data_out["model_status"] == "trained"
    assert data_out["predicted_class"] == "outdoor"
    assert data_out["class_probabilities"]["outdoor"] > 0.50


def test_invalid_inputs_rejected_by_pydantic(client):
    """Verify that physical out-of-bound inputs are rejected with HTTP 422."""
    # Out of range humidity (> 100%)
    invalid_hum = {
        "temperature_c": 25.0,
        "humidity_pct": 140.0,
        "outdoor_reference_temperature_c": 30.0,
        "outdoor_reference_humidity_pct": 60.0,
        "hour_of_day": 12,
        "season": "summer",
    }
    res = client.post("/api/predictions/indoor-outdoor", json=invalid_hum)
    assert res.status_code == 422

    # Out of range hour (> 23)
    invalid_hour = {
        "temperature_c": 25.0,
        "humidity_pct": 50.0,
        "outdoor_reference_temperature_c": 30.0,
        "outdoor_reference_humidity_pct": 60.0,
        "hour_of_day": 25,
        "season": "summer",
    }
    res = client.post("/api/predictions/indoor-outdoor", json=invalid_hour)
    assert res.status_code == 422


def test_incomplete_inputs_return_insufficient_data(client):
    """Verify that incomplete inputs return 'Insufficient Data' and do NOT fabricate predictions."""
    # Missing outdoor reference measurements
    incomplete_payload = {
        "temperature_c": 24.0,
        "humidity_pct": 50.0,
        # outdoor reference omitted
        "hour_of_day": 10,
        "season": "monsoon",
    }
    res = client.post("/api/predictions/indoor-outdoor", json=incomplete_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["model_status"] == "insufficient_data"
    assert data["predicted_class"] == "Insufficient Data"
    assert data["class_probabilities"] is None
    assert data["confidence_score"] is None
    assert "Insufficient Data" in data["notes"]
    assert "PMS7003" in data["notes"]


def test_missing_model_artifact_handled_safely(client):
    """Verify safe handling when model file is unavailable."""
    with patch("backend.app.services.indoor_outdoor.load_classifier", return_value=None):
        with patch("backend.app.services.indoor_outdoor._cached_classifier", None):
            res = client.post(
                "/api/predictions/indoor-outdoor",
                json={
                    "temperature_c": 22.0,
                    "humidity_pct": 45.0,
                    "outdoor_reference_temperature_c": 32.0,
                    "outdoor_reference_humidity_pct": 60.0,
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert data["model_status"] == "model_not_configured"
            assert data["predicted_class"] == "Unknown"
            assert data["class_probabilities"] is None


def test_metadata_and_metrics_artifacts():
    """Verify existence and structure of metrics.json and metadata.json."""
    metrics_path = os.path.join(DEFAULT_OUTPUT_DIR, "indoor_outdoor_metrics.json")
    metadata_path = os.path.join(DEFAULT_OUTPUT_DIR, "indoor_outdoor_metadata.json")

    assert os.path.exists(metrics_path)
    assert os.path.exists(metadata_path)

    with open(metrics_path, "r", encoding="utf-8") as f:
        metrics = json.load(f)
    assert metrics["dataset_type"] == "synthetic"
    assert "Synthetic Dataset Evaluation" in metrics["evaluation_title"]
    assert metrics["test_metrics"]["accuracy"] > 0.80
    assert "confusion_matrix" in metrics
    assert "feature_importances" in metrics

    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    assert metadata["algorithm"] == "RandomForestClassifier"
    assert metadata["dataset_type"] == "synthetic"
    assert "target_labels" in metadata
    assert "feature_schema" in metadata
    assert "evaluation_limitations" in metadata
    assert "PMS7003" in metadata["hardware_compatibility_note"]
