"""
Model 2: Rainfall Error/Post-Processing Model using XGBoost Regressor.
Predicts forecast error (reference - NWP) conditioned on the detected regime.
Enforces the non-negative floor: corrected_rainfall = max(0, nwp_rainfall + predicted_error).
Corresponds to Section 8 of the Blueprint.
"""

import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

from src.data.schema import MODEL_2_BASE_FEATURES, REGIMES

class RainfallErrorRegressor:
    def __init__(self):
        self.model = XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.06,
            subsample=0.85,
            colsample_bytree=0.85,
            objective="reg:squarederror",
            random_state=42
        )
        self.feature_cols = MODEL_2_BASE_FEATURES.copy() + [f"regime_{r}" for r in REGIMES]
        self.is_trained = False

    def _prepare_features(self, df: pd.DataFrame, detected_regimes: np.ndarray = None) -> pd.DataFrame:
        df_proc = df.copy()
        if "day_of_year" not in df_proc.columns:
            if "valid_time" in df_proc.columns:
                df_proc["day_of_year"] = pd.to_datetime(df_proc["valid_time"]).dt.dayofyear
            else:
                df_proc["day_of_year"] = 200

        # Regime feature: use detected_regimes if provided, else use df["regime"]
        regime_series = pd.Series(detected_regimes if detected_regimes is not None else df_proc["regime"])
        for r in REGIMES:
            df_proc[f"regime_{r}"] = (regime_series.values == r).astype(float)

        return df_proc[self.feature_cols]

    def fit(self, train_df: pd.DataFrame, detected_regimes: np.ndarray = None) -> Dict[str, float]:
        """
        Train the model to predict forecast_error_mm = (reference_rainfall_mm - nwp_rainfall_mm).
        """
        X = self._prepare_features(train_df, detected_regimes)
        y = train_df["forecast_error_mm"]

        self.model.fit(X, y)
        self.is_trained = True

        preds = self.model.predict(X)
        rmse = np.sqrt(mean_squared_error(y, preds))
        mae = mean_absolute_error(y, preds)
        print(f"[Model 2] Train Error RMSE: {rmse:.3f} mm, MAE: {mae:.3f} mm")
        return {"train_rmse": float(rmse), "train_mae": float(mae)}

    def predict_error(self, df: pd.DataFrame, detected_regimes: np.ndarray = None) -> np.ndarray:
        if not self.is_trained:
            raise RuntimeError("Model 2 has not been trained or loaded yet.")
        X = self._prepare_features(df, detected_regimes)
        return self.model.predict(X)

    def predict_corrected_rainfall(self, df: pd.DataFrame, detected_regimes: np.ndarray = None) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calculates:
        1. predicted_error
        2. corrected_rainfall = max(0, nwp_rainfall + predicted_error)
        Returns (corrected_rainfall, predicted_error)
        """
        pred_error = self.predict_error(df, detected_regimes)
        raw_nwp = df["nwp_rainfall_mm"].values
        # Blueprint formula: corrected_rainfall = max(0, nwp_rainfall + predicted_error)
        corrected = np.maximum(0.0, raw_nwp + pred_error)
        return np.round(corrected, 1), np.round(pred_error, 1)

    def evaluate(self, test_df: pd.DataFrame, detected_regimes: np.ndarray = None) -> Dict[str, float]:
        """
        Compares Raw NWP error vs Corrected Rainfall error against reference observations.
        """
        raw_nwp = test_df["nwp_rainfall_mm"].values
        obs = test_df["reference_rainfall_mm"].values
        corrected, pred_error = self.predict_corrected_rainfall(test_df, detected_regimes)

        raw_rmse = np.sqrt(mean_squared_error(obs, raw_nwp))
        raw_mae = mean_absolute_error(obs, raw_nwp)

        corr_rmse = np.sqrt(mean_squared_error(obs, corrected))
        corr_mae = mean_absolute_error(obs, corrected)
        corr_r2 = r2_score(obs, corrected)

        print(f"[Model 2] Raw NWP   -> RMSE: {raw_rmse:.2f} mm | MAE: {raw_mae:.2f} mm")
        print(f"[Model 2] Corrected -> RMSE: {corr_rmse:.2f} mm | MAE: {corr_mae:.2f} mm | R2: {corr_r2:.3f}")

        return {
            "raw_rmse": float(raw_rmse),
            "raw_mae": float(raw_mae),
            "corrected_rmse": float(corr_rmse),
            "corrected_mae": float(corr_mae),
            "r2": float(corr_r2),
            "rmse_improvement_pct": float((raw_rmse - corr_rmse) / raw_rmse * 100.0)
        }

    def save(self, filepath: str = "models/model2_error.joblib"):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            "model": self.model,
            "feature_cols": self.feature_cols
        }, filepath)
        print(f"[Model 2] Saved to {filepath}")

    @classmethod
    def load(cls, filepath: str = "models/model2_error.joblib") -> "RainfallErrorRegressor":
        data = joblib.load(filepath)
        instance = cls()
        instance.model = data["model"]
        instance.feature_cols = data["feature_cols"]
        instance.is_trained = True
        return instance
