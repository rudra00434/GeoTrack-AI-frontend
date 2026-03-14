// =============================================
//  AI GPS TRACKER — Premium App Logic
// =============================================

let GROQ_API_KEY = ""; // Prompt user on start tracking
let lastAiUpdate = 0;
const AI_INTERVAL_MS = 10000;

// ========== MAP SETUP (Dark Mode Default) ==========
const map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);

// Use CARTO Dark Matter as default for Opex style
const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
}).addTo(map);

const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri'
});

let isDark = true;

function toggleTheme() {
    isDark = !isDark;
    
    if(isDark) {
        map.removeLayer(satelliteTiles);
        darkTiles.addTo(map);
        document.getElementById('themeBtn').querySelector('.material-icons-round').textContent = 'satellite';
        document.body.style.background = '#101217';
    } else {
        map.removeLayer(darkTiles);
        satelliteTiles.addTo(map);
        document.getElementById('themeBtn').querySelector('.material-icons-round').textContent = 'dark_mode';
        document.body.style.background = '#101217'; // Keep dark theme look overall even with satellite map
    }
}

function recenterMap() {
    if(currentLat && currentLng) {
        map.setView([currentLat, currentLng], 16);
    }
}

// Custom Marker
const markerIcon = L.divIcon({
    className: '',
    html: '<div class="custom-pin"></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

let marker = L.marker([20.5937, 78.9629], { icon: markerIcon }).addTo(map);
let accuracyCircle = null;

// ========== STATE ==========
let isTracking = false;
let watchId = null;
let lastPos = null;
let totalDistance = 0;
let startTime = null;
let timerInterval = null;
let currentLat = null, currentLng = null, currentSpeed = 0;
let currentLocationName = "Searching...";
let fullAddressName = "";
let positionHistory = [];

// ========== UI UPDATES ==========
function updateTimer() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hrs = Math.floor(elapsed / 3600);
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    document.getElementById('valTime').textContent = hrs > 0 ? `${hrs}:${mins}:${secs}` : `${mins}:${secs}`;
}

let lastGeocode = 0;
async function reverseGeocode(lat, lng) {
    const now = Date.now();
    if (now - lastGeocode < 15000) return;
    lastGeocode = now;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`);
        const data = await res.json();
        const addr = data.address || {};
        
        const road = addr.road || addr.neighbourhood || addr.suburb || addr.hamlet || "Unknown Area";
        const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || addr.state || addr.country || '';
        
        currentLocationName = `${road}${city ? ', ' + city : ''}`;
        fullAddressName = data.display_name || currentLocationName;
        document.getElementById('locationText').textContent = currentLocationName;
    } catch (e) {
        console.warn('Geocode fail', e);
    }
}

// ========== AI INSIGHTS ==========
async function getAIInsights(lat, lng, speed) {
    if (!GROQ_API_KEY) return;
    const now = Date.now();
    if (now - lastAiUpdate < AI_INTERVAL_MS) return;
    lastAiUpdate = now;

    const alertTitle = document.getElementById('aiAlertTitle');
    const alertText = document.getElementById('aiAlertText');
    const alertIcon = document.querySelector('#aiAlertBox .material-icons-round');

    alertTitle.textContent = "Analyzing Location...";
    alertText.textContent = "AI is processing your environment...";
    alertIcon.textContent = "rotate_right";
    alertIcon.classList.add('pulse');

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                stream: false,
                messages: [{
                    role: "system", 
                    content: "You are an AI Copilot. Give ONE short snappy insight (max 10 words) about the user's trip context. Start with a relevant icon (emoji fine here just for the text output)."
                }, {
                    role: "user",
                    content: `Area: ${fullAddressName || currentLocationName}. Speed: ${speed} km/h. Dist: ${totalDistance}m.`
                }]
            })
        });

        const data = await response.json();
        const text = data.choices[0].message.content;
        
        alertTitle.textContent = "Smart Insight";
        alertText.textContent = text;
        alertIcon.textContent = speed > 60 ? "speed" : "lightbulb";
        alertIcon.classList.remove('pulse');

    } catch (err) {
        alertTitle.textContent = "AI Offline";
        alertText.textContent = "Connection failed.";
        alertIcon.textContent = "cloud_off";
        alertIcon.classList.remove('pulse');
    }
}


// ========== TRACKING ==========
document.getElementById('trackBtn').addEventListener('click', () => {
    if (!GROQ_API_KEY) {
        GROQ_API_KEY = prompt("Enter your Groq API Key:");
        if (!GROQ_API_KEY) return;
    }

    if (!isTracking) {
        startTracking();
    } else {
        stopTracking();
    }
});

function startTracking() {
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    
    document.getElementById('statusLabel').textContent = 'Tracking active';
    document.getElementById('statusLabel').classList.add('pulse');

    const btn = document.getElementById('trackBtn');
    btn.innerHTML = `<span class="material-icons-round">stop</span>Stop Tracking`;
    btn.style.background = '#EF4444'; // Red for stop
    btn.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';

    watchId = navigator.geolocation.watchPosition(
        onPositionUpdate, 
        (err) => {
            console.warn("GPS Error: " + err.message);
            // Fallback for file:/// execution or permission denied
            if(err.code === err.PERMISSION_DENIED || window.location.protocol === 'file:') {
                console.log("Browser blocked HTML5 Geolocation. Falling back to IP-based location...");
                getIpLocation();
            } else {
                alert("GPS Error: " + err.message);
            }
        }, 
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 10000
        }
    );
    isTracking = true;
}

// IP-based Geolocation fallback if running without a local server
async function getIpLocation() {
    try {
        document.getElementById('locationText').textContent = "Fetching IP location...";
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        
        if (data.error) throw new Error(data.reason);

        // Call the update function once with the approximate coordinates
        onPositionUpdate({
            coords: { 
                latitude: data.latitude, 
                longitude: data.longitude, 
                accuracy: 5000 // Approximate
            },
            timestamp: Date.now()
        });

        // Set the location text manually to the city/region
        currentLocationName = `${data.city}, ${data.region}`;
        fullAddressName = `${data.city}, ${data.region}, ${data.country_name || ''}`;
        document.getElementById('locationText').textContent = currentLocationName;
        
    } catch (e) {
        console.warn("IP Geolocation failed:", e);
        document.getElementById('locationText').textContent = "Location unavailable offline";
        // Final fallback: just default to a central location so the app doesn't break
        onPositionUpdate({
            coords: { latitude: 20.5937, longitude: 78.9629, accuracy: 10000 },
            timestamp: Date.now()
        });
    }
}

function stopTracking() {
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timerInterval);

    document.getElementById('statusLabel').textContent = 'Tracking paused';
    document.getElementById('statusLabel').classList.remove('pulse');

    const btn = document.getElementById('trackBtn');
    btn.innerHTML = `<span class="material-icons-round">play_arrow</span>Start Tracking`;
    btn.style.background = 'var(--accent-blue)';
    btn.style.boxShadow = '0 4px 16px rgba(47, 128, 237, 0.4)';

    isTracking = false;
}

function onPositionUpdate(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    currentLat = lat;
    currentLng = lng;

    let speed = 0;
    if (lastPos) {
        const d = map.distance([lat, lng], [lastPos.lat, lastPos.lng]);
        const t = (pos.timestamp - lastPos.ts) / 1000;
        speed = t > 0 ? parseFloat((d / t * 3.6).toFixed(1)) : 0;
        totalDistance += d;
    }

    currentSpeed = speed;
    lastPos = { lat, lng, ts: pos.timestamp };

    marker.setLatLng([lat, lng]);
    map.panTo([lat, lng]);

    if(accuracyCircle) map.removeLayer(accuracyCircle);
    accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        className: 'accuracy-circle'
    }).addTo(map);

    // Update UI Stats
    document.getElementById('valSpeed').innerHTML = `${Math.round(speed)}<span>km/h</span>`;
    
    if (totalDistance > 1000) {
        document.getElementById('valDist').innerHTML = `${(totalDistance/1000).toFixed(2)}<span>km</span>`;
    } else {
        document.getElementById('valDist').innerHTML = `${Math.round(totalDistance)}<span>m</span>`;
    }

    reverseGeocode(lat, lng);
    getAIInsights(lat, lng, speed);
}


// ========== FULL CHAT MODAL ==========
function toggleChat() {
    const overlay = document.getElementById('chatOverlay');
    overlay.classList.toggle('open');
}

function sendQuickChat(text) {
    document.getElementById('chatInput').value = text;
    sendChat();
}

let chatHistory = [{
    role: "system", 
    content: "Professional AI Copilot for a mapping app. Keep answers highly concise and relevant to location navigation. Do not use markdown."
}];

async function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return;
    input.value = '';

    const msgs = document.getElementById('chatMessages');
    
    msgs.insertAdjacentHTML('beforeend', `<div class="msg msg-user">${text}</div>`);
    msgs.scrollTop = msgs.scrollHeight;

    chatHistory.push({ role: "user", content: `Context: Location is ${fullAddressName || currentLocationName}. Speed is ${currentSpeed}km/h. User says: ${text}` });

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: chatHistory
            })
        });
        
        const data = await res.json();
        
        if (data.error) {
            msgs.insertAdjacentHTML('beforeend', `<div class="msg msg-ai">API Error: ${data.error.message || JSON.stringify(data.error)}</div>`);
            msgs.scrollTop = msgs.scrollHeight;
            return;
        }

        const reply = data.choices[0].message.content;
        const htmlReply = window.marked ? marked.parse(reply) : reply;
        
        msgs.insertAdjacentHTML('beforeend', `<div class="msg msg-ai markdown-body">${htmlReply}</div>`);
        msgs.scrollTop = msgs.scrollHeight;
        
        chatHistory.push({ role: "assistant", content: reply });
    } catch(e) {
        console.error("Chatbot Error:", e);
        msgs.insertAdjacentHTML('beforeend', `<div class="msg msg-ai" style="color: #ef4444;">Connection failed. Cross-Origin block or network error on file:///. Ensure you are online.</div>`);
        msgs.scrollTop = msgs.scrollHeight;
    }
}

// ========== INITIALIZATION ==========
// Load approximate location immediately for fast perceived load
async function initMapLocation() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data.error) return;
        
        currentLat = data.latitude;
        currentLng = data.longitude;
        
        // Use zoom level 12 for city level view
        map.setView([currentLat, currentLng], 12);
        marker.setLatLng([currentLat, currentLng]);
        
        currentLocationName = `${data.city}, ${data.region}`;
        fullAddressName = `${data.city}, ${data.region}, ${data.country_name || ''}`;
        document.getElementById('locationText').textContent = currentLocationName;
    } catch (e) {
        console.log("Initial IP location fetch failed.", e);
    }
}

initMapLocation();
