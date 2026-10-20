"""
AirPurify AI — Indoor/Outdoor Random Forest Classifier Training Script
Dataset: backend/datasets/indoor_outdoor_synthetic_dataset.csv

IMPORTANT:
This dataset is synthetically generated. Its metrics reflect synthetic data evaluation
and are NOT validated on real-world sensor data. Real-world indoor/outdoor classification
requires validation with calibrated multi-sensor hardware (e.g. BME280 / SHT31).
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_indoor_outdoor")

# Default paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATASET_PATH = os.path.join(BASE_DIR, "datasets", "indoor_outdoor_synthetic_dataset.csv")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "models")
ML_ARTIFACTS_DIR = os.path.join(BASE_DIR, "app", "ml_artifacts")

RANDOM_STATE = 42
MODEL_VERSION = "rf-synthetic-v1.0"
DISCLAIMER = "Synthetic Dataset Evaluation — Not Validated on Real-World Sensor Data"

NUMERIC_FEATURES = [
    "temperature_c",
    "humidity_pct",
    "outdoor_reference_temperature_c",
    "outdoor_reference_humidity_pct",
    "temperature_delta_c",
    "humidity_delta_pct",
    "hour_of_day",
]
CATEGORICAL_FEATURES = ["season"]
REQUIRED_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES + ["label"]
EXPECTED_CLASSES = ["indoor", "outdoor"]


def load_and_validate_dataset(csv_path: str) -> pd.DataFrame:
    """
    Loads dataset from CSV and runs thorough validation:
    - Checks required columns, row count, target classes, class distribution.
    - Checks for missing values, duplicates, and out-of-range humidity/hours.
    - Confirms temperature and humidity difference columns match measurements within rounding.
    - Strictly does not generate invented rows or fill sensor observations.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at: {csv_path}")

    logger.info(f"Loading dataset from: {csv_path}")
    df = pd.read_csv(csv_path)

    # 1. Verify required columns
    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        raise ValueError(f"Dataset missing required columns: {missing_cols}")

    # 2. Verify row count
    logger.info(f"Dataset loaded with {len(df)} rows and {len(df.columns)} columns.")
    if len(df) == 0:
        raise ValueError("Dataset is empty.")

    # 3. Detect missing values & duplicates
    null_counts = df[REQUIRED_COLUMNS].isnull().sum()
    if null_counts.sum() > 0:
        raise ValueError(f"Dataset contains missing values:\n{null_counts[null_counts > 0]}")

    duplicates = df.duplicated().sum()
    if duplicates > 0:
        logger.warning(f"Dataset contains {duplicates} duplicate rows; preserving original data.")

    # 4. Verify target classes and class distribution
    unique_labels = sorted(df["label"].unique().tolist())
    if set(unique_labels) != set(EXPECTED_CLASSES):
        raise ValueError(f"Unexpected target labels: {unique_labels}. Expected: {EXPECTED_CLASSES}")

    class_distribution = df["label"].value_counts().to_dict()
    logger.info(f"Class distribution: {class_distribution}")

    # 5. Check physical value ranges
    if (df["humidity_pct"] < 0).any() or (df["humidity_pct"] > 100).any():
        raise ValueError("Detected out-of-range local humidity values (must be 0-100%).")
    if (df["outdoor_reference_humidity_pct"] < 0).any() or (df["outdoor_reference_humidity_pct"] > 100).any():
        raise ValueError("Detected out-of-range outdoor humidity values (must be 0-100%).")
    if (df["hour_of_day"] < 0).any() or (df["hour_of_day"] > 23).any():
        raise ValueError("Detected out-of-range hour_of_day (must be 0-23).")

    # 6. Confirm delta consistency (allowing 0.05 rounding tolerance)
    temp_calc_delta = df["temperature_c"] - df["outdoor_reference_temperature_c"]
    temp_mismatch = (temp_calc_delta - df["temperature_delta_c"]).abs().max()
    hum_calc_delta = df["humidity_pct"] - df["outdoor_reference_humidity_pct"]
    hum_mismatch = (hum_calc_delta - df["humidity_delta_pct"]).abs().max()

    logger.info(f"Max absolute temp delta rounding difference: {temp_mismatch:.4f}°C")
    logger.info(f"Max absolute humidity delta rounding difference: {hum_mismatch:.4f}%")

    if temp_mismatch > 0.05:
        raise ValueError(f"Temperature delta exceeds acceptable rounding tolerance: {temp_mismatch}")
    if hum_mismatch > 0.05:
        raise ValueError(f"Humidity delta exceeds acceptable rounding tolerance: {hum_mismatch}")

    return df


