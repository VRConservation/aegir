# Kayak Journey Planner

A web application for planning kayak journeys with real-time tide information, interactive maps, and launch spot database.

## Features

- 🗺️ **Interactive Map**: Leaflet.js-based map with click-to-select start/end locations
- 📍 **Launch Spots Database**: Pre-loaded launch spots with facilities information
- 🌊 **Tide Predictions**: Calculate tide heights and flow rates for your journey
- 📊 **Tide Charts**: Visualize tide patterns during your trip
- 🌙 **Spring/Neap Calculator**: Shows percentage of spring tides
- 📱 **Geolocation**: Use your current location as starting point
- 📏 **Distance Calculator**: Automatic distance calculation in km and nautical miles

## Tech Stack

- **Backend**: Python Flask
- **Frontend**: HTML, CSS, JavaScript
- **Maps**: Leaflet.js
- **Charts**: Chart.js
- **Styling**: Custom CSS with responsive design

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the application:**
   ```bash
   python app.py
   ```

3. **Open in browser:**
   Navigate to `http://localhost:5000`

## Usage

1. **Set Start Location:**
   - Click on the map, or
   - Use "📍 Use My Location" button, or
   - Click a launch spot and select "Set as Start"

2. **Set End Location:**
   - Click on the map again, or
   - Click a launch spot and select "Set as End"

3. **Configure Journey:**
   - Set departure time
   - Set expected duration

4. **Calculate:**
   - Click "Calculate Journey"
   - View results in the sidebar including:
     - Distance and duration
     - Tide heights at start/end
     - Flow rate and direction
     - Spring/neap percentage

## Current Limitations & Future Enhancements

### Current Implementation
This is a **prototype** using simplified tide calculations. The tide data is generated using a basic harmonic model and should not be used for real navigation.

### Planned Enhancements

1. **Real Tide Data Integration:**
   - Integrate with Admiralty EasyTide API (UK)
   - WorldTides API for global coverage
   - NOAA API for US waters

2. **Enhanced Features:**
   - Save favorite routes
   - Weather integration
   - Current/flow visualization with arrows
   - Restricted areas and hazards
   - Route optimization based on tides

3. **Database:**
   - PostgreSQL with PostGIS for spatial queries
   - More comprehensive launch spots database
   - User accounts and saved journeys

4. **Mobile App:**
   - Progressive Web App (PWA) support
   - Offline maps
   - GPS tracking during journey

## API Endpoints

### `GET /`
Returns the main application page

### `GET /api/launch-spots`
Returns all launch spots with their locations and facilities

### `GET /api/tide-stations`
Returns available tide stations

### `POST /api/tides`
Calculate tide predictions for a location and time period

**Request body:**
```json
{
  "station": "Southampton",
  "start_time": "2026-06-03T08:00:00",
  "duration_hours": 4
}
```

### `POST /api/journey-plan`
Plan a complete journey with tide information

**Request body:**
```json
{
  "start_location": {"lat": 50.899, "lon": -1.385},
  "end_location": {"lat": 50.810, "lon": -1.305},
  "start_time": "2026-06-03T08:00:00",
  "duration_hours": 3
}
```

## Project Structure

```
kajak-journeys/
├── app.py                 # Flask backend with API endpoints
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html        # Main HTML template
├── static/
│   ├── style.css         # Custom styling
│   └── app.js            # Frontend JavaScript
└── README.md             # This file
```

## Development

### Adding Launch Spots
Edit the `LAUNCH_SPOTS` array in `app.py`:

```python
LAUNCH_SPOTS = [
    {
        "id": 1,
        "name": "Your Spot Name",
        "lat": 50.123,
        "lon": -1.456,
        "description": "Description",
        "facilities": ["parking", "toilets"],
        "tide_station": "Nearest Station"
    }
]
```

### Integrating Real Tide API

To replace the simplified tide calculations with real data:

1. Sign up for a tide data API (e.g., Admiralty EasyTide, WorldTides)
2. Modify the `get_tides()` function in `app.py`
3. Replace the harmonic calculations with API calls

Example structure:
```python
@app.route('/api/tides', methods=['POST'])
def get_tides():
    data = request.json
    # Call external tide API
    response = requests.get(
        f'https://api.tidesapi.com/...',
        params={'station': data['station'], 'date': data['start_time']}
    )
    return jsonify(response.json())
```

## Contributing

This is a prototype project. Feel free to:
- Add more launch spots
- Improve tide calculations
- Add weather integration
- Enhance the UI/UX
- Add more features

## License

Open source - use and modify as needed.

## Safety Notice

⚠️ **IMPORTANT**: This is a planning tool only. Always:
- Check official tide tables before any kayak journey
- Assess weather conditions
- Have proper safety equipment
- Know your abilities and limitations
- File a float plan with someone onshore
- Never kayak alone in challenging conditions

## Credits

- Map tiles: OpenStreetMap contributors
- Icons: Leaflet Color Markers
- Tide calculations: Simplified harmonic model (replace with real API for production)
