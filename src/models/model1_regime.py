"""
Model 1: Weather Regime Classifier using XGBoost.
Classifies synoptic atmospheric conditions into:
[active, break, low_depression, orographic, coastal]
Corresponds to Section 7 of the Blueprint.
"""

import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score

from src.data.schema import REGIMES

class RegimeClassifier:
    def __init__(self):
        self.label_encoder = LabelEncoder()
        self.model = XGBClassifier(
            n_estimators=150,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            objective="multi:softprob",
            eval_metric="mlogloss",
            random_state=42
        )
        self.feature_cols = [
            "temperature",
            "humidity",
            "u_wind",
            "v_wind",
            "wind_speed",
            "pressure",
            "geopotential",
            "lead_time_hr",
            "latitude",
            "longitude",
            "day_of_year"
        ]
        self.is_trained = False

    def _engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df_feat = df.copy()
        # Derive wind speed
        df_feat["wind_speed"] = np.sqrt(df_feat["u_wind"]**2 + df_feat["v_wind"]**2)
        # Derive day of year if not present
        if "day_of_year" not in df_feat.columns:
            if "valid_time" in df_feat.columns:
                df_feat["day_of_year"] = pd.to_datetime(df_feat["valid_time"]).dt.dayofyear
            else:
                df_feat["day_of_year"] = 200 # default mid-monsoon
        return df_feat

    def fit(self, train_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Train the XGBoost regime classifier.
        """
        df_proc = self._engineer_features(train_df)
        X = df_proc[self.feature_cols]
        y_encoded = self.label_encoder.fit_transform(train_df["regime"])

        self.model.fit(X, y_encoded)
        self.is_trained = True

        y_pred = self.model.predict(X)
        acc = accuracy_score(y_encoded, y_pred)
        print(f"[Model 1] Training accuracy: {acc:.4f}")
        return {"train_accuracy": acc}

    def predict(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Returns (predicted_regime_labels, regime_probabilities_array)
        """
        if not self.is_trained:
            raise RuntimeError("Model 1 has not been trained or loaded yet.")
        df_proc = self._engineer_features(df)
        X = df_proc[self.feature_cols]
        probs = self.model.predict_proba(X)
        pred_indices = np.argmax(probs, axis=1)
        pred_labels = self.label_encoder.inverse_transform(pred_indices)
        return pred_labels, probs

    def evaluate(self, test_df: pd.DataFrame) -> Dict[str, Any]:
        df_proc = self._engineer_features(test_df)
        X = df_proc[self.feature_cols]
        y_true = self.label_encoder.transform(test_df["regime"])
        y_pred = self.model.predict(X)

        acc = accuracy_score(y_true, y_pred)
        report = classification_report(
            y_true, 
            y_pred, 
            target_names=self.label_encoder.classes_,
            output_dict=True
        )
        print(f"[Model 1] Held-Out Test Accuracy: {acc:.4f}")
        return {"test_accuracy": acc, "report": report}

    def save(self, filepath: str = "models/model1_regime.joblib"):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            "model": self.model,
            "label_encoder": self.label_encoder,
            "feature_cols": self.feature_cols,
            "classes": list(self.label_encoder.classes_)
        }, filepath)
        print(f"[Model 1] Saved to {filepath}")

    @classmethod
    def load(cls, filepath: str = "models/model1_regime.joblib") -> "RegimeClassifier":
        data = joblib.load(filepath)
        instance = cls()
        instance.model = data["model"]
        instance.label_encoder = data["label_encoder"]
        instance.feature_cols = data["feature_cols"]
        instance.is_trained = True
        return instance
