/* Aegir - Kayak Journey Planner */

// --- State ---
const state = {
    step: 1,
    date: null,
    time: '08:00',
    springPercentage: null,
    start: { lat: null, lon: null, name: '' },
    end: { lat: null, lon: null, name: '' },
    journeyData: null,
    waypoints: [],  // [{lat, lon, marker}]
};

let pickerMap = null;
let mainMap = null;
let pickerStartMarker = null;
let pickerEndMarker = null;
let mainStartMarker = null;
let mainEndMarker = null;
let mainRouteLine = null;
let tideChart = null;
let searchTimeout = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', function () {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('journey-date').value = today;
    state.date = today;

    document.getElementById('journey-date').addEventListener('change', function () {
        state.date = this.value;
    });
    document.getElementById('journey-time').addEventListener('change', function () {
        state.time = this.value;
    });
    document.getElementById('spring-percentage').addEventListener('change', function () {
        state.springPercentage = this.value ? parseFloat(this.value) : null;
    });

    setupSearch('start');
    setupSearch('end');

    document.querySelectorAll('.step').forEach(step => {
        step.style.cursor = 'pointer';
        step.addEventListener('click', function () {
            const n = parseInt(this.dataset.step);
            goToStep(n);
        });
    });
});

// --- Wizard Navigation ---
function goToStep(n) {
    if (n === 3 && (!state.start.lat || !state.end.lat)) {
        alert('Please set both start and end locations');
        return;
    }
    if (n === 4 && !state.journeyData) {
        alert('Please fetch conditions first');
        return;
    }

    if (state.step === 4 && n < 4) resetMainMap();

    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

    document.getElementById(`step-${n}`).classList.add('active');

    const steps = document.querySelectorAll('.step');
    steps.forEach((s, i) => {
        if (i + 1 < n) s.classList.add('completed');
        else s.classList.remove('completed');
        if (i + 1 === n) s.classList.add('active');
    });

    state.step = n;

    if (n === 2) initPickerMap();
    if (n === 3) fetchConditions();
    if (n === 4) initMainMap();
}

// --- Location Search (Nominatim) ---
function setupSearch(which) {
    const input = document.getElementById(`${which}-search`);
    const results = document.getElementById(`${which}-search-results`);

    input.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        const q = this.value.trim();
        if (q.length < 3) {
            results.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => searchLocation(which, q), 350);
    });

    input.addEventListener('focus', function () {
        if (results.children.length > 0) results.classList.remove('hidden');
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-row')) results.classList.add('hidden');
    });
}

async function searchLocation(which, query) {
    const results = document.getElementById(`${which}-search-results`);
    try {
        const resp = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        const data = await resp.json();
        if (data.error) {
            results.innerHTML = '<div class="search-result-item">No results found</div>';
        } else {
            results.innerHTML = data.map(r =>
                `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.short_name}">${r.name}</div>`
            ).join('');
            results.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', function () {
                    const lat = parseFloat(this.dataset.lat);
                    const lon = parseFloat(this.dataset.lon);
                    const name = this.dataset.name;
                    selectLocation(which, lat, lon, name);
                    results.classList.add('hidden');
                    document.getElementById(`${which}-search`).value = name;
                });
            });
        }
        results.classList.remove('hidden');
    } catch (e) {
        console.error('Geocode error:', e);
    }
}

function selectLocation(which, lat, lon, name) {
    state[which] = { lat, lon, name };
    document.getElementById(`${which}-coord`).textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    if (pickerMap) {
        const marker = which === 'start' ? pickerStartMarker : pickerEndMarker;
        if (marker) marker.remove();
        const icon = which === 'start' ? pickerStartIcon : pickerEndIcon;
        const m = L.marker([lat, lon], { icon }).addTo(pickerMap);
        if (which === 'start') pickerStartMarker = m;
        else pickerEndMarker = m;
    }
}

// --- Picker Map (Step 2) ---
const pickerStartIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const pickerEndIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

