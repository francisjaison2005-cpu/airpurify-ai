from typing import Dict, Any, Optional, Tuple

# CPCB NAQI Breakpoint tables
# Format: (B_lo, B_hi, I_lo, I_hi)
CPCB_BREAKPOINTS = {
    "pm2_5": [
        (0.0, 30.0, 0, 50),
        (30.1, 60.0, 51, 100),
        (60.1, 90.0, 101, 200),
        (90.1, 120.0, 201, 300),
        (120.1, 250.0, 301, 400),
        (250.1, 500.0, 401, 500),
    ],
    "pm10": [
        (0.0, 50.0, 0, 50),
        (50.1, 100.0, 51, 100),
        (100.1, 250.0, 101, 200),
        (250.1, 350.0, 201, 300),
        (350.1, 430.0, 301, 400),
        (430.1, 600.0, 401, 500),
    ],
    "no2": [
        (0.0, 40.0, 0, 50),
        (40.1, 80.0, 51, 100),
        (80.1, 180.0, 101, 200),
        (180.1, 280.0, 201, 300),
        (280.1, 400.0, 301, 400),
        (400.1, 600.0, 401, 500),
    ],
    "so2": [
        (0.0, 40.0, 0, 50),
        (40.1, 80.0, 51, 100),
        (80.1, 380.0, 101, 200),
        (380.1, 800.0, 201, 300),
        (800.1, 1600.0, 301, 400),
        (1600.1, 2000.0, 401, 500),
    ],
    "co": [
        (0.0, 1.0, 0, 50),
        (1.1, 2.0, 51, 100),
        (2.1, 10.0, 101, 200),
        (10.1, 17.0, 201, 300),
        (17.1, 34.0, 301, 400),
        (34.1, 50.0, 401, 500),
    ],
    "o3": [
        (0.0, 50.0, 0, 50),
        (50.1, 100.0, 51, 100),
        (100.1, 168.0, 101, 200),
        (168.1, 208.0, 201, 300),
        (208.1, 748.0, 301, 400),
        (748.1, 1000.0, 401, 500),
    ],
}

CATEGORY_MAP = [
    (50, "Good", "#22b573"),
    (100, "Satisfactory", "#7cb342"),
    (200, "Moderate", "#d9a81c"),
    (300, "Poor", "#e08a1e"),
    (400, "Very Poor", "#d9542b"),
    (500, "Severe", "#8a2f22"),
]

CPCB_HEALTH_GUIDANCE = {
    "Good": "Minimal impact. Clean air posing negligible health risk. Ideal for all outdoor and indoor activities.",
    "Satisfactory": "Minor breathing discomfort may occur in sensitive people. General public can engage in normal activities.",
    "Moderate": "Breathing discomfort possible for individuals with asthma, lung, or heart diseases. Sensitive groups should reduce prolonged outdoor exertion.",
    "Poor": "Breathing discomfort to most people on prolonged outdoor exposure. Avoid heavy outdoor exertion and close windows if sensitive.",
    "Very Poor": "Respiratory illness on prolonged exposure. Significantly affects individuals with lung/heart diseases. Wear protective masks outdoors and run indoor air purifiers.",
    "Severe": "Affects healthy people and seriously impacts those with existing medical conditions. Avoid all outdoor activities; keep indoor air purifiers active.",
}


def aqi_category(score: int) -> Tuple[str, str]:
    """Returns (category_name, hex_color) for a given AQI score under CPCB standard."""
    for limit, cat, color in CATEGORY_MAP:
        if score <= limit:
            return cat, color
    return "Severe", "#8a2f22"


def calculate_sub_index(pollutant: str, conc: Optional[float]) -> Optional[int]:
    """Calculates sub-index for a specific pollutant according to CPCB piecewise linear formula."""
    if conc is None or conc < 0:
        return None

    breakpoints = CPCB_BREAKPOINTS.get(pollutant)
    if not breakpoints:
        return None

    for b_lo, b_hi, i_lo, i_hi in breakpoints:
        if conc <= b_hi:
            # Piecewise linear interpolation
            sub = ((i_hi - i_lo) / (b_hi - b_lo)) * (conc - b_lo) + i_lo
            return int(round(max(0, min(500, sub))))

    # Concentration above top breakpoint
    return 500


