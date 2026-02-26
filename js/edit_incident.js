const editForm = document.getElementById("editForm");
const user = JSON.parse(localStorage.getItem("user"));
const urlParams = new URLSearchParams(window.location.search);
const incidentId = urlParams.get('id');

const getMapBtn = document.querySelector(".get_map_btn");

const locationInput = document.getElementById("location");
const mapIframe = document.querySelector(".map_wrapper iframe");

let currentLat = null;
let currentLng = null;


if (!user) {
    window.location.href = "../pages/login.html";
}

if (!incidentId) {
    alert("No incident ID provided");
    window.location.href = "user.html";
}

// Reuse geolocation logic from user.js


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
    if (navigator.geolocation) {
        getMapBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        navigator.geolocation.getCurrentPosition((position) => {
            currentLat = position.coords.latitude;
            currentLng = position.coords.longitude;
            mapIframe.src = `https://maps.google.com/maps?q=${currentLat},${currentLng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
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

getMapBtn.addEventListener("click", handleGeolocation);

// Load Incident Details
async function loadIncidentDetails() {
    try {
        const response = await fetch(`/api/users/incident/me/${incidentId}`);
        if (!response.ok) throw new Error("Failed to fetch incident");

        const data = await response.json();

        document.getElementById("incidentId").value = data.id;
        document.getElementById("select").value = data.title;
        document.getElementById("location").value = data.full_address;

        if (data.latitude && data.longitude) {
            currentLat = data.latitude;
            currentLng = data.longitude;
            mapIframe.src = `https://maps.google.com/maps?q=${currentLat},${currentLng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
        }
    } catch (e) {
        console.error(e);
        alert("Error loading incident details");
        window.location.href = "user.html";
    }
}

// Handle Update
editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("select").value;
    const full_address = document.getElementById("location").value;

    const payload = {
        title: title,
        full_address: full_address,
        latitude: currentLat,
        longitude: currentLng
    };

    try {
        const response = await fetch(`/api/users/incidents/${incidentId}?user_id=${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Incident updated successfully!");
            window.location.href = "user.html";
        } else {
            const result = await response.json();
            alert("Update failed: " + (result.detail || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Server connection failed");
    }
});

loadIncidentDetails();
