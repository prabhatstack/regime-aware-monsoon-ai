"""
FastAPI Backend Service for Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts.
Implements the REST API endpoints specified in Section 14 of the Blueprint,
and serves the complete interactive web dashboard at root (/).
"""

import os
import json
import numpy as np
import pandas as pd
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.data.schema import REGIMES, REGIME_DESCRIPTIONS, THRESHOLDS
from src.data.data_generator import JHARKHAND_DISTRICTS
from src.models.model1_regime import RegimeClassifier
from src.models.model2_error_regressor import RainfallErrorRegressor
from src.models.model3_heavy_rain import HeavyRainClassifier
from src.api.auth import auth_router
from src.config import (
    CORS_ORIGINS,
    TEST_PREDICTIONS_FILE,
    VERIFICATION_RESULTS_FILE,
    MODEL1_PATH,
    MODEL2_PATH,
    MODEL3_PATH,
    WEB_DIR,
    DEBUG,
    APP_ENV
)

app = FastAPI(
    title="Regime-Aware Monsoon Rainfall Post-Processing API & Dashboard",
    description="Backend API and visualization platform for 2-stage regime-conditioned post-processed rainfall forecasts.",
    version="1.0.0",
    debug=DEBUG
)

# Register Authentication Router
app.include_router(auth_router)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model and data references
model1: Optional[RegimeClassifier] = None
model2: Optional[RainfallErrorRegressor] = None
model3: Optional[HeavyRainClassifier] = None
cached_test_data: Optional[pd.DataFrame] = None
cached_verification_report: Optional[Dict[str, Any]] = None

def get_data() -> pd.DataFrame:
    global cached_test_data
    if cached_test_data is None:
        if os.path.exists(TEST_PREDICTIONS_FILE):
            cached_test_data = pd.read_csv(TEST_PREDICTIONS_FILE)
        else:
            raise HTTPException(status_code=503, detail="Forecast predictions data not generated yet.")
    return cached_test_data

@app.on_event("startup")
def load_artifacts():
    global model1, model2, model3, cached_test_data, cached_verification_report

    artifacts_missing = (
        not os.path.exists(MODEL1_PATH)
        or not os.path.exists(MODEL2_PATH)
        or not os.path.exists(MODEL3_PATH)
        or not os.path.exists(TEST_PREDICTIONS_FILE)
        or not os.path.exists(VERIFICATION_RESULTS_FILE)
    )

    if artifacts_missing:
        print("[Startup] One or more model artifacts missing. Executing train_and_evaluate pipeline...")
        try:
            from scripts.train_and_evaluate import run_pipeline
            run_pipeline()
        except Exception as e:
            print(f"[Startup Warning] Could not auto-generate pipeline artifacts: {e}")

    try:
        if os.path.exists(MODEL1_PATH):
            model1 = RegimeClassifier.load(MODEL1_PATH)
        if os.path.exists(MODEL2_PATH):
            model2 = RainfallErrorRegressor.load(MODEL2_PATH)
        if os.path.exists(MODEL3_PATH):
            model3 = HeavyRainClassifier.load(MODEL3_PATH)
        if os.path.exists(TEST_PREDICTIONS_FILE):
            cached_test_data = pd.read_csv(TEST_PREDICTIONS_FILE)
        if os.path.exists(VERIFICATION_RESULTS_FILE):
            with open(VERIFICATION_RESULTS_FILE, "r") as f:
                cached_verification_report = json.load(f)
        print("[Startup] All artifacts and models successfully loaded into memory.")
    except Exception as err:
        print(f"[Startup Warning] Error loading saved model artifacts ({err}). Regenerating...")
        try:
            from scripts.train_and_evaluate import run_pipeline
            run_pipeline()
            if os.path.exists(MODEL1_PATH):
                model1 = RegimeClassifier.load(MODEL1_PATH)
            if os.path.exists(MODEL2_PATH):
                model2 = RainfallErrorRegressor.load(MODEL2_PATH)
            if os.path.exists(MODEL3_PATH):
                model3 = HeavyRainClassifier.load(MODEL3_PATH)
            if os.path.exists(TEST_PREDICTIONS_FILE):
                cached_test_data = pd.read_csv(TEST_PREDICTIONS_FILE)
            if os.path.exists(VERIFICATION_RESULTS_FILE):
                with open(VERIFICATION_RESULTS_FILE, "r") as f:
                    cached_verification_report = json.load(f)
        except Exception as final_err:
            print(f"[Startup Error] Fatal error initializing artifacts: {final_err}")

