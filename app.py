"""
Aegir - Kayak Journey Planner
"""
__version__ = '0.1.0'

from flask import Flask, jsonify, request, render_template
from datetime import datetime, timedelta
import math
import requests

app = Flask(__name__)

TIDE_STATIONS = {
    "Southampton": {
        "lat": 50.9025, "lon": -1.4042,
        "name": "Southampton", "country": "UK"
    },
    "Portsmouth": {
        "lat": 50.8000, "lon": -1.1087,
        "name": "Portsmouth", "country": "UK"
    }
}

KAYAK_BASE_SPEED_KMH = 6.0


def calculate_tide_height(time, reference_time, high_tide, low_tide, period=12.42):
    """Calculate tide height using simplified harmonic method."""
    time_diff = (time - reference_time).total_seconds() / 3600
    tide_range = high_tide - low_tide
    phase = (time_diff / period) * 2 * math.pi
    height = low_tide + (tide_range / 2) * (1 + math.cos(phase))
    return round(height, 2)


def _julian_day(year, month, day):
    """Calculate Julian Day number from calendar date."""
    if month <= 2:
        year -= 1
        month += 12
    A = int(year / 100)
    B = 2 - A + int(A / 4)
    return int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + B - 1524.5


def calculate_spring_neap_percentage(date):
    """
    Calculate spring/neap percentage based on lunar phase.
    100% = springs (new/full moon), 0% = neaps (quarter moon).
    """
    if not isinstance(date, datetime):
        try:
            date = datetime.fromisoformat(str(date))
        except Exception:
            date = datetime.now()

    jd = _julian_day(date.year, date.month, date.day)
    known_new_moon_jd = 2451551.26
    synodic_month = 29.53058867

    days_since = jd - known_new_moon_jd
    phase = (days_since % synodic_month) / synodic_month
    percentage = 100 * math.cos(2 * math.pi * phase) ** 2
    return round(max(0, min(100, percentage)), 1)


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


def calculate_tide_params(start_time, duration_hours, spring_percentage):
    """Calculate tide heights, direction and flow rate for a given duration."""
    spring_factor = spring_percentage / 100
    high_tide = 4.5 + (1.0 * spring_factor)
    low_tide = 1.0 - (0.5 * spring_factor)
    reference_time = start_time.replace(hour=6, minute=0, second=0)
    end_time = start_time + timedelta(hours=duration_hours)
    start_height = calculate_tide_height(start_time, reference_time, high_tide, low_tide)
    end_height = calculate_tide_height(end_time, reference_time, high_tide, low_tide)
    tide_direction = "rising" if end_height > start_height else "falling"
    flow_rate = abs(end_height - start_height) / duration_hours
    return start_height, end_height, tide_direction, flow_rate


def estimate_duration(distance_km, start_time, spring_percentage):
    """
    Estimate journey duration based on distance, paddling speed and tidal flow.
    Iterative: guess duration, compute tides, adjust speed, repeat.
    """
    duration = distance_km / KAYAK_BASE_SPEED_KMH

    for _ in range(2):
        start_h, end_h, tide_dir, flow_rate = calculate_tide_params(
            start_time, duration, spring_percentage
        )
        current_kmh = flow_rate * 0.8
        if tide_dir == "rising":
            effective_speed = KAYAK_BASE_SPEED_KMH + current_kmh * 0.5
        else:
            effective_speed = max(KAYAK_BASE_SPEED_KMH - current_kmh * 0.5, 2.0)
        duration = distance_km / effective_speed

    return round(duration, 1)


# --- Routes ---

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
    """Calculate tide predictions for a given location and time period."""
    data = request.json
    station = data.get('station', 'Southampton')
    start_time_str = data.get('start_time')
    duration_hours = data.get('duration_hours', 4)
    if not start_time_str:
        return jsonify({'error': 'start_time is required'}), 400

    start_time = datetime.fromisoformat(start_time_str)
    reference_time = start_time.replace(hour=6, minute=0, second=0)
    if start_time.hour < 6:
        reference_time = reference_time - timedelta(days=1)

    spring_percentage = calculate_spring_neap_percentage(start_time)
    spring_factor = spring_percentage / 100
    high_tide = 4.5 + (1.0 * spring_factor)
    low_tide = 1.0 - (0.5 * spring_factor)

    tide_data = []
    for i in range(int(duration_hours) + 1):
        t = start_time + timedelta(hours=i)
        height = calculate_tide_height(t, reference_time, high_tide, low_tide)
        tide_data.append({"time": t.isoformat(), "height": height, "station": station})

    return jsonify({
        "tides": tide_data,
        "spring_percentage": spring_percentage,
        "high_tide": round(high_tide, 2),
        "low_tide": round(low_tide, 2),
        "station": station,
    })


@app.route('/api/journey-plan', methods=['POST'])
def plan_journey():
    """
    Plan a journey with tide and weather information.
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
        manual_spring_percentage = data.get('spring_percentage')

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

        # Spring/neap
        if manual_spring_percentage is not None:
            spring_percentage = float(manual_spring_percentage)
            spring_source = "manual"
        else:
            spring_percentage = calculate_spring_neap_percentage(start_time)
            spring_source = "estimated"

        if spring_percentage is None:
            spring_percentage = 50.0
            spring_source = "default"

        # Estimate duration
        duration_hours = estimate_duration(distance_km, start_time, spring_percentage)
        end_time = start_time + timedelta(hours=duration_hours)

        # Calculate tides
        start_height, end_height, tide_direction, flow_rate = calculate_tide_params(
            start_time, duration_hours, spring_percentage
        )

        # Fetch weather
        mid_lat = (start_loc['lat'] + end_loc['lat']) / 2
        mid_lon = (start_loc['lon'] + end_loc['lon']) / 2
        weather = fetch_weather(
            mid_lat, mid_lon,
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
                        'temperature': weather['temperature'][i] if i < len(weather['temperature']) else None,
                        'wind_speed': weather['wind_speed'][i] if i < len(weather['wind_speed']) else None,
                        'wind_direction': wind_direction_name(wind_dir_raw),
                        'precipitation_probability': weather['precipitation_probability'][i] if i < len(weather['precipitation_probability']) else None,
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
                "station": "Southampton",
                "start_height": start_height,
                "end_height": end_height,
                "tide_direction": tide_direction,
                "flow_rate": round(flow_rate, 2),
                "spring_percentage": spring_percentage,
                "spring_source": spring_source,
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
    print("  🚀 Running at \033[92mhttp://localhost:5080\033[0m")
    print("  📍 Press Ctrl+C to stop")
    print()
    app.run(debug=True, host='0.0.0.0', port=5080)
