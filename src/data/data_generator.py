"""
Realistic Prototype Data Generator for Jharkhand / Eastern India Monsoon Seasons.
Simulates physically realistic NWP forecast errors and synoptic regimes.
Adheres strictly to Section 6 and Section 10 (time-based train/test split) of the blueprint.
"""

import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Tuple

from src.data.schema import REGIMES, THRESHOLDS

# Prototype Eastern India / Jharkhand Districts with coordinates
JHARKHAND_DISTRICTS = [
    {"district": "Ranchi", "latitude": 23.3441, "longitude": 85.3096, "elevation_m": 651},
    {"district": "East Singhbhum (Jamshedpur)", "latitude": 22.8046, "longitude": 86.2029, "elevation_m": 159},
    {"district": "Dhanbad", "latitude": 23.7957, "longitude": 86.4304, "elevation_m": 227},
    {"district": "Bokaro", "latitude": 23.6693, "longitude": 86.1511, "elevation_m": 210},
    {"district": "Hazaribagh", "latitude": 23.9961, "longitude": 85.3644, "elevation_m": 610},
    {"district": "Deoghar", "latitude": 24.4826, "longitude": 86.7000, "elevation_m": 254},
    {"district": "Dumka", "latitude": 24.2676, "longitude": 87.2519, "elevation_m": 137},
    {"district": "West Singhbhum (Chaibasa)", "latitude": 22.5500, "longitude": 85.8000, "elevation_m": 222},
    {"district": "Palamu", "latitude": 24.0416, "longitude": 84.0722, "elevation_m": 215},
    {"district": "Giridih", "latitude": 24.1866, "longitude": 86.3079, "elevation_m": 289}
]

