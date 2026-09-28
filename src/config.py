"""
Centralized Configuration Module for Regime-Aware Monsoon AI System.
Loads environment variables from .env if present, with resilient default fallbacks
for seamless zero-config local and hackathon execution.
"""

import os
from pathlib import Path
from typing import List

# Try loading python-dotenv if installed
try:
    from dotenv import load_dotenv
    # Resolve base directory (root of repository)
    BASE_DIR = Path(__file__).resolve().parent.parent
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        load_dotenv(dotenv_path=env_file)
    else:
        load_dotenv()
except ImportError:
    BASE_DIR = Path(__file__).resolve().parent.parent

# Application environment
APP_ENV: str = os.getenv("APP_ENV", "development").lower()
DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

# Server networking
API_HOST: str = os.getenv("API_HOST", "127.0.0.1")
API_PORT: int = int(os.getenv("API_PORT", "8000"))

# Security and Auth
AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "regime_monsoon_secret_key_2026")

# CORS Configuration
_cors_raw = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS: List[str] = [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]

# Storage directories
DATA_DIR: str = os.getenv("DATA_DIR", str(BASE_DIR / "data"))
MODELS_DIR: str = os.getenv("MODELS_DIR", str(BASE_DIR / "models"))

# Specific File Paths
USERS_FILE: str = os.getenv("USERS_FILE", os.path.join(DATA_DIR, "users.json"))
TEST_PREDICTIONS_FILE: str = os.path.join(DATA_DIR, "test_predictions_enriched.csv")
VERIFICATION_RESULTS_FILE: str = os.path.join(DATA_DIR, "verification_results.json")

MODEL1_PATH: str = os.path.join(MODELS_DIR, "model1_regime.joblib")
MODEL2_PATH: str = os.path.join(MODELS_DIR, "model2_error.joblib")
MODEL3_PATH: str = os.path.join(MODELS_DIR, "model3_heavy_rain.joblib")

# Static frontend assets directory
WEB_DIR: str = os.getenv("WEB_DIR", str(BASE_DIR / "src" / "web"))
