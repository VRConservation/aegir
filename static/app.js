// Initialize map centered on UK (Solent area)
const map = L.map('map').setView([50.85, -1.35], 11);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
}).addTo(map);

// State management
let startMarker = null;
let endMarker = null;
let routeLine = null;
let launchSpots = [];
let tideChart = null;

// Custom icons
const startIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const endIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const launchIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Initialize datetime input with current time
function initializeDateTime() {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    document.getElementById('start-time').value = localDateTime;
}

// Load launch spots
async function loadLaunchSpots() {
    try {
        const response = await fetch('/api/launch-spots');
        launchSpots = await response.json();
        
        // Add markers to map
        launchSpots.forEach(spot => {
            const marker = L.marker([spot.lat, spot.lon], { icon: launchIcon })
                .addTo(map)
                .bindPopup(`
                    <div class="popup-content">
                        <h3>${spot.name}</h3>
                        <p>${spot.description}</p>
                        <p><strong>Facilities:</strong> ${spot.facilities.join(', ')}</p>
                        <button onclick="setStartFromSpot(${spot.lat}, ${spot.lon}, '${spot.name}')">Set as Start</button>
                        <button onclick="setEndFromSpot(${spot.lat}, ${spot.lon}, '${spot.name}')">Set as End</button>
                    </div>
                `);
        });
        
        // Display in sidebar
        displayLaunchSpots();
    } catch (error) {
        console.error('Error loading launch spots:', error);
    }
}