function initPickerMap() {
    if (pickerMap) return;
    pickerMap = L.map('location-picker-map').setView([50.7578, -1.5433], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 18
    }).addTo(pickerMap);

    pickerMap.on('click', function (e) {
        const { lat, lng } = e.latlng;
        if (!state.start.lat) {
            selectLocation('start', lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            document.getElementById('start-search').value = '';
        } else if (!state.end.lat) {
            selectLocation('end', lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            document.getElementById('end-search').value = '';
        }
    });

    setTimeout(() => pickerMap.invalidateSize(), 100);
}

// --- Fetch Conditions (Step 3) ---
async function fetchConditions() {
    const loading = document.getElementById('conditions-loading');
    const content = document.getElementById('conditions-content');
    const errorEl = document.getElementById('conditions-error');

    loading.classList.remove('hidden');
    content.classList.add('hidden');
    errorEl.classList.add('hidden');

    const startDateTime = `${state.date}T${state.time}:00`;

    try {
        const resp = await fetch('/api/journey-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_location: { lat: state.start.lat, lon: state.start.lon },
                end_location: { lat: state.end.lat, lon: state.end.lon },
                start_time: startDateTime,
                waypoints: state.waypoints.map(wp => ({ lat: wp.lat, lon: wp.lon })),
            }),
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Failed to plan journey');
        }

        state.journeyData = await resp.json();
        renderConditions(state.journeyData);
        loading.classList.add('hidden');
        content.classList.remove('hidden');
    } catch (e) {
        loading.classList.add('hidden');
        errorEl.textContent = e.message;
        errorEl.classList.remove('hidden');
    }
}

function renderConditions(data) {
    const j = data.journey;
    const t = data.tides;
    const w = data.weather;

    // Update trip conditions title with date
    const dateParts = state.date.split('-');
    const dateFormatted = `${dateParts[2]}-${dateParts[1]}-${dateParts[0].slice(2)}`;
    const conditionsTitle = document.querySelector('#step-3 h2');
    if (conditionsTitle) conditionsTitle.textContent = `Trip Conditions (${dateFormatted})`;

    const weatherEl = document.getElementById('weather-info');
    if (w) {
        const precip = w.precipitation_probability != null ? w.precipitation_probability : '-';
        const windDir = w.wind_direction || '-';
        const wind = w.wind_speed != null ? `${w.wind_speed} km/h` : '-';
        const temp = w.temperature != null ? `${w.temperature}` : '-';
        const desc = w.weather_description || '-';

        weatherEl.innerHTML = `
            <div class="big-value">${temp}&deg;C</div>
            <div class="detail">${desc}</div>
            <div class="detail">Wind: ${windDir} ${wind}</div>
            <div class="detail">Rain chance: ${precip}%</div>
        `;
    } else {
        weatherEl.innerHTML = '<div class="detail">Weather data unavailable</div>';
    }

    const tideEl = document.getElementById('tide-info');
    const tideDir = t.tide_direction === 'rising' ? '&#9650; Rising' : '&#9660; Falling';
    const tideColor = t.tide_direction === 'rising' ? 'var(--success)' : 'var(--warning)';
    const nextHwp = t.next_hwp ? `Next HWP: ${t.next_hwp.time} (${t.next_hwp.height}m)` : '';
    const nextLwp = t.next_lwp ? `Next LWP: ${t.next_lwp.time} (${t.next_lwp.height}m)` : '';
    tideEl.innerHTML = `
        <div class="big-value" style="color: ${tideColor}">${tideDir}</div>
        <div class="detail">Start: ${t.start_height}m &rarr; End: ${t.end_height}m</div>
        <div class="detail">${nextHwp}${nextHwp && nextLwp ? ' &middot; ' : ''}${nextLwp}</div>
        <div class="detail">Tide range: ${t.tide_range}m (${t.spring_label})</div>
        <div class="detail">Flow rate: ~${t.flow_rate} m/hr</div>
    `;

    const summaryEl = document.getElementById('journey-summary');
    const goNoGo = assessConditions(w, t);

    summaryEl.innerHTML = `
        <div class="summary-row">
            <span class="label">Distance</span>
            <span>${j.distance_km} km (${j.distance_nm} nm)</span>
        </div>
        <div class="summary-row">
            <span class="label">Duration</span>
            <span>${j.duration_hours} hours <small>(estimated)</small></span>
        </div>
        <div class="summary-row">
            <span class="label">Depart</span>
            <span>${formatDateTime(j.start_time)}</span>
        </div>
        <div class="summary-row">
            <span class="label">Arrive</span>
            <span>${formatDateTime(j.end_time)}</span>
        </div>
        <div class="summary-row">
            <span class="label">Conditions</span>
            <span class="traffic-label" style="color: var(--${goNoGo.color})">${goNoGo.label}</span>
        </div>
    `;

    fetchTideChart();
}

