"""
Portsmouth tide data scraper and interpolator.
Fetches real HW/LW predictions from tidetimes.org.uk.
"""
from datetime import datetime, timedelta, date
import requests
from bs4 import BeautifulSoup

STATION_SLUG = "portsmouth"
BASE_URL = "https://www.tidetimes.org.uk"
USER_AGENT = "Aegir-Kayak-Planner/0.3"

_cache = {}  # {date_str: list[dict]}


def _fetch_page(date_str):
    """Fetch a single day's tide page from tidetimes.org.uk."""
    url = f"{BASE_URL}/{STATION_SLUG}-tide-times-{date_str}"
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
    resp.raise_for_status()
    return resp.text


def _parse_tides(html, for_date):
    """Parse BST tide entries from HTML. Returns list of {time, height, type}."""
    soup = BeautifulSoup(html, "html.parser")
    tides_div = soup.find("div", id="tides")
    if not tides_div:
        return []

    events = []
    for row in tides_div.find_all("tr", class_="vis2"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        hi_lo = cells[0].get_text(strip=True)
        time_str = cells[1].get_text(strip=True)
        height_str = cells[2].get_text(strip=True).replace("m", "")

        if hi_lo not in ("High", "Low"):
            continue

        h, m = time_str.split(":")
        dt = datetime.combine(for_date, datetime.min.time().replace(
            hour=int(h), minute=int(m)
        ))
        events.append({
            "time": dt,
            "height": round(float(height_str), 2),
            "type": "HW" if hi_lo == "High" else "LW",
        })

    return events


def fetch_tides(target_date):
    """
    Fetch tides for a given date.
    Returns list of {time: datetime, height: float, type: "HW"|"LW"}
    sorted by time.
    """
    if isinstance(target_date, datetime):
        for_date = target_date.date()
    elif isinstance(target_date, date):
        for_date = target_date
    elif isinstance(target_date, str):
        try:
            for_date = datetime.fromisoformat(target_date).date()
        except ValueError:
            for_date = date.fromisoformat(target_date)
    else:
        for_date = date.today()

    cache_key = for_date.isoformat()
    if cache_key in _cache:
        return _cache[cache_key]

    # Fetch current day and next day to cover overnight queries
    dates_to_fetch = [for_date]
    if for_date < date.today() + timedelta(days=6):
        dates_to_fetch.append(for_date + timedelta(days=1))

    all_events = []
    for d in dates_to_fetch:
        ds = d.strftime("%Y%m%d")
        try:
            html = _fetch_page(ds)
            all_events.extend(_parse_tides(html, d))
        except Exception:
            continue

    all_events.sort(key=lambda e: e["time"])

    if all_events:
        _cache[cache_key] = all_events

    return all_events


def invalidate_cache():
    """Clear the tide data cache."""
    _cache.clear()


def interpolate_height(target_time, events):
    """
    Linearly interpolate tide height at target_time from a list of HW/LW events.
    """
    if not events:
        return None

    if isinstance(target_time, str):
        target_time = datetime.fromisoformat(target_time)

    # Find surrounding events
    before = None
    after = None
    for i, ev in enumerate(events):
        if ev["time"] <= target_time:
            before = ev
        if ev["time"] >= target_time and after is None:
            after = ev

    if before and after and before["time"] == after["time"]:
        return before["height"]

    if before is None and after is not None:
        return after["height"]
    if before is not None and after is None:
        return before["height"]

    if before is None or after is None:
        return None

    total_seconds = (after["time"] - before["time"]).total_seconds()
    elapsed_seconds = (target_time - before["time"]).total_seconds()

    if total_seconds == 0:
        return before["height"]

    fraction = elapsed_seconds / total_seconds
    height = before["height"] + fraction * (after["height"] - before["height"])
    return round(height, 2)


def get_tide_events(target_date):
    """
    Return the raw HW/LW events for a date, with formatted times.
    Returns list of {time: str, height: float, type: "HW"|"LW", label: str}
    """
    events = fetch_tides(target_date)
    result = []
    for ev in events:
        label = "HWP" if ev["type"] == "HW" else "LWP"
        result.append({
            "time": ev["time"].strftime("%H:%M"),
            "datetime": ev["time"].isoformat(),
            "height": ev["height"],
            "type": ev["type"],
            "label": label,
        })
    return result


def get_tide_info(start_time, end_time):
    """
    Get interpolated tide info for a journey window.
    Returns dict with start/end heights, direction, flow rate, and next HWP/LWP.
    """
    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time)
    if isinstance(end_time, str):
        end_time = datetime.fromisoformat(end_time)

    events = fetch_tides(start_time)

    start_height = interpolate_height(start_time, events)
    end_height = interpolate_height(end_time, events)

    if start_height is None or end_height is None:
        return {
            "start_height": start_height,
            "end_height": end_height,
            "tide_direction": "rising",
            "flow_rate": 0.0,
            "next_hwp": None,
            "next_lwp": None,
            "tide_range": 0.0,
        }

    tide_direction = "rising" if end_height > start_height else "falling"
    duration_hours = max((end_time - start_time).total_seconds() / 3600, 0.01)
    flow_rate = abs(end_height - start_height) / duration_hours

    # Find next HWP and LWP after start_time
    next_hwp = None
    next_lwp = None
    for ev in events:
        if ev["time"] >= start_time:
            if ev["type"] == "HW" and next_hwp is None:
                next_hwp = ev
            elif ev["type"] == "LW" and next_lwp is None:
                next_lwp = ev

    # Calculate tidal range from nearby events
    nearby_heights = [ev["height"] for ev in events
                      if abs((ev["time"] - start_time).total_seconds()) < 12 * 3600]
    tide_range = (max(nearby_heights) - min(nearby_heights)) if len(nearby_heights) >= 2 else 0.0

    return {
        "start_height": start_height,
        "end_height": end_height,
        "tide_direction": tide_direction,
        "flow_rate": round(flow_rate, 2),
        "next_hwp": {"time": next_hwp["time"].strftime("%H:%M"), "height": next_hwp["height"]} if next_hwp else None,
        "next_lwp": {"time": next_lwp["time"].strftime("%H:%M"), "height": next_lwp["height"]} if next_lwp else None,
        "tide_range": round(tide_range, 2),
    }


def interpolate_hourly(start_time, duration_hours):
    """
    Return a list of {time, height} dicts for every hour in the window.
    Used for tide chart rendering.
    """
    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time)

    events = fetch_tides(start_time)
    points = []
    for i in range(int(duration_hours) + 1):
        t = start_time + timedelta(hours=i)
        h = interpolate_height(t, events)
        if h is not None:
            points.append({"time": t.isoformat(), "height": h})
    return points
