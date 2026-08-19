# Aegir

Kayak Journey Planner — tide predictions, weather forecasts and route planning.

## Features

- **Wizard flow**: Step-by-step journey planning (When → Where → Conditions → Map)
- **Location search**: Search any UK location via Nominatim (OpenStreetMap)
- **Weather forecasts**: Real-time data from Open-Meteo API (free, no key required)
- **Tide predictions**: Simplified harmonic model with spring/neap calculation
- **Estimated duration**: Calculated from distance, paddling speed and tidal flow
- **Interactive map**: Leaflet.js with click-to-add waypoints and route drawing
- **GO / CAUTION / NO GO**: Traffic-light conditions assessment

## Quick Start

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5080

## Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: Vanilla JS, Leaflet.js, Chart.js
- **Data**: Open-Meteo (weather), Nominatim (geocoding), simplified harmonic tides
- **Versioning**: bump2version

## Versioning

```bash
bump2version patch   # 0.0.1 → 0.0.2
bump2version minor   # 0.0.2 → 0.1.0
bump2version major   # 0.1.0 → 1.0.0
```

The version is displayed in the app title and included in git tags.

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Main app |
| POST | `/api/geocode` | Search locations (Nominatim) |
| GET | `/api/tide-stations` | List tide stations |
| POST | `/api/weather` | Weather forecast (Open-Meteo) |
| POST | `/api/tides` | Tide predictions |
| POST | `/api/journey-plan` | Full journey plan with estimated duration |

## Safety Notice

**This is a planning tool only.** Always check official tide tables and weather forecasts before any kayak journey. Never kayak alone in challenging conditions.
