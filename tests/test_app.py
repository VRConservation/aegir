"""Tests for Aegir Kayak Journey Planner."""
import json
import pytest
from datetime import datetime

from app import app, calculate_tide_height, calculate_spring_neap_percentage


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestCalculateTideHeight:
    def test_at_reference_time_equals_high_tide(self):
        ref = datetime(2026, 6, 1, 6, 0, 0)
        height = calculate_tide_height(ref, ref, high_tide=4.5, low_tide=1.0)
        assert height == 4.5

    def test_half_period_equals_low_tide(self):
        ref = datetime(2026, 6, 1, 6, 0, 0)
        half_period_hours = 12.42 / 2
        t = ref + __import__('datetime').timedelta(hours=half_period_hours)
        height = calculate_tide_height(t, ref, high_tide=4.5, low_tide=1.0)
        assert abs(height - 1.0) < 0.05

    def test_height_within_range(self):
        ref = datetime(2026, 6, 1, 6, 0, 0)
        for offset in range(0, 13):
            t = ref + __import__('datetime').timedelta(hours=offset)
            height = calculate_tide_height(t, ref, high_tide=4.5, low_tide=1.0)
            assert 1.0 <= height <= 4.5


class TestCalculateSpringNeapPercentage:
    def test_returns_value_between_0_and_100(self):
        for month in range(1, 13):
            pct = calculate_spring_neap_percentage(datetime(2026, month, 15))
            assert 0 <= pct <= 100

    def test_near_new_moon_is_springs(self):
        pct = calculate_spring_neap_percentage(datetime(2026, 5, 31))
        assert pct >= 90

    def test_accepts_datetime(self):
        result = calculate_spring_neap_percentage(datetime(2026, 6, 1, 12, 0))
        assert isinstance(result, float)


class TestRoutes:
    def test_index_returns_200(self, client):
        response = client.get('/')
        assert response.status_code == 200

    def test_tide_stations_returns_json(self, client):
        response = client.get('/api/tide-stations')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'Southampton' in data
        assert 'Portsmouth' in data

    def test_tides_endpoint(self, client):
        payload = {
            "station": "Southampton",
            "start_time": "2026-06-15T08:00:00",
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
        assert 'spring_percentage' in data

    def test_journey_plan_endpoint(self, client):
        payload = {
            "start_location": {"lat": 50.899, "lon": -1.385},
            "end_location": {"lat": 50.810, "lon": -1.305},
            "start_time": "2026-06-15T08:00:00",
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
        assert data['tides']['station'] == 'Southampton'

    def test_journey_plan_with_waypoints(self, client):
        payload = {
            "start_location": {"lat": 50.899, "lon": -1.385},
            "end_location": {"lat": 50.810, "lon": -1.305},
            "start_time": "2026-06-15T08:00:00",
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

    def test_journey_plan_with_manual_spring_percentage(self, client):
        payload = {
            "start_location": {"lat": 50.899, "lon": -1.385},
            "end_location": {"lat": 50.810, "lon": -1.305},
            "start_time": "2026-06-15T08:00:00",
            "spring_percentage": 75
        }
        response = client.post(
            '/api/journey-plan',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['tides']['spring_percentage'] == 75.0
        assert data['tides']['spring_source'] == 'manual'
