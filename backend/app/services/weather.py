"""
Weather and reverse geocoding services for AirPurify AI.
Integrates Open-Meteo for live ambient outdoor temperature and relative humidity.
Integrates OpenStreetMap Nominatim for reverse geocoding.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import httpx

logger = logging.getLogger("airpurify.weather")

base_codes = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_ambient_weather(latitude: float, longitude: float) -> Dict[str, Any]:
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError("Longitude must be between -180 and 180 degrees.")

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure",
        "timezone": "auto",
    }

    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        current = data.get("current", {})
        temp = current.get("temperature_2m")
        hum = current.get("relative_humidity_2m")
        code = current.get("weather_code")
        wind = current.get("wind_speed_10m")
        pressure = current.get("surface_pressure")
        obs_time = current.get("time")

        if obs_time:
            try:
                obs_time_iso = datetime.fromisoformat(obs_time).isoformat()
            except Exception:
                obs_time_iso = obs_time
        else:
            obs_time_iso = datetime.now(timezone.utc).isoformat()

        weather_desc = base_codes.get(code, "Unknown meteorological condition")

        return {
            "provider": "Open-Meteo Weather API",
            "latitude": float(data.get("latitude", latitude)),
            "longitude": float(data.get("longitude", longitude)),
            "elevation": data.get("elevation"),
            "temperature": float(temp) if temp is not None else None,
            "humidity": float(hum) if hum is not None else None,
            "weather_code": code,
            "weather_description": weather_desc,
            "wind_speed_10m": float(wind) if wind is not None else None,
            "surface_pressure": float(pressure) if pressure is not None else None,
            "observation_timestamp": obs_time_iso,
            "units": {
                "temperature": "Â°C",
                "humidity": "%",
                "wind_speed": "km/h",
                "pressure": "hPa",
            },
            "is_model_estimate": True,
            "observation_type": "Outdoor ambient NWP meteorological assimilation",
            "disclaimer": "Outdoor ambient meteorological observation. Open-Meteo models ambient conditions 2 meters above ground. This represents outdoor weather at the specified coordinates, NOT internal room micro-climate or connected PMS7003 indoor particulate sensor readings.",
        }
    except Exception as e:
        logger.warning(f"Error fetching ambient weather for ({latitude}, {longitude}): {e}")
        return {
            "provider": "Open-Meteo Weather API",
            "latitude": latitude,
            "longitude": longitude,
            "elevation": None,
            "temperature": None,
            "humidity": None,
            "weather_code": None,
            "weather_description": "Weather service currently unavailable",
            "wind_speed_10m": None,
            "surface_pressure": None,
            "observation_timestamp": datetime.now(timezone.utc).isoformat(),
            "units": {"temperature": "Â°C", "humidity": "%"},
            "is_model_estimate": True,
            "observation_type": "Unavailable",
            "disclaimer": f"Weather API observation retrieval failed: {str(e)}",
        }


def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Any]:
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError("Longitude must be between -180 and 180 degrees.")

    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "lat": latitude,
        "lon": longitude,
        "format": "json",
    }
    headers = {
        "User-Agent": "AirPurifyAI/2.0 (Environmental Research Platform)",
    }

    try:
        with httpx.Client(timeout=5.0, headers=headers) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        display_name = data.get("display_name", f"Coordinates: {latitude:.4f}, {longitude:.4f}")
        address = data.get("address", {})
        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("suburb")
            or address.get("county")
        )
        state = address.get("state")
        country = address.get("country")

        return {
            "display_name": display_name,
            "city": city,
            "state": state,
            "country": country,
            "latitude": latitude,
            "longitude": longitude,
            "source": "OpenStreetMap Nomination",
        }
    except Exception as e:
        logger.warning(f"Error reverse geocoding ({latitude}, {longitude}): {e}")
        return {
            "display_name": f"Location at {latitude:.4f}Â° N, {longitude:.4f}Â° E",
            "city": None,
            "state": None,
            "country": None,
            "latitude": latitude,
            "longitude": longitude,
            "source": "Coordinates Fallback",
        }

