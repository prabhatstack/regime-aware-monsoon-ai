"""
Data Schema and Operational Definitions for Regime-Aware Rainfall Post-Processing.
Corresponds to Section 4 and Section 6 of the Blueprint.
"""

from typing import List, Dict

# Official IMD Operational Rainfall Thresholds (mm / 24 hr)
THRESHOLDS = {
    "LIGHT_RAIN": 2.5,
    "MODERATE_RAIN": 15.6,
    "HEAVY_RAIN": 64.5,           # Primary operational threshold for Model 3
    "VERY_HEAVY_RAIN": 115.6,
    "EXTREMELY_HEAVY_RAIN": 204.5
}

# The 5 Synoptic Weather Regimes over Eastern India / Indian Monsoon
REGIMES: List[str] = [
    "active",          # Strong low-level jet, vigorous convection across monsoon trough
    "break",           # Rainfall shifts to foothills; central/eastern India dry/drizzle
    "low_depression",  # Cyclonic storm/depression from Bay of Bengal; intense rain
    "orographic",      # Mechanically forced rain over Chota Nagpur plateau / hills
    "coastal"          # Peripheral moisture surges / coastal convective band
]

REGIME_DESCRIPTIONS: Dict[str, str] = {
    "active": "Active Monsoon: Deep monsoon trough over Gangetic plains, strong low-level westerly winds, widespread convective rain.",
    "break": "Break Monsoon: Trough axis shifts north to Himalayan foothills; subdued eastern India precipitation with light drizzle bias in NWP.",
    "low_depression": "Monsoon Low / Depression: Bay of Bengal cyclonic vortex moving WNW; heavy to extreme downpours with strong displacement error in NWP.",
    "orographic": "Orographic Rainfall: Moisture-laden winds forced upwards along the Chota Nagpur Plateau and hill ranges.",
    "coastal": "Coastal Surge: Offshore trough and Bay of Bengal maritime moisture surges affecting coastal and sub-coastal belts."
}

# Mandatory Columns required by Section 6 of the Blueprint
COLUMNS_ALIGNMENT = [
    "init_time",               # When NWP forecast was initialized (YYYY-MM-DD HH:MM)
    "valid_time",              # Verification time
    "lead_time_hr",            # valid_time - init_time (e.g. 24, 48, 72)
    "latitude",                # Grid latitude
    "longitude",               # Grid longitude
    "district",                # District name
    "nwp_rainfall_mm",         # Raw NWP model precipitation forecast
    "temperature",             # 2m Temperature (Celsius or Kelvin)
    "humidity",                # Relative Humidity (%)
    "u_wind",                  # 850 hPa Zonal wind (m/s)
    "v_wind",                  # 850 hPa Meridional wind (m/s)
    "pressure",                # Mean Sea Level Pressure (MSLP in hPa)
    "geopotential",            # 500 hPa Geopotential Height (m)
    "regime",                  # Weather regime label (ground truth or classified)
    "reference_rainfall_mm",   # Observed / authoritative reference rainfall
    "forecast_error_mm",       # reference_rainfall_mm - nwp_rainfall_mm (Model 2 target)
    "heavy_rain_label"         # 1 if reference_rainfall_mm >= 64.5, else 0 (Model 3 target)
]

# Features fed into Model 1 (Regime Classifier)
MODEL_1_FEATURES = [
    "temperature",
    "humidity",
    "u_wind",
    "v_wind",
    "wind_speed",
    "pressure",
    "geopotential",
    "day_of_year",
    "lead_time_hr",
    "latitude",
    "longitude"
]

# Features fed into Model 2 (Rainfall Error Regressor)
MODEL_2_BASE_FEATURES = [
    "nwp_rainfall_mm",
    "temperature",
    "humidity",
    "u_wind",
    "v_wind",
    "pressure",
    "geopotential",
    "lead_time_hr",
    "latitude",
    "longitude",
    "day_of_year"
]
