"""
Kayak Journey Planner - Flask Backend
"""
from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import math
import json
import requests
from bs4 import BeautifulSoup
import re

app = Flask(__name__)

# Sample launch spots database (in production, use a proper database)
LAUNCH_SPOTS = [
    {
        "id": 1,
        "name": "Weston Shore",
        "lat": 50.8992,
        "lon": -1.3850,
        "description": "Popular launch spot with parking",
        "facilities": ["parking", "toilets"],
        "tide_station": "Southampton"
    },
    {
        "id": 2,
        "name": "Calshot Beach",
        "lat": 50.8108,
        "lon": -1.3055,
        "description": "Beach launch, accessible at most tide states",
        "facilities": ["parking", "cafe"],
        "tide_station": "Southampton"
    },
    {
        "id": 3,
        "name": "Hamble Point",
        "lat": 50.8545,
        "lon": -1.3093,
        "description": "River launch, sheltered",
        "facilities": ["parking"],
        "tide_station": "Southampton"
    }
]

# Sample tide stations
TIDE_STATIONS = {
    "Southampton": {
        "lat": 50.9025,
        "lon": -1.4042,
        "name": "Southampton",
        "country": "UK"
    },
    "Portsmouth": {
        "lat": 50.8000,
        "lon": -1.1087,
        "name": "Portsmouth",
        "country": "UK"
    }
}


def calculate_tide_height(time, reference_time, high_tide, low_tide, period=12.42):
    """
    Calculate tide height using simplified harmonic method
    period: Average tidal period in hours (12.42 for semi-diurnal tides)
    """
    time_diff = (time - reference_time).total_seconds() / 3600  # hours
    tide_range = high_tide - low_tide
    phase = (time_diff / period) * 2 * math.pi
    height = low_tide + (tide_range / 2) * (1 + math.cos(phase))
    return round(height, 2)


def calculate_spring_neap_percentage(date):
    """
    Calculate spring/neap percentage based on lunar cycle
    Returns percentage where 100% = springs, 0% = neaps
    
    NOTE: This is a simplified calculation. For production, use real tide API data
    or astronomical libraries like ephem/skyfield for accurate moon phases.
    """
    # Convert to datetime if needed
    if not isinstance(date, datetime):
        try:
            date = datetime.fromisoformat(str(date))
        except:
            date = datetime.now()
    
    # Known moon phases for June 2026:
    # New Moon: May 31, 2026
    # First Quarter: June 8, 2026
    # Full Moon: June 14, 2026
    # Last Quarter: June 22, 2026
    
    # Reference: New Moon on May 31, 2026
    new_moon = datetime(2026, 5, 31)
    days_since_new = (date - new_moon).days % 29.53
    
    # Springs occur around new/full moon (0 and ~14.76 days)
    # Neaps occur around quarters (~7.38 and ~22.15 days)
    # Springs take about 3 days to decay to mid-range
    
    lunar_day = days_since_new
    
    # Calculate percentage based on distance from springs/neaps
    if lunar_day <= 3:  # Just after new moon (springs)
        percentage = 100 - (lunar_day / 7.38) * 40
    elif lunar_day <= 7.38:  # Approaching first quarter (neaps)
        percentage = 60 - ((lunar_day - 3) / 4.38) * 60
    elif lunar_day <= 11:  # Just after first quarter
        percentage = 0 + ((lunar_day - 7.38) / 3.62) * 40
    elif lunar_day <= 14.76:  # Approaching full moon (springs)
        percentage = 40 + ((lunar_day - 11) / 3.76) * 60
    elif lunar_day <= 18:  # Just after full moon (springs)
        percentage = 100 - ((lunar_day - 14.76) / 3.24) * 40
    elif lunar_day <= 22.15:  # Approaching last quarter (neaps)
        percentage = 60 - ((lunar_day - 18) / 4.15) * 60
    elif lunar_day <= 26:  # Just after last quarter
        percentage = 0 + ((lunar_day - 22.15) / 3.85) * 40
    else:  # Approaching new moon (springs)
        percentage = 40 + ((lunar_day - 26) / 3.53) * 60
    
    return round(max(0, min(100, percentage)), 1)


@app.route('/')
def index():
    """Render main application page"""
    return render_template('index.html')


@app.route('/api/launch-spots')
def get_launch_spots():
    """Get all launch spots"""
    return jsonify(LAUNCH_SPOTS)


@app.route('/api/tide-stations')
def get_tide_stations():
    """Get all tide stations"""
    return jsonify(TIDE_STATIONS)


