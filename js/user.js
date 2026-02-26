// Helper to get API Base URL
const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:8500"
    : "";

const incidentForm = document.getElementById("incidentForm");
const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    window.location.href = "login.html";
}

const getMapBtn = document.querySelector(".get_map_btn");
const locationInput = document.getElementById("location");

// Initialize Fast Leaflet Map
let map = L.map('map').setView([20.5937, 78.9629], 5); // Default to India
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let watchId = null;
let marker = null;
let currentLat = null;
let currentLng = null;
let editingId = null;

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
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    // Reset button state and start locating
    getMapBtn.innerHTML = '<i class="fas fa-satellite-dish fa-fade"></i> Requesting Access...';
    getMapBtn.style.background = "#2563eb"; // Standard blue while waiting

    // Directly call the native browser geolocation prompt
    navigator.geolocation.getCurrentPosition((position) => {
        updatePositionData(position);

        // After initial hit, start watching for movement
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);

        getMapBtn.innerHTML = '<i class="fas fa-satellite-dish fa-fade"></i> Tracking Live...';
        getMapBtn.style.background = "#059669"; // Success Green

        watchId = navigator.geolocation.watchPosition(updatePositionData, handleGPSError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });

    }, (error) => {
        console.error("GPS Error:", error);
        getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Map';
        getMapBtn.style.background = "var(--primary_blue)";

        if (error.code === error.PERMISSION_DENIED) {
            alert("📍 Location access denied! \n\nPlease click the 'Lock' icon next to your URL bar and set Location to 'Allow'.");
        } else {
            alert("Could not get location. Please check your GPS settings or enter address manually.");
        }
    }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    });
}

function updatePositionData(position) {
    currentLat = position.coords.latitude;
    currentLng = position.coords.longitude;

    console.log("Location Update:", currentLat, currentLng);

    // Update Map
    map.setView([currentLat, currentLng], 15);
    if (marker) {
        marker.setLatLng([currentLat, currentLng]);
    } else {
        marker = L.marker([currentLat, currentLng]).addTo(map);
    }

    reverseGeocode(currentLat, currentLng);
}

function handleGPSError(error) {
    console.error("GPS Error:", error);
    getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Map';
    getMapBtn.style.background = "var(--primary_blue)";

    let msg = "GPS Error: ";
    if (error.code === 1) msg += "Please allow location permissions in your browser.";
    else if (error.code === 2) msg += "Position unavailable.";
    else if (error.code === 3) msg += "Timeout. Try again.";

    alert(msg);
    watchId = null;
}

getMapBtn.addEventListener("click", handleGeolocation);
locationInput.addEventListener("click", () => {
    if (!currentLat) handleGeolocation();
});

