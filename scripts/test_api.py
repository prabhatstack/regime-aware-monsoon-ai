"""
Test script verifying all FastAPI endpoints and model inference.
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from src.api.app import app, load_artifacts

def test_endpoints():
    load_artifacts()
    client = TestClient(app)

    print("1. Testing /health...")
    r = client.get("/health")
    assert r.status_code == 200, f"Health check failed: {r.text}"
    print("   Response:", r.json())

    print("\n2. Testing /metadata...")
    r = client.get("/metadata")
    assert r.status_code == 200
    print("   Metadata loaded successfully. Regimes:", r.json()["supported_regimes"])

    print("\n3. Testing /districts...")
    r = client.get("/districts")
    assert r.status_code == 200
    print(f"   Districts returned: {len(r.json()['districts'])} districts")

    print("\n4. Testing /forecast for district 'Ranchi'...")
    r = client.get("/forecast?district=Ranchi&lead_time_hr=24")
    assert r.status_code == 200
    res = r.json()
    print(f"   Forecast samples returned: {res['count']}")
    first = res["results"][0]
    print(f"   Sample Record -> Date: {first['valid_time']}, NWP: {first['nwp_rainfall_mm']} mm, Regime: {first['detected_regime']}, Corrected: {first['corrected_rainfall_mm']} mm, Heavy Rain Prob: {first['heavy_rain_prob']}")

    print("\n5. Testing /verification...")
    r = client.get("/verification")
    assert r.status_code == 200
    v = r.json()
    xgb = v["comparison"]["Regime-Aware XGBoost System"]
    print(f"   Verification loaded: RMSE = {xgb['RMSE (mm)']} mm, ETS = {xgb['ETS (Equitable Threat Score)']}, POD = {xgb['POD (Hit Rate)']}, FSS = {xgb['FSS (Spatial Skill)']}")

    print("\nALL API ENDPOINTS TESTED SUCCESSFULLY!")

if __name__ == "__main__":
    test_endpoints()
