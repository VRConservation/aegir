"""
Aegir - Kayak Journey Planner
"""
__version__ = '0.2.2'

from flask import Flask, jsonify, request, render_template
from datetime import datetime, timedelta
import math
import requests
import tide_data

app = Flask(__name__)

TIDE_STATIONS = {
    "Portsmouth": {
        "lat": 50.8000, "lon": -1.1087,
        "name": "Portsmouth", "country": "UK"
    }
}

KAYAK_BASE_SPEED_KMH = 6.0


def estimate_spring_neap(tide_range):
    """
    Derive a spring/neap label from tidal range.
    Portsmouth springs ~4.3m, neaps ~1.3m.
    """
    if tide_range >= 3.5:
        return "Springs", 90.0
    elif tide_range >= 2.5:
        return "Mid tide", 50.0
    else:
        return "Neaps", 10.0


def fetch_weather(lat, lon, start_date, end_date):
    """Fetch weather forecast from Open-Meteo API (free, no key required)."""
    try:
        resp = requests.get(
            'https://api.open-meteo.com/v1/forecast',
            params={
                'latitude': lat,
                'longitude': lon,
                'hourly': ','.join([
                    'temperature_2m', 'windspeed_10m', 'winddirection_10m',
                    'precipitation_probability', 'precipitation',
                    'weathercode', 'visibility',
                ]),
                'start_date': start_date,
                'end_date': end_date,
                'timezone': 'Europe/London',
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        hourly = data.get('hourly', {})
        return {
            'times': hourly.get('time', []),
            'temperature': hourly.get('temperature_2m', []),
            'wind_speed': hourly.get('windspeed_10m', []),
            'wind_direction': hourly.get('winddirection_10m', []),
            'precipitation_probability': hourly.get('precipitation_probability', []),
            'precipitation': hourly.get('precipitation', []),
            'weather_code': hourly.get('weathercode', []),
            'visibility': hourly.get('visibility', []),
        }
    except Exception as e:
        app.logger.error(f'Weather API error: {e}')
        return None


def weather_code_description(code):
    """Convert WMO weather code to human-readable description."""
    descriptions = {
        0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Rime fog',
        51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
        56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        66: 'Freezing rain', 67: 'Heavy freezing rain',
        71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
        80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
        85: 'Slight snow showers', 86: 'Heavy snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
    }
    return descriptions.get(code, f'Unknown ({code})')


def wind_direction_name(degrees):
    """Convert wind direction in degrees to compass direction."""
    if degrees is None:
        return 'N/A'
    dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
            'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return dirs[round(degrees / 22.5) % 16]


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km."""
    r1, o1 = math.radians(lat1), math.radians(lon1)
    r2, o2 = math.radians(lat2), math.radians(lon2)
    dlat, dlon = r2 - r1, o2 - o1
    a = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def calculate_tide_params(start_time, duration_hours):
    """Calculate tide heights, direction and flow rate using real Portsmouth data."""
    end_time = start_time + timedelta(hours=duration_hours)
    info = tide_data.get_tide_info(start_time, end_time)
    return (
        info["start_height"],
        info["end_height"],
        info["tide_direction"],
        info["flow_rate"],
        info,
    )


def estimate_duration(distance_km, start_time):
    """
    Estimate journey duration based on distance, paddling speed and tidal flow.
    Iterative: guess duration, compute tides, adjust speed, repeat.
    """
    duration = distance_km / KAYAK_BASE_SPEED_KMH

    for _ in range(2):
        start_h, end_h, tide_dir, flow_rate, _ = calculate_tide_params(
            start_time, duration
        )
        current_kmh = flow_rate * 0.8
        if tide_dir == "rising":
            effective_speed = KAYAK_BASE_SPEED_KMH + current_kmh * 0.5
        else:
            effective_speed = max(KAYAK_BASE_SPEED_KMH - current_kmh * 0.5, 2.0)
        duration = distance_km / effective_speed

    return round(duration, 1)


# --- Routes ---

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "version": __version__})


@app.route('/')
def index():
    return render_template('index.html', version=__version__)


@app.route('/api/geocode', methods=['POST'])
def geocode():
    """Search for a location using Nominatim (OpenStreetMap)."""
    data = request.json
    query = data.get('query', '').strip()
    if not query:
        return jsonify({'error': 'query is required'}), 400
    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': query, 'format': 'json', 'limit': 8, 'countrycodes': 'gb'},
            headers={'User-Agent': f'Aegir/{__version__}'},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        return jsonify([{
            'name': r.get('display_name', ''),
            'short_name': r.get('display_name', '').split(',')[0],
            'lat': float(r['lat']),
            'lon': float(r['lon']),
        } for r in results])
    except Exception as e:
        app.logger.error(f'Geocode error: {e}')
        return jsonify({'error': 'Geocoding failed'}), 502


@app.route('/api/tide-stations')
def get_tide_stations():
    return jsonify(TIDE_STATIONS)


@app.route('/api/weather', methods=['POST'])
def get_weather():
    """Fetch weather for a location and date range."""
    data = request.json
    lat = data.get('lat', 50.9)
    lon = data.get('lon', -1.4)
    start_date = data.get('start_date')
    end_date = data.get('end_date', start_date)
    if not start_date:
        return jsonify({'error': 'start_date is required'}), 400
    weather = fetch_weather(lat, lon, start_date, end_date)
    if weather is None:
        return jsonify({'error': 'Failed to fetch weather data'}), 502
    weather['weather_descriptions'] = [weather_code_description(c) for c in weather['weather_code']]
    weather['wind_direction_names'] = [wind_direction_name(d) for d in weather['wind_direction']]
    return jsonify(weather)


@app.route('/api/tides', methods=['POST'])
def get_tides():
    """Return real Portsmouth tide predictions: HW/LW events + interpolated hourly heights."""
    data = request.json
    start_time_str = data.get('start_time')
    duration_hours = data.get('duration_hours', 4)
    if not start_time_str:
        return jsonify({'error': 'start_time is required'}), 400

    start_time = datetime.fromisoformat(start_time_str)

    # Get HW/LW events
    events = tide_data.get_tide_events(start_time)

    # Get interpolated hourly heights
    hourly = tide_data.interpolate_hourly(start_time, duration_hours)

    # Derive spring/neap from tidal range
    if events:
        heights = [e["height"] for e in events]
        tide_range = max(heights) - min(heights) if len(heights) >= 2 else 0.0
        spring_label, spring_pct = estimate_spring_neap(tide_range)
    else:
        tide_range = 0.0
        spring_label = "Unknown"
        spring_pct = 50.0

    return jsonify({
        "tides": hourly,
        "events": events,
        "spring_percentage": spring_pct,
        "spring_label": spring_label,
        "tide_range": round(tide_range, 2),
        "station": "Portsmouth",
    })


@app.route('/api/journey-plan', methods=['POST'])
def plan_journey():
    """
    Plan a journey with real tide and weather information.
    Duration is estimated from distance, paddling speed and tidal flow.
    Expects JSON: {
        "start_location": {"lat": 50.899, "lon": -1.385},
        "end_location": {"lat": 50.810, "lon": -1.305},
        "start_time": "2026-06-03T08:00:00",
        "waypoints": [{"lat": 50.85, "lon": -1.35}, ...]
    }
    """
    try:
        data = request.json
        start_loc = data.get('start_location')
        end_loc = data.get('end_location')
        start_time_str = data.get('start_time')
        waypoints = data.get('waypoints', [])

        if not start_loc or not end_loc or not start_time_str:
            return jsonify({'error': 'start_location, end_location, and start_time are required'}), 400

        start_time = datetime.fromisoformat(start_time_str)

        # Calculate distance along waypoints
        all_points = [start_loc] + waypoints + [end_loc]
        distance_km = 0
        for i in range(len(all_points) - 1):
            distance_km += haversine_km(
                all_points[i]['lat'], all_points[i]['lon'],
                all_points[i + 1]['lat'], all_points[i + 1]['lon'],
            )
        distance_nm = distance_km * 0.539957

        # Estimate duration
        duration_hours = estimate_duration(distance_km, start_time)
        end_time = start_time + timedelta(hours=duration_hours)

        # Get real tide data
        tide_info = tide_data.get_tide_info(start_time, end_time)
        tide_range = tide_info.get("tide_range", 0.0)
        spring_label, spring_pct = estimate_spring_neap(tide_range)

        # Fetch weather for Portsmouth tide station
        portsmouth = TIDE_STATIONS["Portsmouth"]
        weather = fetch_weather(
            portsmouth['lat'], portsmouth['lon'],
            start_time.strftime('%Y-%m-%d'),
            end_time.strftime('%Y-%m-%d'),
        )

        weather_summary = None
        if weather and weather['times']:
            start_hour = start_time.hour
            for i, t in enumerate(weather['times']):
                dt = datetime.fromisoformat(t)
                if dt.date() == start_time.date() and dt.hour == start_hour:
                    wind_dir_raw = weather['wind_direction'][i] if i < len(weather['wind_direction']) else None
                    wc = weather['weather_code'][i] if i < len(weather['weather_code']) else None
                    weather_summary = {
                        'temperature': round(weather['temperature'][i]) if i < len(weather['temperature']) and weather['temperature'][i] is not None else None,
                        'wind_speed': weather['wind_speed'][i] if i < len(weather['wind_speed']) else None,
                        'wind_direction': wind_direction_name(wind_dir_raw),
                        'precipitation_probability': round(weather['precipitation_probability'][i]) if i < len(weather['precipitation_probability']) and weather['precipitation_probability'][i] is not None else None,
                        'precipitation': round(weather['precipitation'][i]) if i < len(weather['precipitation']) and weather['precipitation'][i] is not None else None,
                        'weather_description': weather_code_description(wc) if wc is not None else None,
                    }
                    break

        return jsonify({
            "journey": {
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_hours": duration_hours,
                "distance_km": round(distance_km, 2),
                "distance_nm": round(distance_nm, 2),
                "estimated": True,
            },
            "tides": {
                "station": "Portsmouth",
                "start_height": tide_info["start_height"],
                "end_height": tide_info["end_height"],
                "tide_direction": tide_info["tide_direction"],
                "flow_rate": tide_info["flow_rate"],
                "spring_percentage": spring_pct,
                "spring_label": spring_label,
                "tide_range": tide_range,
                "next_hwp": tide_info["next_hwp"],
                "next_lwp": tide_info["next_lwp"],
            },
            "weather": weather_summary,
        })

    except Exception as e:
        app.logger.error(f'Error in plan_journey: {e}')
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print()
    print(f"  🛶 Aegir v{__version__}")
    print("  ───────────────────────")
    print("  🚀 Running at \033[92mhttp://localhost:8081\033[0m")
    print("  📍 Press Ctrl+C to stop")
    print()
    app.run(debug=True, host='0.0.0.0', port=8081)