function assessConditions(weather, tides) {
    let issues = 0;

    if (weather) {
        if (weather.wind_speed > 30) issues += 2;
        else if (weather.wind_speed > 20) issues += 1;

        if (weather.precipitation_probability > 70) issues += 1;
        if (weather.precipitation > 5) issues += 1;
    }

    if (tides.flow_rate > 2) issues += 2;
    else if (tides.flow_rate > 1) issues += 1;

    if (issues === 0) return { label: 'NOTE', color: 'success' };
    if (issues <= 2) return { label: 'NOTE', color: 'warning' };
    return { label: 'NO GO', color: 'danger' };
}

async function fetchTideChart() {
    const startDateTime = `${state.date}T${state.time}:00`;

    try {
        const resp = await fetch('/api/tides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                station: 'Portsmouth',
                start_time: startDateTime,
                duration_hours: 24,
            }),
        });
        const data = await resp.json();

        const ctx = document.getElementById('tide-chart').getContext('2d');
        if (tideChart) tideChart.destroy();

        tideChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.tides.map(t => {
                    const d = new Date(t.time);
                    return `${d.getHours()}:00`;
                }),
                datasets: [{
                    label: 'Tide Height (m)',
                    data: data.tides.map(t => t.height),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: {
                            maxTicksLimit: 12,
                            callback: function(val, index) {
                                const label = this.getLabelForValue(val);
                                const hour = parseInt(label);
                                return hour % 3 === 0 ? label : '';
                            }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Height (m)' },
                    },
                },
            },
        });
    } catch (e) {
        console.error('Tide chart error:', e);
    }
}

function resetMainMap() {
    if (mainMap) {
        mainMap.remove();
        mainMap = null;
    }
    mainStartMarker = null;
    mainEndMarker = null;
    mainRouteLine = null;
    state.waypoints = [];
}

