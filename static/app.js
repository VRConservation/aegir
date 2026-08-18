/* Kayak Journey Planner - Wizard Logic */

// --- State ---
const state = {
    step: 1,
    date: null,
    time: '08:00',
    duration: 3,
    springPercentage: null,
    start: { lat: null, lon: null, name: '' },
    end: { lat: null, lon: null, name: '' },
    journeyData: null,
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
    document.getElementById('journey-duration').addEventListener('input', function () {
        state.duration = parseFloat(this.value);
        document.getElementById('duration-display').textContent = this.value;
    });
    document.getElementById('spring-percentage').addEventListener('change', function () {
        state.springPercentage = this.value ? parseFloat(this.value) : null;
    });

    setupSearch('start');
    setupSearch('end');
});

// --- Wizard Navigation ---
function goToStep(n) {
    if (n === 3 && (!state.start.lat || !state.end.lat)) {
        alert('Please set both start and end locations');
        return;
    }

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

    // Update picker map marker
    if (pickerMap) {
        const marker = which === 'start' ? pickerStartMarker : pickerEndMarker;
        if (marker) marker.remove();
        const icon = which === 'start' ? pickerStartIcon : pickerEndIcon;
        const m = L.marker([lat, lon], { icon }).addTo(pickerMap);
        if (which === 'start') pickerStartMarker = m;
        else pickerEndMarker = m;
        pickerMap.setView([lat, lon], 13);
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
    pickerMap = L.map('location-picker-map').setView([50.85, -1.35], 11);
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
                duration_hours: state.duration,
                spring_percentage: state.springPercentage,
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

    // Weather card
    const weatherEl = document.getElementById('weather-info');
    if (w) {
        const precip = w.precipitation_probability != null ? w.precipitation_probability : '-';
        const wind = w.wind_speed != null ? `${w.wind_speed} km/h` : '-';
        const windDir = w.wind_direction || '-';
        const temp = w.temperature != null ? `${w.temperature}` : '-';
        const desc = w.weather_description || '-';

        weatherEl.innerHTML = `
            <div class="big-value">${temp}&deg;C</div>
            <div class="detail">${desc}</div>
            <div class="detail">Wind: ${wind} ${windDir}</div>
            <div class="detail">Rain chance: ${precip}%</div>
        `;
    } else {
        weatherEl.innerHTML = '<div class="detail">Weather data unavailable</div>';
    }

    // Tides card
    const tideEl = document.getElementById('tide-info');
    const tideDir = t.tide_direction === 'rising' ? '&#9650; Rising' : '&#9660; Falling';
    const tideColor = t.tide_direction === 'rising' ? 'var(--success)' : 'var(--warning)';
    tideEl.innerHTML = `
        <div class="big-value" style="color: ${tideColor}">${tideDir}</div>
        <div class="detail">Start: ${t.start_height}m &rarr; End: ${t.end_height}m</div>
        <div class="detail">Spring/Neap: ${t.spring_percentage}%</div>
        <div class="detail">Flow rate: ~${t.flow_rate} m/hr</div>
    `;

    // Summary card
    const summaryEl = document.getElementById('journey-summary');
    const goNoGo = assessConditions(w, t);

    summaryEl.innerHTML = `
        <div class="summary-row">
            <span class="label">Distance</span>
            <span>${j.distance_km} km (${j.distance_nm} nm)</span>
        </div>
        <div class="summary-row">
            <span class="label">Duration</span>
            <span>${j.duration_hours} hours</span>
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

    // Fetch tide chart
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

    if (issues === 0) return { label: 'GO', color: 'success' };
    if (issues <= 2) return { label: 'CAUTION', color: 'warning' };
    return { label: 'NO GO', color: 'danger' };
}

async function fetchTideChart() {
    const startDateTime = `${state.date}T${state.time}:00`;

    try {
        const resp = await fetch('/api/tides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                station: 'Southampton',
                start_time: startDateTime,
                duration_hours: Math.max(state.duration, 12),
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

function initMainMap() {
    if (mainMap) {
        mainMap.invalidateSize();
        return;
    }

    mainMap = L.map('main-map').setView([50.85, -1.35], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 18
    }).addTo(mainMap);

    // Add markers
    mainStartMarker = L.marker([state.start.lat, state.start.lon], { icon: mainStartIcon })
        .addTo(mainMap)
        .bindPopup(`<b>Start:</b> ${state.start.name}`);
    mainEndMarker = L.marker([state.end.lat, state.end.lon], { icon: mainEndIcon })
        .addTo(mainMap)
        .bindPopup(`<b>End:</b> ${state.end.name}`);

    // Route line
    mainRouteLine = L.polyline([
        [state.start.lat, state.start.lon],
        [state.end.lat, state.end.lon],
    ], { color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '8, 8' }).addTo(mainMap);

    // Fit bounds
    const bounds = L.latLngBounds([
        [state.start.lat, state.start.lon],
        [state.end.lat, state.end.lon],
    ]);
    mainMap.fitBounds(bounds, { padding: [40, 40] });

    setTimeout(() => mainMap.invalidateSize(), 100);
}

// --- Utilities ---
function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
    });
}