# API Endpoints
@app.get("/api/health")
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "models_loaded": {
            "model1_regime": model1 is not None,
            "model2_error_regressor": model2 is not None,
            "model3_heavy_rain": model3 is not None
        }
    }

@app.get("/api/metadata")
@app.get("/metadata")
def get_metadata():
    return {
        "project": "Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts",
        "region": "Eastern India / Jharkhand Prototype",
        "supported_regimes": REGIMES,
        "regime_descriptions": REGIME_DESCRIPTIONS,
        "operational_thresholds_mm": THRESHOLDS,
        "models": {
            "model_1": "XGBoost Multiclass Regime Classifier",
            "model_2": "XGBoost Rainfall Error Regressor (Conditioned on Regime)",
            "model_3": "XGBoost Heavy-Rain Probability Classifier (Threshold >= 64.5mm)"
        },
        "non_negative_safeguard": "max(0, nwp_rainfall + predicted_error)"
    }

@app.get("/api/districts")
@app.get("/districts")
def list_districts():
    return {"districts": JHARKHAND_DISTRICTS}

@app.get("/api/regimes")
@app.get("/regimes")
def get_regimes():
    return {
        "regimes": REGIMES,
        "descriptions": REGIME_DESCRIPTIONS
    }

@app.get("/api/dates")
def get_available_dates():
    df = get_data()
    dates = sorted(df["valid_time"].str.slice(0, 10).unique().tolist())
    return {"dates": dates}

@app.get("/api/forecast")
@app.get("/forecast")
def get_forecast(
    district: Optional[str] = Query(None, description="District name"),
    valid_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD"),
    lead_time_hr: Optional[int] = Query(None, description="Forecast lead time (24, 48, 72)")
):
    df = get_data()

    if district and district.lower() != "all":
        df = df[df["district"].str.lower().str.contains(district.lower())]
    if valid_date:
        df = df[df["valid_time"].str.startswith(valid_date)]
    if lead_time_hr:
        df = df[df["lead_time_hr"] == lead_time_hr]

    if df.empty:
        raise HTTPException(status_code=404, detail="No forecast found matching the specified parameters.")

    records = df[[
        "init_time", "valid_time", "lead_time_hr", "district", "latitude", "longitude",
        "nwp_rainfall_mm", "detected_regime", "predicted_error_mm", "corrected_rainfall_mm",
        "heavy_rain_prob", "reference_rainfall_mm", "temperature", "humidity", "pressure",
        "u_wind", "v_wind"
    ]].to_dict(orient="records")

    return {
        "count": len(records),
        "results": records
    }

@app.get("/api/district/{district_name}/timeseries")
def get_district_timeseries(district_name: str, lead_time_hr: int = 24):
    df = get_data()
    df_dist = df[(df["district"].str.lower().str.contains(district_name.lower())) & (df["lead_time_hr"] == lead_time_hr)]
    if df_dist.empty:
        raise HTTPException(status_code=404, detail=f"No data for district '{district_name}'")

    df_dist = df_dist.sort_values("valid_time")
    return {
        "district": district_name,
        "lead_time_hr": lead_time_hr,
        "dates": df_dist["valid_time"].str.slice(0, 10).tolist(),
        "raw_nwp": df_dist["nwp_rainfall_mm"].tolist(),
        "corrected": df_dist["corrected_rainfall_mm"].tolist(),
        "reference": df_dist["reference_rainfall_mm"].tolist(),
        "heavy_rain_prob": df_dist["heavy_rain_prob"].tolist(),
        "regimes": df_dist["detected_regime"].tolist()
    }

@app.get("/api/verification")
@app.get("/verification")
def get_verification_report():
    global cached_verification_report
    if cached_verification_report is None:
        if os.path.exists(VERIFICATION_RESULTS_FILE):
            with open(VERIFICATION_RESULTS_FILE, "r") as f:
                cached_verification_report = json.load(f)
        else:
            raise HTTPException(status_code=503, detail="Verification report not yet generated.")

    return cached_verification_report

# Mount Web Directory
os.makedirs(WEB_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