def build_pipeline() -> Pipeline:
    """
    Constructs scikit-learn ColumnTransformer and Pipeline.
    Inference uses exactly the same preprocessing pipeline as training.
    """
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
        ]
    )

    classifier = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )
    return pipeline


def train_model(
    dataset_path: str = DEFAULT_DATASET_PATH,
    output_dir: str = DEFAULT_OUTPUT_DIR,
) -> Tuple[Pipeline, Dict[str, Any], Dict[str, Any]]:
    """
    Executes training workflow:
    1. Loads and validates dataset.
    2. Performs stratified 80/20 train/test split.
    3. Runs 5-fold cross-validation on training partition only.
    4. Fits pipeline on training split.
    5. Evaluates model on holdout test partition.
    6. Extracts feature importances with transformed feature names.
    7. Saves pipeline, metrics, and metadata artifacts.
    """
    df = load_and_validate_dataset(dataset_path)

    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = df["label"]

    # Reproducible stratified 80/20 train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_STATE, stratify=y
    )
    logger.info(f"Train samples: {len(X_train)}, Test samples: {len(X_test)}")

    pipeline = build_pipeline()

    # 5-fold cross-validation on training split only
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_scoring = ["accuracy", "precision_macro", "recall_macro", "f1_macro"]
    logger.info("Executing 5-fold cross-validation on training partition...")
    cv_results = cross_validate(pipeline, X_train, y_train, cv=cv, scoring=cv_scoring)

    # Fit pipeline strictly on training data
    logger.info("Fitting Random Forest pipeline on training split...")
    pipeline.fit(X_train, y_train)

    # Evaluate on holdout test split
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)
    classes = pipeline.classes_.tolist()

    # Actual test metrics computed directly from execution
    test_accuracy = float(accuracy_score(y_test, y_pred))
    test_precision_macro = float(precision_score(y_test, y_pred, average="macro"))
    test_recall_macro = float(recall_score(y_test, y_pred, average="macro"))
    test_f1_macro = float(f1_score(y_test, y_pred, average="macro"))

    test_precision_weighted = float(precision_score(y_test, y_pred, average="weighted"))
    test_recall_weighted = float(recall_score(y_test, y_pred, average="weighted"))
    test_f1_weighted = float(f1_score(y_test, y_pred, average="weighted"))

    # Per-class metrics
    per_class_metrics = {}
    for cls in classes:
        per_class_metrics[cls] = {
            "precision": float(precision_score(y_test, y_pred, pos_label=cls)),
            "recall": float(recall_score(y_test, y_pred, pos_label=cls)),
            "f1_score": float(f1_score(y_test, y_pred, pos_label=cls)),
            "support": int((y_test == cls).sum()),
        }

    conf_matrix = confusion_matrix(y_test, y_pred, labels=classes).tolist()
    class_report_str = classification_report(y_test, y_pred, digits=4)
    class_report_dict = classification_report(y_test, y_pred, output_dict=True)

    # Feature importances with transformed feature names
    preprocessor = pipeline.named_steps["preprocessor"]
    transformed_feature_names = preprocessor.get_feature_names_out().tolist()
    raw_importances = pipeline.named_steps["classifier"].feature_importances_.tolist()
    feature_importances = {
        name: round(float(imp), 6)
        for name, imp in sorted(zip(transformed_feature_names, raw_importances), key=lambda x: x[1], reverse=True)
    }

    metrics_payload = {
        "evaluation_title": DISCLAIMER,
        "evaluation_type": "synthetic_holdout_test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset_type": "synthetic",
        "sample_counts": {
            "total": len(df),
            "train": len(X_train),
            "test": len(X_test),
        },
        "test_metrics": {
            "accuracy": round(test_accuracy, 4),
            "precision_macro": round(test_precision_macro, 4),
            "recall_macro": round(test_recall_macro, 4),
            "f1_macro": round(test_f1_macro, 4),
            "precision_weighted": round(test_precision_weighted, 4),
            "recall_weighted": round(test_recall_weighted, 4),
            "f1_weighted": round(test_f1_weighted, 4),
        },
        "per_class_metrics": per_class_metrics,
        "confusion_matrix": {
            "classes": classes,
            "matrix": conf_matrix,
        },
        "cross_validation_training": {
            "folds": 5,
            "accuracy_mean": round(float(cv_results["test_accuracy"].mean()), 4),
            "accuracy_std": round(float(cv_results["test_accuracy"].std()), 4),
            "f1_macro_mean": round(float(cv_results["test_f1_macro"].mean()), 4),
            "f1_macro_std": round(float(cv_results["test_f1_macro"].std()), 4),
            "precision_macro_mean": round(float(cv_results["test_precision_macro"].mean()), 4),
            "recall_macro_mean": round(float(cv_results["test_recall_macro"].mean()), 4),
        },
        "feature_importances": feature_importances,
        "classification_report": class_report_dict,
        "classification_report_text": class_report_str,
    }

    metadata_payload = {
        "model_name": "indoor_outdoor_rf",
        "algorithm": "RandomForestClassifier",
        "model_version": MODEL_VERSION,
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset_filename": os.path.basename(dataset_path),
        "dataset_type": "synthetic",
        "target_labels": classes,
        "scikit_learn_version": sklearn.__version__,
        "hyperparameters": {
            "n_estimators": 300,
            "max_depth": 12,
            "min_samples_split": 5,
            "min_samples_leaf": 2,
            "class_weight": "balanced",
            "random_state": RANDOM_STATE,
            "n_jobs": -1,
        },
        "feature_schema": {
            "numeric_features": NUMERIC_FEATURES,
            "categorical_features": CATEGORICAL_FEATURES,
            "transformed_features": transformed_feature_names,
        },
        "evaluation_limitations": (
            "Model was trained strictly on synthetically generated microclimate data. "
            "Metrics reflect synthetic distribution behavior and must NOT be interpreted as validated "
            "real-world accuracy. Real sensor noise, building thermal inertia, and varying outdoor "
            "micro-climates require validation against calibrated physical sensors."
        ),
        "hardware_compatibility_note": (
            "Plantower PMS7003 measures particulate matter only. Local temperature and humidity measurements "
            "require additional calibrated sensors such as Bosch BME280 or Sensirion SHT31. Outdoor weather API "
            "conditions must not be used as indoor sensor readings."
        ),
    }

    # Save artifacts
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(ML_ARTIFACTS_DIR, exist_ok=True)

    model_path = os.path.join(output_dir, "indoor_outdoor_rf.joblib")
    metrics_path = os.path.join(output_dir, "indoor_outdoor_metrics.json")
    metadata_path = os.path.join(output_dir, "indoor_outdoor_metadata.json")

    joblib.dump(pipeline, model_path)
    logger.info(f"Saved trained pipeline to: {model_path}")

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)
    logger.info(f"Saved metrics to: {metrics_path}")

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata_payload, f, indent=2)
    logger.info(f"Saved metadata to: {metadata_path}")

    # Also sync a copy to ml_artifacts for backward compatibility with settings
    joblib.dump(pipeline, os.path.join(ML_ARTIFACTS_DIR, "indoor_outdoor_clf.joblib"))
    with open(os.path.join(ML_ARTIFACTS_DIR, "indoor_outdoor_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata_payload, f, indent=2)

    # Print summary
    print("\n" + "=" * 70)
    print("  AIRPURIFY AI — RANDOM FOREST INDOOR/OUTDOOR CLASSIFIER")
    print(f"  {DISCLAIMER}")
    print("=" * 70)
    print(f"Dataset             : {dataset_path} ({len(df)} samples)")
    print(f"Train/Test Split    : {len(X_train)} train / {len(X_test)} test (Stratified 80/20)")
    print(f"Test Accuracy       : {test_accuracy * 100:.2f}%")
    print(f"Test Precision (W)  : {test_precision_weighted * 100:.2f}%")
    print(f"Test Recall (W)     : {test_recall_weighted * 100:.2f}%")
    print(f"Test F1-Score (W)   : {test_f1_weighted * 100:.2f}%")
    print(f"5-Fold CV Mean Acc  : {cv_results['test_accuracy'].mean() * 100:.2f}% (+/- {cv_results['test_accuracy'].std() * 100:.2f}%)")
    print(f"Confusion Matrix    : {conf_matrix} (labels: {classes})")
    print("\nClassification Report:\n" + class_report_str)
    print("Top Feature Importances:")
    for feat, imp in list(feature_importances.items())[:6]:
        print(f"  - {feat:35s}: {imp * 100:.2f}%")
    print(f"\nArtifacts saved successfully:")
    print(f"  1. Model     -> {model_path}")
    print(f"  2. Metrics   -> {metrics_path}")
    print(f"  3. Metadata  -> {metadata_path}")
    print("=" * 70 + "\n")

    return pipeline, metrics_payload, metadata_payload


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train Indoor/Outdoor Random Forest Classifier")
    parser.add_argument("--dataset", type=str, default=DEFAULT_DATASET_PATH, help="Path to synthetic CSV dataset")
    parser.add_argument("--output-dir", type=str, default=DEFAULT_OUTPUT_DIR, help="Directory to save model artifacts")
    args = parser.parse_args()

    train_model(dataset_path=args.dataset, output_dir=args.output_dir)