// --- Main Map (Step 4) ---
const mainStartIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const mainEndIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const waypointIcon = L.divIcon({
    className: 'waypoint-marker',
    html: '<div style="width:12px;height:12px;background:#2563eb;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

function initMainMap() {
    if (mainMap) {
        mainMap.invalidateSize();
        renderMapSummary();
        return;
    }

    mainMap = L.map('main-map', { preferCanvas: true }).setView([50.85, -1.35], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 18
    }).addTo(mainMap);

    // Click to add waypoint
    mainMap.on('click', function (e) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Add start/end markers
    mainStartMarker = L.marker([state.start.lat, state.start.lon], { icon: mainStartIcon, draggable: true })
        .addTo(mainMap)
        .bindPopup(`<b>Start:</b> ${state.start.name}`);
    mainStartMarker.on('dragend', function (e) {
        const pos = e.target.getLatLng();
        state.start.lat = pos.lat;
        state.start.lon = pos.lng;
        drawRoute();
        renderMapSummary();
    });

    mainEndMarker = L.marker([state.end.lat, state.end.lon], { icon: mainEndIcon, draggable: true })
        .addTo(mainMap)
        .bindPopup(`<b>End:</b> ${state.end.name}`);
    mainEndMarker.on('dragend', function (e) {
        const pos = e.target.getLatLng();
        state.end.lat = pos.lat;
        state.end.lon = pos.lng;
        drawRoute();
        renderMapSummary();
    });

    drawRoute();
    fitMapBounds();
    renderMapSummary();

    setTimeout(() => mainMap.invalidateSize(), 300);
}

function addWaypoint(lat, lon) {
    const marker = L.marker([lat, lon], { icon: waypointIcon, draggable: true })
        .addTo(mainMap)
        .bindPopup(`Waypoint<br><small>Drag to move &middot; Right-click to remove</small>`);

    marker.on('contextmenu', function () {
        removeWaypoint(marker);
    });

    marker.on('dragend', function (e) {
        const pos = e.target.getLatLng();
        const wp = state.waypoints.find(w => w.marker === marker);
        if (wp) { wp.lat = pos.lat; wp.lon = pos.lng; }
        drawRoute();
        renderMapSummary();
    });

    state.waypoints.push({ lat, lon, marker });
    drawRoute();
    renderMapSummary();
}

function removeWaypoint(marker) {
    state.waypoints = state.waypoints.filter(wp => {
        if (wp.marker === marker) {
            mainMap.removeLayer(marker);
            return false;
        }
        return true;
    });
    drawRoute();
    renderMapSummary();
}

function drawRoute() {
    if (mainRouteLine) {
        mainMap.removeLayer(mainRouteLine);
    }

    const points = [
        [state.start.lat, state.start.lon],
        ...state.waypoints.map(wp => [wp.lat, wp.lon]),
        [state.end.lat, state.end.lon],
    ];

    mainRouteLine = L.polyline(points, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.7,
        dashArray: '8, 8',
    }).addTo(mainMap);
}

function fitMapBounds() {
    const allPoints = [
        [state.start.lat, state.start.lon],
        ...state.waypoints.map(wp => [wp.lat, wp.lon]),
        [state.end.lat, state.end.lon],
    ];
    const bounds = L.latLngBounds(allPoints);
    mainMap.fitBounds(bounds, { padding: [40, 40] });
}

// --- Route distance along waypoints ---
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalRouteDistance() {
    const allPoints = [
        { lat: state.start.lat, lon: state.start.lon },
        ...state.waypoints,
        { lat: state.end.lat, lon: state.end.lon },
    ];
    let dist = 0;
    for (let i = 1; i < allPoints.length; i++) {
        dist += haversine(allPoints[i - 1].lat, allPoints[i - 1].lon, allPoints[i].lat, allPoints[i].lon);
    }
    return dist;
}

// --- Map sidebar summary ---
function renderMapSummary() {
    if (!state.journeyData) return;
    const j = state.journeyData.journey;
    const t = state.journeyData.tides;
    const w = state.journeyData.weather;

    // Weather
    const weatherEl = document.getElementById('map-weather-summary');
    if (w) {
        weatherEl.innerHTML = `
            <h4>Weather</h4>
            <div class="map-summary-row"><span>${w.weather_description || '-'}</span><span>${w.temperature != null ? Math.round(w.temperature) + '\u00B0C' : '-'}</span></div>
            <div class="map-summary-row"><span>Wind</span><span>${w.wind_speed != null ? (w.wind_direction || '') + ' ' + Math.round(w.wind_speed) + ' km/h' : '-'}</span></div>
            <div class="map-summary-row"><span>Rain</span><span>${w.precipitation_probability != null ? w.precipitation_probability + '%' : '-'}</span></div>
        `;
    } else {
        weatherEl.innerHTML = '<h4>Weather</h4><div class="map-summary-row"><span>Unavailable</span></div>';
    }

    // Tides
    const tideEl = document.getElementById('map-tide-summary');
    const tideDir = t.tide_direction === 'rising' ? '\u25B2 Rising' : '\u25BC Falling';
    const nextHwp = t.next_hwp ? `HWP: ${t.next_hwp.time} (${t.next_hwp.height}m)` : '';
    const nextLwp = t.next_lwp ? `LWP: ${t.next_lwp.time} (${t.next_lwp.height}m)` : '';
    tideEl.innerHTML = `
        <h4>Tides</h4>
        <div class="map-summary-row"><span>Direction</span><span>${tideDir}</span></div>
        <div class="map-summary-row"><span>Height</span><span>${t.start_height}m \u2192 ${t.end_height}m</span></div>
        <div class="map-summary-row"><span>Flow</span><span>~${t.flow_rate} m/hr</span></div>
        <div class="map-summary-row"><span>${nextHwp}</span></div>
        <div class="map-summary-row"><span>${nextLwp}</span></div>
        <div class="map-summary-row"><span>Range</span><span>${t.tide_range}m (${t.spring_label})</span></div>
    `;

    // Route
    const routeDist = totalRouteDistance();
    const routeNm = (routeDist * 0.539957).toFixed(1);
    const routeEl = document.getElementById('map-route-summary');
    const wpCount = state.waypoints.length;
    const kayakSpeed = 6.0;
    const currentKmh = t.flow_rate * 0.8;
    const effectiveSpeed = t.tide_direction === 'rising'
        ? kayakSpeed + currentKmh * 0.5
        : Math.max(kayakSpeed - currentKmh * 0.5, 2.0);
    const estDuration = routeDist / effectiveSpeed;
    routeEl.innerHTML = `
        <h4>Route</h4>
        <div class="map-summary-row"><span>Distance</span><span>${routeDist.toFixed(1)} km (${routeNm} nm)</span></div>
        <div class="map-summary-row"><span>Est. duration</span><span>${estDuration.toFixed(1)} hrs</span></div>
        <div class="map-summary-row"><span>Waypoints</span><span>${wpCount}</span></div>
        <div class="map-summary-row"><span>Avg speed</span><span>${effectiveSpeed.toFixed(1)} km/h</span></div>
    `;

    // Tide advice
    const adviceEl = document.getElementById('map-tide-advice');
    const goNoGo = assessConditions(w, t);
    let advice = '';
    if (t.tide_direction === 'falling') {
        advice = 'Tide is falling throughout your trip. Expect shallower water and potentially stronger outgoing currents near harbour entrances.';
    } else {
        advice = 'Tide is rising throughout your trip. Water levels will increase, which can help with clearance over shallow areas.';
    }
    if (t.flow_rate > 2) {
        advice += ' Strong tidal flow expected \u2014 plan to stay close to shore where possible.';
    } else if (t.flow_rate > 1) {
        advice += ' Moderate tidal flow \u2014 be aware of currents, especially near headlands and channels.';
    }
    adviceEl.className = `map-summary-card advice-card ${goNoGo.color === 'warning' ? 'caution' : goNoGo.color === 'danger' ? 'danger' : ''}`;
    adviceEl.innerHTML = `
        <h4>${goNoGo.label}</h4>
        <div class="advice-text">${advice}</div>
    `;
}

// --- Utilities ---
function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
    });
}

