"""
Master End-to-End Training and Evaluation Pipeline.
Implements Section 16 (Architecture) & Section 18 (Recommended Development Order).
1. Prepares dataset for Eastern India / Jharkhand (Seasons 2021-2023 for Train, 2024 for Held-Out Test).
2. Trains Model 1: XGBoost Regime Classifier.
3. Trains Model 2: XGBoost Error Regressor (conditioned on detected regime).
4. Trains Model 3: XGBoost Heavy-Rain Probability Classifier.
5. Runs Verification Engine (RMSE, ETS, CSI, POD, FAR, FSS).
6. Persists models and verification report.
"""

import os
import sys
import json
import pandas as pd
import numpy as np

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data.data_generator import create_prototype_datasets
from src.models.model1_regime import RegimeClassifier
from src.models.model2_error_regressor import RainfallErrorRegressor
from src.models.model3_heavy_rain import HeavyRainClassifier
from src.evaluation.metrics import generate_verification_report

def run_pipeline():
    print("=" * 70)
    print("REGIME-AWARE AI POST-PROCESSING OF MONSOON RAINFALL FORECASTS")
    print("=" * 70)

    # 1. Dataset Generation / Loading
    train_path = "data/prototype_jharkhand_train.csv"
    test_path = "data/prototype_jharkhand_test.csv"

    if not os.path.exists(train_path) or not os.path.exists(test_path):
        print("\n[Step 1] Generating Prototype Monsoon Datasets (Strict Seasonal Split)...")
        train_df, test_df = create_prototype_datasets("data")
    else:
        print("\n[Step 1] Loading existing datasets...")
        train_df = pd.read_csv(train_path)
        test_df = pd.read_csv(test_path)

    print(f"-> Train samples (Monsoon 2021-2023): {len(train_df)}")
    print(f"-> Held-Out Test samples (Monsoon 2024): {len(test_df)}")

    # 2. Train Model 1: Weather Regime Classifier
    print("\n" + "=" * 70)
    print("[Step 2] Training Model 1: Weather Regime Classifier (XGBoost)...")
    model1 = RegimeClassifier()
    model1.fit(train_df)
    m1_eval = model1.evaluate(test_df)
    model1.save("models/model1_regime.joblib")

    # Predict regimes for train and test sets
    train_detected_regimes, _ = model1.predict(train_df)
    test_detected_regimes, test_regime_probs = model1.predict(test_df)

    # 3. Train Model 2: Rainfall Post-Processing Error Regressor
    print("\n" + "=" * 70)
    print("[Step 3] Training Model 2: Rainfall Error Regressor (Conditioned on Regime)...")
    model2 = RainfallErrorRegressor()
    model2.fit(train_df, detected_regimes=train_detected_regimes)
    m2_eval = model2.evaluate(test_df, detected_regimes=test_detected_regimes)
    model2.save("models/model2_error.joblib")

    # Compute corrected rainfall
    train_corrected_rain, _ = model2.predict_corrected_rainfall(train_df, detected_regimes=train_detected_regimes)
    test_corrected_rain, test_pred_error = model2.predict_corrected_rainfall(test_df, detected_regimes=test_detected_regimes)

    test_df["detected_regime"] = test_detected_regimes
    test_df["predicted_error_mm"] = test_pred_error
    test_df["corrected_rainfall_mm"] = test_corrected_rain

    # 4. Train Model 3: Heavy Rainfall Probability Classifier
    print("\n" + "=" * 70)
    print("[Step 4] Training Model 3: Heavy-Rain Probability Classifier (Threshold >= 64.5 mm)...")
    model3 = HeavyRainClassifier()
    model3.fit(train_df, corrected_rainfall=train_corrected_rain, detected_regimes=train_detected_regimes)
    m3_eval = model3.evaluate(test_df, corrected_rainfall=test_corrected_rain, detected_regimes=test_detected_regimes)
    model3.save("models/model3_heavy_rain.joblib")

    test_heavy_probs = model3.predict_probability(test_df, corrected_rainfall=test_corrected_rain, detected_regimes=test_detected_regimes)
    test_df["heavy_rain_prob"] = test_heavy_probs

    # Save enriched test predictions
    test_df.to_csv("data/test_predictions_enriched.csv", index=False)
    print("Enriched test predictions saved to data/test_predictions_enriched.csv")

    # 5. Verification & Comparative Report
    print("\n" + "=" * 70)
    print("[Step 5] Computing Meteorological Verification Metrics (Held-Out Monsoon 2024)...")
    report = generate_verification_report(test_df, corrected_col="corrected_rainfall_mm")

    with open("data/verification_results.json", "w") as f:
        json.dump(report, f, indent=2)

    # Format Markdown comparison table for console
    print("\n================ METEOROLOGICAL VERIFICATION REPORT ================")
    print(f"Test Period: {report['test_period']} | Total Verification Samples: {report['sample_size']}")
    print(f"Operational Heavy Rain Threshold: >= {report['heavy_rain_threshold_mm']} mm / 24hr\n")

    metrics_names = [
        "RMSE (mm)", "MAE (mm)", "Mean Bias (mm)", "Correlation (r)",
        "POD (Hit Rate)", "FAR (False Alarm Ratio)", "CSI (Threat Score)", "ETS (Equitable Threat Score)", "FSS (Spatial Skill)"
    ]

    header = f"{'Metric':<32} | {'Raw NWP':<12} | {'Simple Bias Corr':<16} | {'Regime-Aware XGBoost':<20}"
    print(header)
    print("-" * len(header))

    for m in metrics_names:
        v_raw = report["comparison"]["Raw NWP Forecast"][m]
        v_simple = report["comparison"]["Simple Global Bias Correction"][m]
        v_xgb = report["comparison"]["Regime-Aware XGBoost System"][m]
        print(f"{m:<32} | {v_raw:<12} | {v_simple:<16} | {v_xgb:<20}")

    print("=" * len(header))
    print("Verification results persisted to data/verification_results.json")
    print("All 3 models trained and ready for backend deployment.")

if __name__ == "__main__":
    run_pipeline()