// Display launch spots in sidebar
function displayLaunchSpots() {
    const container = document.getElementById('launch-spots-list');
    container.innerHTML = launchSpots.map(spot => `
        <div class="launch-spot-item" onclick="map.setView([${spot.lat}, ${spot.lon}], 14)">
            <h4>${spot.name}</h4>
            <p>${spot.description}</p>
            <div>
                ${spot.facilities.map(f => `<span class="facility-tag">${f}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

// Set start location from launch spot
function setStartFromSpot(lat, lon, name) {
    setStartLocation(lat, lon);
    document.getElementById('start-location').value = name;
}

// Set end location from launch spot
function setEndFromSpot(lat, lon, name) {
    setEndLocation(lat, lon);
    document.getElementById('end-location').value = name;
}

// Map click handler
map.on('click', function(e) {
    const { lat, lng } = e.latlng;
    
    if (!startMarker) {
        setStartLocation(lat, lng);
    } else if (!endMarker) {
        setEndLocation(lat, lng);
    }
});

// Set start location
function setStartLocation(lat, lon) {
    if (startMarker) {
        map.removeLayer(startMarker);
    }
    
    startMarker = L.marker([lat, lon], { icon: startIcon })
        .addTo(map)
        .bindPopup('Start Location')
        .openPopup();
    
    document.getElementById('start-location').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

// Set end location
function setEndLocation(lat, lon) {
    if (endMarker) {
        map.removeLayer(endMarker);
    }
    
    endMarker = L.marker([lat, lon], { icon: endIcon })
        .addTo(map)
        .bindPopup('End Location')
        .openPopup();
    
    document.getElementById('end-location').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    
    // Draw route line
    if (startMarker && endMarker) {
        if (routeLine) {
            map.removeLayer(routeLine);
        }
        
        routeLine = L.polyline([
            startMarker.getLatLng(),
            endMarker.getLatLng()
        ], {
            color: '#667eea',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(map);
    }
}

// Use current location
document.getElementById('use-my-location').addEventListener('click', function() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            setStartLocation(lat, lon);
            map.setView([lat, lon], 13);
        }, function(error) {
            alert('Unable to get your location: ' + error.message);
        });
    } else {
        alert('Geolocation is not supported by your browser');
    }
});

// Plan journey
document.getElementById('plan-journey').addEventListener('click', async function() {
    if (!startMarker || !endMarker) {
        alert('Please set both start and end locations on the map');
        return;
    }
    
    const startTime = document.getElementById('start-time').value;
    const duration = parseFloat(document.getElementById('duration').value);
    const springPercentage = document.getElementById('spring-percentage').value;
    
    if (!startTime) {
        alert('Please set a departure time');
        return;
    }
    
    const startLatLng = startMarker.getLatLng();
    const endLatLng = endMarker.getLatLng();
    
    const requestBody = {
        start_location: { lat: startLatLng.lat, lon: startLatLng.lng },
        end_location: { lat: endLatLng.lat, lon: endLatLng.lng },
        start_time: startTime,
        duration_hours: duration
    };
    
    // Add spring percentage if manually entered
    if (springPercentage !== '') {
        requestBody.spring_percentage = parseFloat(springPercentage);
    }
    
    try {
        console.log('Sending request:', requestBody);
        
        const response = await fetch('/api/journey-plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            alert('Server error: ' + errorText);
            return;
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        displayJourneyResults(data);
        displayTideInformation(data, startTime, duration);
    } catch (error) {
        console.error('Error planning journey:', error);
        alert('Error planning journey: ' + error.message);
    }
});

// Display journey results
function displayJourneyResults(data) {
    const resultsPanel = document.getElementById('results-panel');
    const resultsContainer = document.getElementById('journey-results');
    
    const journey = data.journey;
    const tides = data.tides;
    
    const startDate = new Date(journey.start_time);
    const endDate = new Date(journey.end_time);
    
    resultsContainer.innerHTML = `
        <div class="result-item">
            <strong>Distance:</strong> ${journey.distance_km} km (${journey.distance_nm} nm)
        </div>
        <div class="result-item">
            <strong>Duration:</strong> ${journey.duration_hours} hours
        </div>
        <div class="result-item">
            <strong>Departure:</strong> ${startDate.toLocaleString()}
        </div>
        <div class="result-item">
            <strong>Arrival:</strong> ${endDate.toLocaleString()}
        </div>
        <div class="result-item">
            <strong>Tide at Start:</strong> ${tides.start_height}m
            <span class="tide-status ${tides.tide_direction === 'rising' ? 'tide-rising' : 'tide-falling'}">
                ${tides.tide_direction}
            </span>
        </div>
        <div class="result-item">
            <strong>Tide at End:</strong> ${tides.end_height}m
        </div>
        <div class="result-item">
            <strong>Flow Rate:</strong> ${tides.flow_rate}m/hour
        </div>
        <div class="result-item">
            <strong>Spring/Neap:</strong> 
            <span class="spring-percentage">${tides.spring_percentage}%</span>
            ${tides.spring_percentage > 70 ? '(Springs)' : tides.spring_percentage < 30 ? '(Neaps)' : '(Mid-range)'}
            <br><small style="color: #666;">Source: ${tides.spring_source || 'calculated'}</small>
        </div>
    `;
    
    resultsPanel.style.display = 'block';
}

// Display tide information with chart
async function displayTideInformation(journeyData, startTime, duration) {
    const tideContainer = document.getElementById('tide-info');
    
    try {
        const response = await fetch('/api/tides', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                station: journeyData.tides.station,
                start_time: startTime,
                duration_hours: duration
            })
        });
        
        const data = await response.json();
        
        // Create canvas for chart
        tideContainer.innerHTML = `
            <p><strong>Station:</strong> ${data.station}</p>
            <p><strong>High Tide:</strong> ${data.high_tide}m</p>
            <p><strong>Low Tide:</strong> ${data.low_tide}m</p>
            <canvas id="tide-chart"></canvas>
        `;
        
        // Create tide chart
        const ctx = document.getElementById('tide-chart').getContext('2d');
        
        if (tideChart) {
            tideChart.destroy();
        }
        
        tideChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.tides.map(t => new Date(t.time).toLocaleTimeString()),
                datasets: [{
                    label: 'Tide Height (m)',
                    data: data.tides.map(t => t.height),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Height (m)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching tide data:', error);
    }
}

// Clear journey
document.getElementById('clear-journey').addEventListener('click', function() {
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    
    document.getElementById('start-location').value = '';
    document.getElementById('end-location').value = '';
    document.getElementById('results-panel').style.display = 'none';
    document.getElementById('tide-info').innerHTML = '<p class="info-text">Select a journey to see tide information</p>';
    
    if (tideChart) {
        tideChart.destroy();
        tideChart = null;
    }
});

// Initialize app
initializeDateTime();
loadLaunchSpots();