def generate_monsoon_records_for_year(year: int, random_seed: int = 42) -> pd.DataFrame:
    """
    Generate daily records for June 1 to September 30 (monsoon season)
    across multiple lead times (24h, 48h, 72h).
    """
    np.random.seed(random_seed + year)
    records = []

    start_date = datetime(year, 6, 1)
    end_date = datetime(year, 9, 30)
    current_date = start_date

    # Define synoptic regime episodes of 3-7 days to mimic real weather patterns
    regime_sequence = []
    while len(regime_sequence) < (end_date - start_date).days + 1:
        chosen_regime = np.random.choice(
            REGIMES, 
            p=[0.35, 0.20, 0.20, 0.15, 0.10]  # Active & Low/Depression are dominant
        )
        duration = np.random.randint(3, 7)
        regime_sequence.extend([chosen_regime] * duration)

    day_idx = 0
    while current_date <= end_date:
        regime = regime_sequence[day_idx]
        doy = current_date.timetuple().tm_yday

        # Base synoptic state for the regime over Eastern India
        if regime == "active":
            base_temp = np.random.normal(29.0, 1.5)
            base_rh = np.random.normal(88.0, 4.0)
            base_u = np.random.normal(16.0, 3.0)      # Strong low-level westerly jet
            base_v = np.random.normal(4.0, 2.0)
            base_mslp = np.random.normal(998.0, 2.0)  # Low pressure trough
            base_z500 = np.random.normal(5820, 15)
        elif regime == "break":
            base_temp = np.random.normal(33.5, 1.5)
            base_rh = np.random.normal(68.0, 5.0)
            base_u = np.random.normal(4.0, 2.0)       # Weak winds in central/eastern India
            base_v = np.random.normal(-2.0, 1.5)
            base_mslp = np.random.normal(1007.0, 2.0) # High pressure ridge
            base_z500 = np.random.normal(5865, 15)
        elif regime == "low_depression":
            base_temp = np.random.normal(27.0, 1.2)
            base_rh = np.random.normal(94.0, 3.0)     # Near saturation
            base_u = np.random.normal(22.0, 4.0)      # High vorticity
            base_v = np.random.normal(14.0, 3.5)
            base_mslp = np.random.normal(992.0, 2.5)  # Deep depression
            base_z500 = np.random.normal(5780, 20)
        elif regime == "orographic":
            base_temp = np.random.normal(28.0, 1.5)
            base_rh = np.random.normal(85.0, 4.5)
            base_u = np.random.normal(12.0, 2.5)
            base_v = np.random.normal(3.0, 2.0)
            base_mslp = np.random.normal(1001.0, 2.0)
            base_z500 = np.random.normal(5835, 15)
        else: # coastal
            base_temp = np.random.normal(30.0, 1.5)
            base_rh = np.random.normal(86.0, 4.0)
            base_u = np.random.normal(10.0, 2.5)
            base_v = np.random.normal(8.0, 2.5)       # Strong maritime southerlies
            base_mslp = np.random.normal(1002.0, 2.0)
            base_z500 = np.random.normal(5840, 15)

        for loc in JHARKHAND_DISTRICTS:
            for lead_time in [24, 48, 72]:
                # Lead-time degradation in NWP accuracy
                lead_noise_factor = 1.0 + (lead_time - 24) * 0.015

                # Local adjustments
                elevation_boost = (loc["elevation_m"] - 150) / 1000.0
                temp = float(np.clip(base_temp - elevation_boost * 1.5 + np.random.normal(0, 0.5), 18, 45))
                rh = float(np.clip(base_rh + elevation_boost * 3.0 + np.random.normal(0, 1.5), 35, 100))
                u = float(base_u + np.random.normal(0, 1.0))
                v = float(base_v + np.random.normal(0, 1.0))
                mslp = float(base_mslp + np.random.normal(0, 0.8))
                z500 = float(base_z500 + np.random.normal(0, 5))

                # Physical simulation of true reference rainfall vs NWP forecast
                if regime == "active":
                    # Convective active monsoon: true rainfall is moderate-to-heavy
                    ref_rain = float(np.random.gamma(shape=2.5, scale=12.0))
                    # NWP tends to slightly underpredict peak intensity
                    nwp_rain = max(0.0, ref_rain * np.random.normal(0.85, 0.15 * lead_noise_factor) + np.random.normal(0, 2.0))
                elif regime == "break":
                    # Dry break regime: true rain is near zero
                    ref_rain = float(np.random.exponential(scale=1.5) if np.random.rand() < 0.25 else 0.0)
                    # NWP suffers from classic "drizzle bias" (predicting 4-12 mm when it's dry)
                    nwp_rain = max(0.0, ref_rain + np.random.exponential(scale=3.5) * lead_noise_factor)
                elif regime == "low_depression":
                    # Severe cyclonic downpours, frequent heavy/extreme rain
                    ref_rain = float(np.random.gamma(shape=3.8, scale=22.0) + 15.0)
                    # NWP significantly underpredicts extreme peaks and suffers displacement error
                    nwp_rain = max(0.0, ref_rain * np.random.normal(0.60, 0.18 * lead_noise_factor))
                elif regime == "orographic":
                    # Enhanced over high elevation
                    elev_factor = 1.0 + (loc["elevation_m"] / 500.0) * 0.4
                    ref_rain = float(np.random.gamma(shape=2.0, scale=10.0) * elev_factor)
                    # NWP has coarse topography, underestimating terrain uplift
                    nwp_rain = max(0.0, ref_rain * np.random.normal(0.72, 0.15 * lead_noise_factor))
                else: # coastal
                    ref_rain = float(np.random.gamma(shape=2.2, scale=11.0))
                    nwp_rain = max(0.0, ref_rain * np.random.normal(0.80, 0.20 * lead_noise_factor))

                ref_rain = round(ref_rain, 1)
                nwp_rain = round(nwp_rain, 1)
                forecast_error = round(ref_rain - nwp_rain, 1)
                heavy_label = 1 if ref_rain >= THRESHOLDS["HEAVY_RAIN"] else 0

                init_dt = current_date - timedelta(hours=lead_time)
                valid_dt = current_date

                records.append({
                    "init_time": init_dt.strftime("%Y-%m-%d %H:%M"),
                    "valid_time": valid_dt.strftime("%Y-%m-%d %H:%M"),
                    "lead_time_hr": lead_time,
                    "latitude": loc["latitude"],
                    "longitude": loc["longitude"],
                    "district": loc["district"],
                    "nwp_rainfall_mm": nwp_rain,
                    "temperature": temp,
                    "humidity": rh,
                    "u_wind": u,
                    "v_wind": v,
                    "pressure": mslp,
                    "geopotential": z500,
                    "regime": regime,
                    "reference_rainfall_mm": ref_rain,
                    "forecast_error_mm": forecast_error,
                    "heavy_rain_label": heavy_label
                })

        current_date += timedelta(days=1)
        day_idx += 1

    return pd.DataFrame(records)

def create_prototype_datasets(output_dir: str = "data") -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Creates train (2021-2023) and held-out test (2024) datasets.
    """
    os.makedirs(output_dir, exist_ok=True)

    print("Generating training dataset (Monsoon 2021, 2022, 2023)...")
    train_dfs = [generate_monsoon_records_for_year(yr, random_seed=yr*10) for yr in [2021, 2022, 2023]]
    train_df = pd.concat(train_dfs, ignore_index=True)

    print("Generating strictly held-out test dataset (Monsoon 2024)...")
    test_df = generate_monsoon_records_for_year(2024, random_seed=20240)

    train_path = os.path.join(output_dir, "prototype_jharkhand_train.csv")
    test_path = os.path.join(output_dir, "prototype_jharkhand_test.csv")

    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path, index=False)

    print(f"Train dataset saved to {train_path} ({len(train_df)} rows)")
    print(f"Test dataset saved to {test_path} ({len(test_df)} rows)")

    return train_df, test_df

if __name__ == "__main__":
    create_prototype_datasets()
