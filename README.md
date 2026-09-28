# Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg)](https://fastapi.tiangolo.com)
[![XGBoost](https://img.shields.io/badge/ML-XGBoost-orange.svg)](https://xgboost.readthedocs.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **One-Line Project Explanation**:  
> *"Our system does not replace the weather model; it learns how NWP rainfall forecasts behave under different monsoon regimes and applies regime-aware machine-learning corrections to improve rainfall forecasts and heavy-rainfall decision support."*

---

## 🌧️ Problem Overview

Numerical Weather Prediction (NWP) models (such as IMD-GFS, NCUM, ECMWF, and WRF) produce daily rainfall forecasts across India. However, forecast errors are non-stationary and depend strongly on the prevailing synoptic weather regime:
- **Active Monsoon**: Strong low-level jet, vigorous convection; NWP underestimates peak convective intensity.
- **Break Monsoon**: Trough shifts to Himalayan foothills; NWP suffers from classic "drizzle bias" over central/eastern India.
- **Monsoon Lows / Depressions**: High-vorticity cyclonic systems from the Bay of Bengal; NWP suffers spatial displacement and severe peak underestimation.
- **Orographic Rainfall**: Mechanically forced rain over the Chota Nagpur Plateau and Western Ghats; coarse model topography misses terrain uplift.
- **Coastal Surges**: Marine moisture surges and offshore troughs.

A single uniform bias-correction method fails across these differing atmospheric dynamics. Our system implements a **2-stage regime-conditioned post-processing architecture**.

---

## 🧠 ML Architecture — Exactly 3 Core Models

```
[Raw NWP Atmospheric Fields] (Z500, U/V850, MSLP, PWV)
             │
             ▼
   ┌────────────────────────────────────────────────┐
   │ Model 1: Weather Regime Classifier (XGBoost)   │
   │ Detects: active, break, low_depression,        │
   │          orographic, coastal                   │
   │ Held-Out Test Accuracy: 80.77%                 │
   └───────────────────────┬────────────────────────┘
                           │ Detected Regime Label & Soft Probabilities
                           ▼
   ┌────────────────────────────────────────────────┐
   │ Model 2: Rainfall Error Regressor (XGBoost)    │
   │ Target: reference_rainfall - nwp_rainfall      │
   │ Safeguard: max(0, NWP + Predicted Error)       │
   │ RMSE Reduction: -36.2%                         │
   └───────────────────────┬────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
 [Corrected Rainfall Forecast]   [Model 3: Heavy Rain Probability]
 (mm/day, non-negative floor)    (Target: Rainfall >= 64.5 mm)
                                 (ROC-AUC: 0.982 | Brier: 0.0417)
```

---

## 📊 Verification Benchmark Results (Held-Out Monsoon 2024 Season)

Evaluated strictly on **3,660 out-of-sample records** across Jharkhand districts with strict seasonal time splitting (zero temporal/spatial leakage):

| Meteorological Metric | Raw NWP | Simple Bias Corr | **Regime-Aware XGBoost** | Improvement Impact |
| :--- | :--- | :--- | :--- | :--- |
| **RMSE (mm)** | 22.50 mm | 20.77 mm | **14.35 mm** | **-36.2% error reduction** |
| **MAE (mm)** | 12.19 mm | 13.31 mm | **7.61 mm** | **-37.6% error reduction** |
| **Mean Bias (mm)** | -8.65 mm | 0.00 mm | **-0.23 mm** | Near-zero residual bias |
| **Correlation ($r$)** | 0.880 | 0.880 | **0.932** | Superior linear correspondence |
| **POD (Hit Rate)** | 0.461 | 0.576 | **0.882** | **+91.3% extreme event capture** |
| **FAR (False Alarm Ratio)** | 0.041 | 0.096 | **0.196** | Well-controlled trade-off |
| **CSI (Threat Score)** | 0.452 | 0.543 | **0.725** | **+60.4% higher threat skill** |
| **ETS (Equitable Threat Score)** | 0.410 | 0.497 | **0.682** | **+66.3% skill over random hits** |
| **FSS (Fractions Skill Score)** | 0.733 | 0.832 | **0.956** | High neighborhood spatial fidelity |

---

## 🖥️ Web Dashboard Features

- **Interactive Leaflet Map**: Color-coded markers matching official IMD rainfall warning categories (Green, Yellow, Orange, Red, Purple).
- **District Deep-Dive**: Time-series charts comparing ground truth, raw NWP, and corrected forecasts, plus +24h/+48h/+72h lead-time degradation curves.
- **Forecast Comparison**: Discrepancy waterfall charts showing where NWP suffered severe underestimation or false alarms.
- **Weather Regime Explorer**: Synoptic diagnostics for all 5 Indian monsoon regimes with occurrence distribution.
- **Model Explainability & SHAP**: Feature attribution and importance charts.
- **Role-Based Authentication**:
  - Sign in / Register with operational roles (Forecaster, Disaster Authority, Researcher).
  - 1-Click Demo Logins for judges (`forecaster@imd.gov.in`, `disaster.mgmt@jharkhand.gov.in`).

---

## 🚀 Quick Start Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/prabhatstack/regime-aware-monsoon-ai.git
cd regime-aware-monsoon-ai

pip install -r requirements.txt

# (Optional) Customize environment settings
cp .env.example .env
```

### 2. Run the End-to-End Pipeline
```bash
python scripts/train_and_evaluate.py
```

### 3. Launch the Web Application
```bash
python -m uvicorn src.api.app:app --host 127.0.0.1 --port 8000 --reload
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

---

## 📁 Repository Structure

```
├── data/                       # Datasets, users, and verification JSON
├── models/                     # Persisted trained XGBoost models (.joblib)
├── scripts/
│   ├── train_and_evaluate.py  # Master pipeline execution runner
│   └── test_api.py            # API endpoint test suite
├── src/
│   ├── api/                   # FastAPI REST backend & auth router
│   ├── data/                  # Schema definitions & dataset generators
│   ├── evaluation/            # Meteorological verification engine (RMSE, ETS, FSS)
│   ├── models/                # Model 1, Model 2, and Model 3 implementations
│   └── web/                   # Frontend SPA (HTML, CSS, JS, Leaflet, Chart.js)
├── requirements.txt           # Project dependencies
└── README.md
```

---

## 🛡️ Blueprint Constraints & Rules Adhered To

- **We do not replace NWP models**: We post-process raw NWP model forecasts.
- **Strict Data-Leakage Protection**: Seasonal time splitting (2021–2023 for training, 2024 held-out test), strictly avoiding random row splits.
- **Non-negative Rainfall Floor**: Enforces $\max(0, \text{NWP} + \text{Error})$.
- **No unnecessary deep learning overhead**: XGBoost delivers state-of-the-art tabular/synoptic post-processing without heavy GPU requirements.