// --- Export ---
let currentExportTab = 'bbcode';

function exportTrip() {
    if (!state.journeyData) return;
    const bbcode = generateBBCode();
    document.getElementById('export-bbcode-text').value = bbcode;
    document.getElementById('export-modal').classList.remove('hidden');
}

function closeExport() {
    document.getElementById('export-modal').classList.add('hidden');
}

function switchExportTab(tab, btn) {
    currentExportTab = tab;
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('export-bbcode').classList.toggle('hidden', tab !== 'bbcode');
}

function copyExport() {
    const textarea = document.getElementById(`export-${currentExportTab}-text`);
    navigator.clipboard.writeText(textarea.value);
}

function tripData() {
    const j = state.journeyData.journey;
    const t = state.journeyData.tides;
    const w = state.journeyData.weather;
    const date = new Date(state.date + 'T00:00:00');
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const startStr = formatDateTime(j.start_time).split(',').slice(1).join(',').trim();
    const endStr = formatDateTime(j.end_time).split(',').slice(1).join(',').trim();
    const wind = w ? `${w.wind_speed} km/h ${w.wind_direction || ''}`.trim() : '-';
    const temp = w ? `${Math.round(w.temperature)}\u00B0C` : '-';
    const precip = w && w.precipitation_probability != null ? `${w.precipitation_probability}%` : '-';
    const tideDir = t.tide_direction === 'rising' ? 'Rising' : 'Falling';
    const nextHwp = t.next_hwp ? `${t.next_hwp.time} (${t.next_hwp.height}m)` : '-';
    const nextLwp = t.next_lwp ? `${t.next_lwp.time} (${t.next_lwp.height}m)` : '-';
    const routeDist = totalRouteDistance();
    const routeNm = (routeDist * 0.539957).toFixed(1);

    return {
        dateStr, startStr, endStr, wind, temp, precip,
        tideDir, tideStart: t.start_height, tideEnd: t.end_height,
        nextHwp, nextLwp, springLabel: t.spring_label,
        tideRange: t.tide_range, flowRate: t.flow_rate,
        distKm: routeDist.toFixed(1), distNm: routeNm,
        startName: state.start.name, endName: state.end.name,
    };
}

