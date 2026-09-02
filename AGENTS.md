# AGENTS.md

Aegir — kayak journey planner. Flask backend (`app.py`) + tide scraper (`tide_data.py`), vanilla JS frontend (`templates/index.html`, `static/app.js`). No build step or bundler.

## Commands

```bash
python app.py        # dev server at http://localhost:8081 (README's 5080 is stale)
pytest -q            # 14 tests, fast, fully offline
bump2version patch   # bumps __version__ in app.py, commits, tags v{new_version}
```

- Pushing a `v*` tag triggers the GitHub Release workflow (.github/workflows/release.yml). Bump versions only via bump2version (config in .bumpversion.cfg).
- CI runs pytest on Python 3.11 plus flake8 `--max-line-length=120` (non-blocking, `|| true`). No lint config file exists.
- Deployment is Cloudflare Workers → container: `src/index.ts` proxies every request to the gunicorn/Docker app (port 8081, `wrangler.toml`). Wrangler is irrelevant to local dev.

## Architecture notes

- **Tide data is scraped per-date** from tidetimes.org.uk (`tide_data.fetch_tides`) and cached in-process (`tide_data._cache`). Weather/geocoding come from Open-Meteo/Nominatim. All external calls fail soft (return None/[]).
- **Test seam**: tests mock `tide_data.fetch_tides` to inject HW/LW events. Keep network calls behind that function (or mockable equivalents) so tests stay offline.
- All datetimes are naive UK local (BST) strings; tide times are parsed as-is from the site. Don't introduce timezone conversion casually.
- Frontend wizard has 4 steps (When → Where → Conditions → Map). Markup lives in `templates/index.html` (`#step-1`…`#step-4` panels); logic/state in `static/app.js` (`state`, `goToStep`). Step gating: step 3 requires start+end locations, step 4 requires `state.journeyData`.
- Waypoints exist only on the step-4 map today; `goToStep` calls `resetMainMap()` when leaving step 4, which **wipes `state.waypoints`** — relevant if moving waypoint handling earlier in the flow.
- Tide chart (step 3) is Chart.js fed by POST `/api/tides` with `duration_hours: 24`; x labels are built as `${d.getHours()}:00` (unpadded) in `fetchTideChart()`.
- `.env.example` lists `DATABASE_URL`/`launch_spots.db` but no DB code exists — ignore it.
- Export (BBCode/PDF) templates in `static/app.js` contain hardcoded personal details (leader name, phone number).

## Current focus (user-requested, not yet implemented)

1. Step 4 Map: show date right-justified on the same line as "Your Journey" heading (`.map-top-row` in index.html).
2. Step 3 Conditions: add times to the tide chart graph (`fetchTideChart()` in app.js; HW/LW event times are already in the `/api/tides` response).
3. Step 2 Where: add intermediate stops and ability to alter the route line there (picker map `initPickerMap()`; see waypoint-wipe gotcha above).
