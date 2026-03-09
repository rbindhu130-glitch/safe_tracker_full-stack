// Helper to get API Base URL
const hostname = window.location.hostname;
const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.");
const apiBase = isLocal ? `http://${hostname}:8500` : "";

console.log("Edit Incident page loaded");

const editForm = document.getElementById("editForm");
const user = JSON.parse(localStorage.getItem("user"));
const urlParams = new URLSearchParams(window.location.search);
const incidentId = urlParams.get('id');

console.log("User from localStorage:", user);
console.log("Incident ID from URL:", incidentId);

const getMapBtn = document.querySelector(".get_map_btn");
const locationInput = document.getElementById("location");
const mapIframe = document.querySelector(".map_wrapper iframe");

let currentLat = null;
let currentLng = null;


if (!user) {
    console.warn("No user found in localStorage, redirecting to login");
    window.location.href = "login.html";
}

if (!incidentId) {
    console.error("No incident ID provided in URL");
    alert("No incident ID provided");
    window.location.href = "user.html";
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await response.json();

        if (data && data.display_name) {
            const addr = data.address;
            const locality = addr.suburb || addr.neighbourhood || addr.village || "";
            const city = addr.city || addr.town || "";
            const state = addr.state || "";
            const postcode = addr.postcode || "";
            const fullAddress = `${locality ? locality + ", " : ""}${city ? city + ", " : ""}${state ? state + " " : ""}${postcode}`.trim() || data.display_name;
            locationInput.value = fullAddress;
        }
    } catch (e) {
        console.error("Reverse geocoding error:", e);
        locationInput.value = `📍 GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

function handleGeolocation() {
    console.log("Requesting geolocation...");
    if (navigator.geolocation) {
        getMapBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        navigator.geolocation.getCurrentPosition((position) => {
            currentLat = position.coords.latitude;
            currentLng = position.coords.longitude;
            console.log("Geo location found:", currentLat, currentLng);
            if (mapIframe) {
                mapIframe.src = `https://maps.google.com/maps?q=${currentLat},${currentLng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
            }
            reverseGeocode(currentLat, currentLng);
            getMapBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>'; }, 3000);
        }, (error) => {
            console.error("GPS Error:", error);
            alert("Could not get your location.");
            getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
        });
    } else {
        alert("Geolocation not supported.");
    }
}

if (getMapBtn) getMapBtn.addEventListener("click", handleGeolocation);

// Load Incident Details
async function loadIncidentDetails() {
    const fetchUrl = `${apiBase}/api/users/incident/me/${incidentId}`;
    console.log("Loading details from:", fetchUrl);
    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch incident: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log("Loaded incident data:", data);

        if (document.getElementById("incidentId")) document.getElementById("incidentId").value = data.id;
        if (document.getElementById("select")) document.getElementById("select").value = data.title || "security";
        if (document.getElementById("location")) document.getElementById("location").value = data.full_address || "";

        if (data.latitude && data.longitude) {
            currentLat = data.latitude;
            currentLng = data.longitude;
            if (mapIframe) {
                mapIframe.src = `https://maps.google.com/maps?q=${currentLat},${currentLng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
            }
        }
    } catch (e) {
        console.error("Error in loadIncidentDetails:", e);
        alert("Error loading incident details: " + e.message);
        // window.location.href = "user.html";
    }
}

// Handle Update
if (editForm) {
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("Form submit triggered");

        const title = document.getElementById("select").value;
        const full_address = document.getElementById("location").value;

        const payload = {
            title: title,
            full_address: full_address,
            latitude: currentLat,
            longitude: currentLng
        };

        const updateUrl = `${apiBase}/api/users/incidents/${incidentId}?user_id=${user.id}`;
        console.log("Updating incident at:", updateUrl);
        console.log("Payload:", payload);

        try {
            const response = await fetch(updateUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log("Update successful");
                alert("Incident updated successfully!");
                window.location.href = "user.html";
            } else {
                const result = await response.json();
                console.error("Update failed:", result);
                let errorMsg = result.detail || "Unknown error";
                if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
                alert("Update failed: " + errorMsg);
            }
        } catch (e) {
            console.error("Fetch error during update:", e);
            alert("Server connection failed");
        }
    });
} else {
    console.error("Edit form not found!");
}

loadIncidentDetails();