function generateBBCode() {
    const d = tripData();
    return `[b]SUMMARY[/b]

[b]PLAN[/b]
Trip: ${d.dateStr} ${d.startName} to ${d.endName} (${d.distKm} km / ${d.distNm} nm)
Briefing:
On the water: ${d.startStr} - ${d.endStr}
Lunch:
Off the water:
Leader: Vance Russell
Co-leader:
Group size:

[b]CONDITIONS[/b]
Hi/lo: ${d.tideStart}m \u2192 ${d.tideEnd}m (${d.tideDir})
Wind: ${d.wind}
Water temp: ${d.temp} (rain chance: ${d.precip})
HWP: ${d.nextHwp}
LWP: ${d.nextLwp}
${d.springLabel}: tide range ${d.tideRange}m (${d.flowRate} m/hr)

[b]EQUIPMENT[/b]
Dress for immersion, helmets, and towline required.

[b]CONTACTS[/b]
Shore contact:
My contact: 07725 467072

[i]By signing up for this trip here, you should have read, understood and consented to the club trip check list and risk assessment.  Happy to have a chat if you have any queries.[/i]`;
}

function exportPDF() {
    const d = tripData();

    function buildHTML(mapDataUrl) {
        return `<!DOCTYPE html>
<html><head><title>Trip ${d.dateStr}</title>
<style>
  body { font-family: sans-serif; max-width: 700px; margin: 2rem auto; color: #111; line-height: 1.5; }
  h2 { font-size: 1.1rem; text-transform: uppercase; border-bottom: 2px solid #111; padding-bottom: 0.25rem; margin-top: 1.5rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  td { padding: 0.2rem 0.5rem; vertical-align: top; }
  td:first-child { font-weight: bold; white-space: nowrap; width: 140px; }
  .disclaimer { font-style: italic; font-size: 0.85rem; color: #555; margin-top: 1.5rem; border-top: 1px solid #ccc; padding-top: 0.75rem; }
  .map-img { width: 100%; border: 1px solid #ccc; border-radius: 4px; margin: 0.5rem 0; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Aegir Kayak Trip</h1>
<p>${d.dateStr}</p>

<h2>Route Map</h2>
<img class="map-img" src="${mapDataUrl}" alt="Route map">

<h2>Plan</h2>
<table>
<tr><td>Trip:</td><td>${d.startName} to ${d.endName} (${d.distKm} km / ${d.distNm} nm)</td></tr>
<tr><td>Briefing:</td><td></td></tr>
<tr><td>On the water:</td><td>${d.startStr} - ${d.endStr}</td></tr>
<tr><td>Lunch:</td><td></td></tr>
<tr><td>Off the water:</td><td></td></tr>
<tr><td>Leader:</td><td>Vance Russell</td></tr>
<tr><td>Co-leader:</td><td></td></tr>
<tr><td>Group size:</td><td></td></tr>
</table>

<h2>Conditions</h2>
<table>
<tr><td>Hi/lo:</td><td>${d.tideStart}m &rarr; ${d.tideEnd}m (${d.tideDir})</td></tr>
<tr><td>Wind:</td><td>${d.wind}</td></tr>
<tr><td>Water temp:</td><td>${d.temp} (rain chance: ${d.precip})</td></tr>
<tr><td>HWP:</td><td>${d.nextHwp}</td></tr>
<tr><td>LWP:</td><td>${d.nextLwp}</td></tr>
<tr><td>${d.springLabel}:</td><td>tide range ${d.tideRange}m (${d.flowRate} m/hr)</td></tr>
</table>

<h2>Equipment</h2>
<p>Dress for immersion, helmets, and towline required.</p>

<h2>Contacts</h2>
<table>
<tr><td>Shore contact:</td><td></td></tr>
<tr><td>My contact:</td><td>07725 467072</td></tr>
</table>

<p class="disclaimer">By signing up for this trip here, you should have read, understood and consented to the club trip check list and risk assessment. Happy to have a chat if you have any queries.</p>
</body></html>`;
    }

    function loadHtml2canvas() {
        return new Promise((resolve, reject) => {
            if (window.html2canvas) { resolve(window.html2canvas); return; }
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = () => resolve(window.html2canvas);
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    loadHtml2canvas().then(h2c => {
        mainMap.invalidateSize();
        setTimeout(() => {
            h2c(mainMap.getContainer(), { useCORS: true, scale: 2 }).then(canvas => {
                const dataUrl = canvas.toDataURL('image/png');
                const win = window.open('', '_blank');
                win.document.write(buildHTML(dataUrl));
                win.document.close();
                win.print();
            });
        }, 300);
    });
}