def calculate_aqi_data(
    pm2_5: float,
    pm10: Optional[float] = None,
    pm1_0: Optional[float] = None,
    no2: Optional[float] = None,
    so2: Optional[float] = None,
    co: Optional[float] = None,
    o3: Optional[float] = None,
    nh3: Optional[float] = None,
    pb: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Computes AQI in strict compliance with the selected Indian CPCB standard:
    1. Distinguishes Official CPCB AQI from Indicative particulate estimates.
    2. Enforces CPCB Data Sufficiency Rule: Minimum 3 pollutants with at least one PM (PM2.5 or PM10).
    3. If only particulate sensors (PMS7003/PMS5003) are present, returns explicit unavailable status for Official AQI.
    4. Calculates indicative particulate AQI from PM2.5 and PM10 sub-indices.
    """
    sub_indices: Dict[str, Optional[int]] = {
        "PM2.5": calculate_sub_index("pm2_5", pm2_5),
        "PM10": calculate_sub_index("pm10", pm10) if pm10 is not None else None,
        "NO2": calculate_sub_index("no2", no2) if no2 is not None else None,
        "SO2": calculate_sub_index("so2", so2) if so2 is not None else None,
        "CO": calculate_sub_index("co", co) if co is not None else None,
        "O3": calculate_sub_index("o3", o3) if o3 is not None else None,
    }

    concentrations: Dict[str, Optional[float]] = {
        "PM1.0": pm1_0,
        "PM2.5": pm2_5,
        "PM10": pm10,
        "NO2": no2,
        "SO2": so2,
        "CO": co,
        "O3": o3,
        "NH3": nh3,
        "Pb": pb,
    }

    valid_subs = {k: v for k, v in sub_indices.items() if v is not None}
    has_particulate = ("PM2.5" in valid_subs) or ("PM10" in valid_subs)
    total_valid = len(valid_subs)

    # Indicative particulate AQI (from PM2.5 and PM10)
    particulate_subs = [v for k, v in valid_subs.items() if k in ("PM2.5", "PM10")]
    if particulate_subs:
        indicative_aqi = max(particulate_subs)
        dominant_pol = max(
            [k for k in ("PM2.5", "PM10") if k in valid_subs],
            key=lambda k: valid_subs[k] or 0
        )
    else:
        indicative_aqi = 0
        dominant_pol = "None"

    ind_category, ind_color = aqi_category(indicative_aqi)

    # CPCB Official Rule: Minimum 3 pollutants required, one of which must be PM2.5 or PM10
    if total_valid >= 3 and has_particulate:
        official_status = "available"
        official_reason = None
        official_aqi = max(valid_subs.values())
        official_dominant = max(valid_subs.keys(), key=lambda k: valid_subs[k] or 0)
        official_category, _ = aqi_category(official_aqi)
        summary = (
            f"Official CPCB AQI is {official_aqi} ({official_category}), "
            f"driven by {official_dominant} across {total_valid} monitored parameters."
        )
    else:
        official_status = "unavailable"
        official_aqi = None
        official_category = None
        missing = []
        if not has_particulate:
            missing.append("at least one particulate pollutant (PM2.5 or PM10)")
        if total_valid < 3:
            missing.append(f"at least 3 monitored pollutants (currently {total_valid})")
        official_reason = (
            f"CPCB National Air Quality Index requires {', '.join(missing)}. "
            f"Indicative particulate indicator is provided based on measured PM."
        )
        summary = (
            f"Indicative particulate AQI is {indicative_aqi} ({ind_category}) derived from {dominant_pol}. "
            f"Official CPCB AQI is unavailable ({official_reason})."
        )

    # Identify available vs missing pollutant inputs under CPCB NAQI standard
    all_cpcb_pollutants = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "Pb"]
    available_measurements = [k for k, v in concentrations.items() if v is not None]
    missing_inputs = [p for p in all_cpcb_pollutants if concentrations.get(p) is None]

    category_for_health = official_category if official_status == "available" and official_category else ind_category
    health_guidance = CPCB_HEALTH_GUIDANCE.get(category_for_health, "No specific health guidance available.")

    return {
        "standard": "CPCB",
        "calculation_method": "CPCB NAQI Piecewise Linear Interpolation (Max sub-index formula)",
        "official_status": official_status,
        "official_reason": official_reason,
        "official_aqi": official_aqi,
        "official_category": official_category,
        "indicative_aqi": indicative_aqi,
        "indicative_category": ind_category,
        "indicative_color": ind_color,
        "dominant_pollutant": dominant_pol,
        "sub_indices": sub_indices,
        "concentrations": concentrations,
        "available_measurements": available_measurements,
        "missing_inputs": missing_inputs,
        "health_guidance": health_guidance,
        "summary": summary,
    }
