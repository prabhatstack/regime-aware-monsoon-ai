"""
Meteorological Verification Engine for Indian Monsoon Post-Processing.
Implements continuous, categorical contingency, and spatial metrics
specified in Section 11 and Section 4 of the Blueprint:
RMSE, MAE, POD, FAR, CSI, ETS, FSS, and Brier Score.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List
from scipy.ndimage import uniform_filter

from src.data.schema import THRESHOLDS

def compute_continuous_metrics(obs: np.ndarray, pred: np.ndarray) -> Dict[str, float]:
    """
    Computes RMSE, MAE, Mean Bias, and Pearson Correlation.
    """
    obs = np.asarray(obs, dtype=float)
    pred = np.asarray(pred, dtype=float)

    error = pred - obs
    mae = float(np.mean(np.abs(error)))
    rmse = float(np.sqrt(np.mean(error ** 2)))
    bias = float(np.mean(error))
    
    # Pearson correlation
    if np.std(obs) > 1e-6 and np.std(pred) > 1e-6:
        r = float(np.corrcoef(obs, pred)[0, 1])
    else:
        r = 0.0

    return {
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "bias": round(bias, 2),
        "pearson_r": round(r, 3)
    }

def compute_contingency_table(obs: np.ndarray, pred: np.ndarray, threshold: float = THRESHOLDS["HEAVY_RAIN"]) -> Dict[str, int]:
    """
    Computes Hits (H), False Alarms (F), Misses (M), and Correct Negatives (C).
    """
    obs_binary = (obs >= threshold).astype(int)
    pred_binary = (pred >= threshold).astype(int)

    hits = int(np.sum((obs_binary == 1) & (pred_binary == 1)))
    false_alarms = int(np.sum((obs_binary == 0) & (pred_binary == 1)))
    misses = int(np.sum((obs_binary == 1) & (pred_binary == 0)))
    correct_negatives = int(np.sum((obs_binary == 0) & (pred_binary == 0)))

    return {
        "hits": hits,
        "false_alarms": false_alarms,
        "misses": misses,
        "correct_negatives": correct_negatives,
        "total": len(obs)
    }

def compute_categorical_metrics(obs: np.ndarray, pred: np.ndarray, threshold: float = THRESHOLDS["HEAVY_RAIN"]) -> Dict[str, float]:
    """
    Computes POD, FAR, CSI (Threat Score), and ETS (Equitable Threat Score).
    """
    ct = compute_contingency_table(obs, pred, threshold)
    h = ct["hits"]
    f = ct["false_alarms"]
    m = ct["misses"]
    c = ct["correct_negatives"]
    n = ct["total"]

    # Probability of Detection (Hit Rate): H / (H + M)
    pod = h / (h + m) if (h + m) > 0 else 0.0

    # False Alarm Ratio: F / (H + F)
    far = f / (h + f) if (h + f) > 0 else 0.0

    # Critical Success Index (Threat Score): H / (H + M + F)
    csi = h / (h + m + f) if (h + m + f) > 0 else 0.0

    # Random Hits expected by chance: (H + M) * (H + F) / N
    h_random = ((h + m) * (h + f)) / n if n > 0 else 0.0

    # Equitable Threat Score: (H - H_random) / (H + M + F - H_random)
    ets_denom = (h + m + f - h_random)
    ets = (h - h_random) / ets_denom if ets_denom > 0 else 0.0

    return {
        "pod": round(float(pod), 3),
        "far": round(float(far), 3),
        "csi": round(float(csi), 3),
        "ets": round(float(ets), 3),
        "contingency": ct
    }

def compute_fss(obs_field: np.ndarray, pred_field: np.ndarray, threshold: float = THRESHOLDS["HEAVY_RAIN"], window_size: int = 3) -> float:
    """
    Fractions Skill Score (FSS) evaluating spatial neighborhood accuracy.
    obs_field and pred_field can be 1D or 2D arrays.
    """
    obs_bin = (np.asarray(obs_field) >= threshold).astype(float)
    pred_bin = (np.asarray(pred_field) >= threshold).astype(float)

    if obs_bin.ndim == 1:
        # Pad to 2D for spatial neighborhood filter
        side = int(np.ceil(np.sqrt(len(obs_bin))))
        pad_size = side * side - len(obs_bin)
        obs_2d = np.pad(obs_bin, (0, pad_size), mode='edge').reshape(side, side)
        pred_2d = np.pad(pred_bin, (0, pad_size), mode='edge').reshape(side, side)
    else:
        obs_2d = obs_bin
        pred_2d = pred_bin

    # Uniform neighborhood fraction filter
    obs_frac = uniform_filter(obs_2d, size=window_size, mode='constant')
    pred_frac = uniform_filter(pred_2d, size=window_size, mode='constant')

    mse = np.mean((pred_frac - obs_frac) ** 2)
    mse_ref = np.mean(pred_frac ** 2 + obs_frac ** 2)

    if mse_ref < 1e-9:
        return 1.0 if mse < 1e-9 else 0.0

    fss = 1.0 - (mse / mse_ref)
    return round(float(np.clip(fss, 0.0, 1.0)), 3)

def generate_verification_report(test_df: pd.DataFrame, corrected_col: str = "corrected_rainfall_mm") -> Dict[str, Any]:
    """
    Generates full side-by-side comparison mandated by Section 11 of the Blueprint:
    Raw NWP vs Simple Mean Bias Correction vs Regime-Aware XGBoost Post-Processing.
    """
    obs = test_df["reference_rainfall_mm"].values
    raw = test_df["nwp_rainfall_mm"].values
    corrected = test_df[corrected_col].values

    # Simple global bias correction (mean difference subtracted)
    global_mean_bias = np.mean(raw - obs)
    simple_corrected = np.maximum(0.0, raw - global_mean_bias)

    report = {
        "sample_size": len(test_df),
        "test_period": f"{test_df['valid_time'].min()} to {test_df['valid_time'].max()}",
        "heavy_rain_threshold_mm": THRESHOLDS["HEAVY_RAIN"],
        "comparison": {}
    }

    models = {
        "Raw NWP Forecast": raw,
        "Simple Global Bias Correction": simple_corrected,
        "Regime-Aware XGBoost System": corrected
    }

    for name, forecast in models.items():
        cont = compute_continuous_metrics(obs, forecast)
        cat = compute_categorical_metrics(obs, forecast, threshold=THRESHOLDS["HEAVY_RAIN"])
        fss = compute_fss(obs, forecast, threshold=THRESHOLDS["HEAVY_RAIN"])

        report["comparison"][name] = {
            "RMSE (mm)": cont["rmse"],
            "MAE (mm)": cont["mae"],
            "Mean Bias (mm)": cont["bias"],
            "Correlation (r)": cont["pearson_r"],
            "POD (Hit Rate)": cat["pod"],
            "FAR (False Alarm Ratio)": cat["far"],
            "CSI (Threat Score)": cat["csi"],
            "ETS (Equitable Threat Score)": cat["ets"],
            "FSS (Spatial Skill)": fss
        }

    return report
