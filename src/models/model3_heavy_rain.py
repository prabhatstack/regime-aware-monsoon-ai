"""
Model 3: Heavy-Rainfall Probability Classifier using XGBoost.
Estimates the probability that rainfall will cross operational threshold (>= 64.5 mm).
Implements class-balance weighting and probability calibration.
Corresponds to Section 9 of the Blueprint.
"""

import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from xgboost import XGBClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss, classification_report

from src.data.schema import THRESHOLDS, REGIMES

class HeavyRainClassifier:
    def __init__(self, threshold_mm: float = THRESHOLDS["HEAVY_RAIN"]):
        self.threshold_mm = threshold_mm
        self.base_model = None
        self.calibrated_model = None
        self.feature_cols = [
            "nwp_rainfall_mm",
            "corrected_rainfall_mm",
            "humidity",
            "pressure",
            "geopotential",
            "u_wind",
            "v_wind",
            "temperature",
            "lead_time_hr"
        ] + [f"regime_{r}" for r in REGIMES]
        self.is_trained = False

    def _prepare_features(self, df: pd.DataFrame, corrected_rainfall: np.ndarray, detected_regimes: np.ndarray = None) -> pd.DataFrame:
        df_proc = df.copy()
        df_proc["corrected_rainfall_mm"] = corrected_rainfall

        regime_series = pd.Series(detected_regimes if detected_regimes is not None else df_proc["regime"])
        for r in REGIMES:
            df_proc[f"regime_{r}"] = (regime_series.values == r).astype(float)

        return df_proc[self.feature_cols]

    def fit(self, train_df: pd.DataFrame, corrected_rainfall: np.ndarray, detected_regimes: np.ndarray = None) -> Dict[str, float]:
        X = self._prepare_features(train_df, corrected_rainfall, detected_regimes)
        y = (train_df["reference_rainfall_mm"] >= self.threshold_mm).astype(int).values

        # Compute positive class scale weight for imbalanced extreme events
        neg_count = (y == 0).sum()
        pos_count = (y == 1).sum()
        scale_weight = float(neg_count / max(pos_count, 1))

        self.base_model = XGBClassifier(
            n_estimators=180,
            max_depth=5,
            learning_rate=0.06,
            scale_pos_weight=scale_weight,
            subsample=0.85,
            colsample_bytree=0.85,
            eval_metric="logloss",
            random_state=42
        )

        # Calibrated classifier for reliable probabilistic outputs
        self.calibrated_model = CalibratedClassifierCV(
            estimator=self.base_model,
            method="sigmoid",
            cv=3
        )
        self.calibrated_model.fit(X, y)
        self.is_trained = True

        probs = self.calibrated_model.predict_proba(X)[:, 1]
        auc = roc_auc_score(y, probs) if len(np.unique(y)) > 1 else 0.5
        brier = brier_score_loss(y, probs)

        print(f"[Model 3] Train ROC-AUC: {auc:.3f} | Brier Score: {brier:.4f}")
        return {"train_roc_auc": float(auc), "train_brier_score": float(brier)}

    def predict_probability(self, df: pd.DataFrame, corrected_rainfall: np.ndarray, detected_regimes: np.ndarray = None) -> np.ndarray:
        if not self.is_trained:
            raise RuntimeError("Model 3 has not been trained or loaded yet.")
        X = self._prepare_features(df, corrected_rainfall, detected_regimes)
        probs = self.calibrated_model.predict_proba(X)[:, 1]
        return np.round(probs, 3)

    def evaluate(self, test_df: pd.DataFrame, corrected_rainfall: np.ndarray, detected_regimes: np.ndarray = None) -> Dict[str, Any]:
        X = self._prepare_features(test_df, corrected_rainfall, detected_regimes)
        y = (test_df["reference_rainfall_mm"] >= self.threshold_mm).astype(int).values

        probs = self.calibrated_model.predict_proba(X)[:, 1]
        preds = (probs >= 0.5).astype(int)

        auc = roc_auc_score(y, probs) if len(np.unique(y)) > 1 else 0.5
        brier = brier_score_loss(y, probs)
        report = classification_report(y, preds, output_dict=True, zero_division=0)

        print(f"[Model 3] Held-Out Test ROC-AUC: {auc:.3f} | Brier Score: {brier:.4f}")
        return {
            "test_roc_auc": float(auc),
            "test_brier_score": float(brier),
            "classification_report": report
        }

    def save(self, filepath: str = "models/model3_heavy_rain.joblib"):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            "calibrated_model": self.calibrated_model,
            "feature_cols": self.feature_cols,
            "threshold_mm": self.threshold_mm
        }, filepath)
        print(f"[Model 3] Saved to {filepath}")

    @classmethod
    def load(cls, filepath: str = "models/model3_heavy_rain.joblib") -> "HeavyRainClassifier":
        data = joblib.load(filepath)
        instance = cls(threshold_mm=data["threshold_mm"])
        instance.calibrated_model = data["calibrated_model"]
        instance.feature_cols = data["feature_cols"]
        instance.is_trained = True
        return instance