async function loadRequests() {
    try {
        if (!user || !user.id) return;

        const response = await fetch(`${apiBase}/api/users/incidents/user/${user.id}`);
        if (!response.ok) return;

        const data = await response.json();
        const list = document.getElementById("requestList");
        list.innerHTML = "";

        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML = "<p style='text-align:center; padding:20px;'>No requests yet. Submit one using the form!</p>";
            return;
        }

        data.reverse().forEach((req) => {
            const visibleStatuses = ['reported', 'pending', 'awaiting_confirmation', 'closed', 'in_progress', 'accepted'];
            if (!visibleStatuses.includes(req.status)) return;

            const div = document.createElement("div");
            div.className = "request_item";
            div.style.flexDirection = "column";
            div.style.alignItems = "stretch";

            const statusMap = {
                'reported': 0, 'pending': 0, 'accepted': 1, 'in_progress': 2, 'awaiting_confirmation': 3, 'closed': 4
            };
            const currentStep = statusMap[req.status] || 0;
            const progressWidth = (currentStep / 4) * 100;

            const steps = [
                { label: 'Reported', icon: 'fa-bullhorn' },
                { label: 'Volunteer Assigned', icon: 'fa-user-check' },
                { label: 'In Route', icon: 'fa-person-running' },
                { label: 'Arrived', icon: 'fa-location-dot' },
                { label: 'Safe', icon: 'fa-shield-heart' }
            ];

            const trackerHtml = `
                <div class="status_tracker_container">
                    <div class="tracker_steps">
                        <div class="tracker_progress_bar" style="width: ${progressWidth}%"></div>
                        ${steps.map((step, index) => `
                            <div class="step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}">
                                <div class="step_icon"><i class="fas ${step.icon}"></i></div>
                                <div class="step_label">${step.label}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            div.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                <div class="request_info">
                  <h4>${req.title}</h4>
                  <p>${req.full_address || 'No address'}</p>
                  <div class="action_buttons">
                      ${(req.status === 'reported' || req.status === 'pending') ?
                    `<button class="btn_sm btn_edit" onclick="editIncident('${req.id}')">Edit</button>
                         <button class="btn_sm btn_delete" onclick="deleteIncident('${req.id}')">Cancel Request</button>`
                    : ''}
                      ${req.status === 'awaiting_confirmation' ?
                    `<button class="btn_sm" style="background: var(--primary_blue); padding: 8px 15px;" onclick="confirmIncident('${req.id}', true)">Confirm Arrival / Safe</button>`
                    : ''}
                  </div>
                </div>
                <div style="text-align:right">
                   <span class="status_badge status_${req.status}">${req.status.replace('_', ' ').toUpperCase()}</span>
                </div>
              </div>
              ${trackerHtml}
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading requests:", e);
    }
}

async function confirmIncident(id, confirmed) {
    try {
        const response = await fetch(`${apiBase}/api/users/incidents/${id}/confirm?confirmed=${confirmed}`, {
            method: "PUT"
        });
        if (response.ok) {
            alert(confirmed ? "Incident closed. Thank you!" : "Incident re-opened. We are re-assigning it.");
            loadRequests();
        }
    } catch (e) { console.error(e); }
}

incidentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("select").value;
    const full_address = locationInput.value;
    const payload = {
        title: title,
        full_address: full_address,
        latitude: currentLat,
        longitude: currentLng,
        reporter_id: user.id
    };

    try {
        const response = await fetch(`${apiBase}/api/users/incidents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            alert("Request submitted successfully!");
            incidentForm.reset();
            loadRequests();
        } else {
            const result = await response.json();
            alert("Error: " + (result.detail || "Unknown error"));
        }
    } catch (error) { console.error(error); }
});

function editIncident(id) {
    window.location.href = `edit_incident.html?id=${id}`;
}

async function deleteIncident(id) {
    if (!confirm("Are you sure you want to delete this request?")) return;
    try {
        const response = await fetch(`${apiBase}/api/users/incidents/${id}?user_id=${user.id}`, { method: "DELETE" });
        if (response.ok) {
            alert("Request deleted");
            loadRequests();
        }
    } catch (e) { console.error(e); }
}

// Sidebar Logic
function toggleProfile() {
    const sidebar = document.getElementById("profileSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
    if (sidebar.classList.contains("active")) loadProfileData();
}

function loadProfileData() {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    document.getElementById("userNameDisplay").textContent = user.username || "SafeUser";
    document.getElementById("userEmail").textContent = user.email || "No Email Found";
    document.getElementById("userRoleBadge").textContent = (user.role || 'User').toUpperCase();

    if (user.profile_image) {
        const userImg = document.getElementById("userImg");
        const defaultIcon = document.getElementById("defaultIcon");
        let imgPath = user.profile_image;
        if (!imgPath.startsWith('http')) {
            imgPath = `${apiBase}/${imgPath}`;
        }
        userImg.src = imgPath;
        userImg.classList.remove("hidden");
        defaultIcon.classList.add("hidden");
    }

    document.getElementById("editUsername").value = user.username || "";
    document.getElementById("editEmail").value = user.email || "";
    document.getElementById("editAddress").value = user.address || "";
    document.getElementById("userAddress").textContent = user.address || "Address not set";
}

document.getElementById("editProfileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem("user"));
    const formData = new FormData();
    formData.append("user_id", user.id);
    formData.append("username", document.getElementById("editUsername").value);
    formData.append("email", document.getElementById("editEmail").value);
    formData.append("address", document.getElementById("editAddress").value);

    const imageInput = document.getElementById("imageInput");
    if (imageInput.files[0]) formData.append("image", imageInput.files[0]);

    try {
        const res = await fetch(`${apiBase}/api/users/profile/update`, {
            method: "PUT",
            body: formData
        });
        if (res.ok) {
            const updatedUser = await res.json();
            localStorage.setItem("user", JSON.stringify({ ...user, ...updatedUser }));
            alert("Profile updated!");
            document.getElementById("editModal").classList.add("hidden");
            loadProfileData();
        }
    } catch (err) { console.error(err); }
});

function openEditModal() { document.getElementById("editModal").classList.remove("hidden"); }
function closeEditModal() { document.getElementById("editModal").classList.add("hidden"); }

loadRequests();
setInterval(loadRequests, 5000);
