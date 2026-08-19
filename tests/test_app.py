"""Tests for Aegir Kayak Journey Planner."""
import json
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from app import app, estimate_spring_neap
import tide_data


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


SAMPLE_EVENTS = [
    {"time": datetime(2026, 8, 19, 4, 32), "height": 4.21, "type": "HW"},
    {"time": datetime(2026, 8, 19, 9, 37), "height": 1.48, "type": "LW"},
    {"time": datetime(2026, 8, 19, 16, 55), "height": 4.28, "type": "HW"},
    {"time": datetime(2026, 8, 19, 22, 1), "height": 1.65, "type": "LW"},
]


class TestInterpolateHeight:
    def test_at_hw_returns_hw_height(self):
        h = tide_data.interpolate_height(datetime(2026, 8, 19, 4, 32), SAMPLE_EVENTS)
        assert h == 4.21

    def test_at_lw_returns_lw_height(self):
        h = tide_data.interpolate_height(datetime(2026, 8, 19, 9, 37), SAMPLE_EVENTS)
        assert h == 1.48

    def test_midpoint_between_hw_and_lw(self):
        t = datetime(2026, 8, 19, 7, 4)
        h = tide_data.interpolate_height(t, SAMPLE_EVENTS)
        assert h is not None
        assert 2.0 < h < 4.0

    def test_before_first_event(self):
        t = datetime(2026, 8, 19, 2, 0)
        h = tide_data.interpolate_height(t, SAMPLE_EVENTS)
        assert h == 4.21

    def test_after_last_event(self):
        t = datetime(2026, 8, 20, 2, 0)
        h = tide_data.interpolate_height(t, SAMPLE_EVENTS)
        assert h == 1.65

    def test_empty_events_returns_none(self):
        h = tide_data.interpolate_height(datetime(2026, 8, 19, 12, 0), [])
        assert h is None


class TestEstimateSpringNeap:
    def test_springs(self):
        label, pct = estimate_spring_neap(4.0)
        assert label == "Springs"
        assert pct == 90.0

    def test_neaps(self):
        label, pct = estimate_spring_neap(1.5)
        assert label == "Neaps"
        assert pct == 10.0

    def test_mid_tide(self):
        label, pct = estimate_spring_neap(3.0)
        assert label == "Mid tide"
        assert pct == 50.0


class TestRoutes:
    def test_index_returns_200(self, client):
        response = client.get('/')
        assert response.status_code == 200

    def test_tide_stations_returns_json(self, client):
        response = client.get('/api/tide-stations')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'Portsmouth' in data

    @patch('tide_data.fetch_tides')
    def test_tides_endpoint(self, mock_fetch, client):
        mock_fetch.return_value = SAMPLE_EVENTS
        payload = {
            "station": "Portsmouth",
            "start_time": "2026-08-19T08:00:00",
            "duration_hours": 4
        }
        response = client.post(
            '/api/tides',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'tides' in data
        assert len(data['tides']) == 5
        assert 'events' in data
        assert len(data['events']) == 4
        assert data['events'][0]['label'] == 'HWP'
        assert data['events'][1]['label'] == 'LWP'

    @patch('tide_data.fetch_tides')
    @patch('app.fetch_weather')
    def test_journey_plan_endpoint(self, mock_weather, mock_fetch, client):
        mock_fetch.return_value = SAMPLE_EVENTS
        mock_weather.return_value = None
        payload = {
            "start_location": {"lat": 50.899, "lon": -1.385},
            "end_location": {"lat": 50.810, "lon": -1.305},
            "start_time": "2026-08-19T08:00:00",
        }
        response = client.post(
            '/api/journey-plan',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'journey' in data
        assert 'tides' in data
        assert data['journey']['duration_hours'] > 0
        assert data['journey']['estimated'] is True
        assert data['journey']['distance_km'] > 0
        assert data['tides']['station'] == 'Portsmouth'
        assert 'next_hwp' in data['tides']
        assert 'next_lwp' in data['tides']
        assert 'tide_range' in data['tides']
        assert 'spring_label' in data['tides']

    @patch('tide_data.fetch_tides')
    @patch('app.fetch_weather')
    def test_journey_plan_with_waypoints(self, mock_weather, mock_fetch, client):
        mock_fetch.return_value = SAMPLE_EVENTS
        mock_weather.return_value = None
        payload = {
            "start_location": {"lat": 50.899, "lon": -1.385},
            "end_location": {"lat": 50.810, "lon": -1.305},
            "start_time": "2026-08-19T08:00:00",
            "waypoints": [{"lat": 50.85, "lon": -1.35}],
        }
        response = client.post(
            '/api/journey-plan',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['journey']['distance_km'] > 0