@app.route('/api/tides', methods=['POST'])
def get_tides():
    """
    Calculate tide predictions for a given location and time period
    Expects JSON: {
        "station": "Southampton",
        "start_time": "2026-06-03T08:00:00",
        "duration_hours": 4
    }
    """
    data = request.json
    station = data.get('station', 'Southampton')
    start_time_str = data.get('start_time')
    duration_hours = data.get('duration_hours', 4)
    
    start_time = datetime.fromisoformat(start_time_str)
    
    # Generate tide predictions (in production, use real tide API)
    # This is simplified - real tides are more complex
    tide_data = []
    
    # Calculate reference high tide (assume 6 hours after midnight)
    reference_time = start_time.replace(hour=6, minute=0, second=0)
    if start_time.hour < 6:
        reference_time = reference_time - timedelta(days=1)
    
    # Get spring/neap percentage
    spring_percentage = calculate_spring_neap_percentage(start_time)
    
    # Tide heights (meters) - adjusted by spring/neap
    spring_factor = spring_percentage / 100
    high_tide = 4.5 + (1.0 * spring_factor)  # Higher on springs
    low_tide = 1.0 - (0.5 * spring_factor)   # Lower on springs
    
    # Generate hourly predictions
    for i in range(duration_hours + 1):
        time = start_time + timedelta(hours=i)
        height = calculate_tide_height(time, reference_time, high_tide, low_tide)
        
        tide_data.append({
            "time": time.isoformat(),
            "height": height,
            "station": station
        })
    
    return jsonify({
        "tides": tide_data,
        "spring_percentage": spring_percentage,
        "high_tide": round(high_tide, 2),
        "low_tide": round(low_tide, 2),
        "station": station
    })


@app.route('/api/journey-plan', methods=['POST'])
def plan_journey():
    """
    Plan a journey with tide information
    Expects JSON: {
        "start_location": {"lat": 50.899, "lon": -1.385},
        "end_location": {"lat": 50.810, "lon": -1.305},
        "start_time": "2026-06-03T08:00:00",
        "duration_hours": 3
    }
    """
    try:
        data = request.json
        print(f"Received request: {data}")  # Debug logging
        
        start_loc = data.get('start_location')
        end_loc = data.get('end_location')
        start_time_str = data.get('start_time')
        duration_hours = data.get('duration_hours', 3)
        manual_spring_percentage = data.get('spring_percentage')  # Optional manual override
        
        start_time = datetime.fromisoformat(start_time_str)
        end_time = start_time + timedelta(hours=duration_hours)
    
    # Find nearest tide station (simplified - just use Southampton)
    station = "Southampton"
    
    # Get tide data for the journey period
    tide_request = {
        "station": station,
        "start_time": start_time_str,
        "duration_hours": duration_hours
    }
    
    # Calculate distance (simplified great circle)
    lat1, lon1 = math.radians(start_loc['lat']), math.radians(start_loc['lon'])
    lat2, lon2 = math.radians(end_loc['lat']), math.radians(end_loc['lon'])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    distance_km = 6371 * c
    distance_nm = distance_km * 0.539957  # Convert to nautical miles
    
    # Get tide data - use manual spring percentage if provided, 
    # otherwise try Royal Navy, then fall back to calculation
    reference_time = start_time.replace(hour=6, minute=0, second=0)
    if manual_spring_percentage is not None:
        spring_percentage = float(manual_spring_percentage)
        spring_source = "manual"
    else:
        # Try fetching from Royal Navy
        try:
            spring_percentage = fetch_royal_navy_spring_percentage(start_time)
            if spring_percentage is not None:
                spring_source = "Royal Navy"
            else:
                spring_percentage = calculate_spring_neap_percentage(start_time)
                spring_source = "estimated"
        except Exception as e:
            print(f"Error fetching spring data: {e}")
            spring_percentage = calculate_spring_neap_percentage(start_time)
            spring_source = "estimated"
    
    # Ensure spring_percentage is valid
    if spring_percentage is None:
        spring_percentage = 50.0  # Default fallback
        spring_source = "default"
    
    spring_factor = spring_percentage / 100
    high_tide = 4.5 + (1.0 * spring_factor)
    low_tide = 1.0 - (0.5 * spring_factor)
    
    start_tide_height = calculate_tide_height(start_time, reference_time, high_tide, low_tide)
    end_tide_height = calculate_tide_height(end_time, reference_time, high_tide, low_tide)
    
    # Estimate tidal flow impact (simplified)
    tide_direction = "rising" if end_tide_height > start_tide_height else "falling"
    flow_rate = abs(end_tide_height - start_tide_height) / duration_hours
    
    return jsonify({
        "journey": {
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_hours": duration_hours,
            "distance_km": round(distance_km, 2),
            "distance_nm": round(distance_nm, 2)
        },
        "tides": {
            "station": station,
            "start_height": start_tide_height,
            "end_height": end_tide_height,
            "tide_direction": tide_direction,
            "flow_rate": round(flow_rate, 2),
            "spring_percentage": spring_percentage,
            "spring_source": spring_source
        }
    })
    
    except Exception as e:
        print(f"Error in plan_journey: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
