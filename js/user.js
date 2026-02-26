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

// Auto-refresh every 5 seconds to show live status updates
setInterval(loadRequests, 5000);

async function confirmIncident(incidentId, confirmed) {
    try {
        const response = await fetch(`/api/users/incidents/${incidentId}/confirm?confirmed=${confirmed}`, {
            method: "PUT"
        });
        if (response.ok) {
            loadRequests();
        }
    } catch (e) {
        console.error("Confirmation error:", e);
    }
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
        let url = "/api/users/incidents";
        let method = "POST";

        if (editingId) {
            url = `/api/users/incidents/${editingId}?user_id=${user.id}`;
            method = "PUT";
            // For update, exclude reporter_id in body if schema adheres strictly, 
            // but our simple schema logic ignores extra fields or we can just send what's needed.
        }

        console.log(`Submitting ${method} to ${url} with payload:`, payload);

        const response = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log("Server response:", result);

        if (response.ok) {
            alert(editingId ? "Request updated successfully!" : "Request submitted successfully!");

            // Reset Form
            incidentForm.reset();
            currentLat = null;
            currentLng = null;
            editingId = null;
            document.querySelector(".submit").innerText = "Submit Request"; // Reset button text

            // Reload list to show changes
            loadRequests();
        } else {
            alert("Error submitting request: " + (result.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Could not connect to backend");
    }
});

// Function to add a single incident to the request list
function addIncidentToList(incident) {
    const list = document.getElementById("requestList");

    // Remove "No requests" message if present
    const noReqMsg = list.querySelector("p");
    if (noReqMsg) noReqMsg.remove();

    const div = document.createElement("div");
    div.className = "request_item";
    div.innerHTML = `
      <div class="request_info">
        <h4>${incident.title}</h4>
        <p>${incident.full_address || 'No address'}</p>
      </div>
      <span class="status_badge status_${incident.status}">${incident.status}</span>
    `;

    // Add at the top of the list
    list.insertBefore(div, list.firstChild);
}

async function confirmIncident(id, confirmed) {
    try {
        const response = await fetch(`/api/users/incidents/${id}/confirm?confirmed=${confirmed}`, {
            method: "PUT"
        });
        if (response.ok) {
            alert(confirmed ? "Incident closed. Thank you!" : "Incident re-opened. We are re-assigning it.");
            loadRequests();
        }
    } catch (e) {
        console.error("Error confirming:", e);
    }
}

async function loadRequests() {
    try {
        if (!user || !user.id) {
            console.error("User ID not found in local storage");
            return;
        }

        const url = `/api/users/incidents/user/${user.id}`;
        console.log("Fetching URL:", url);

        const response = await fetch(url);

        if (!response.ok) {
            console.error("Fetch failed:", response.status, response.statusText);
            const errText = await response.text();
            console.error("Error details:", errText);
            document.getElementById("requestList").innerHTML = `<p style='color:red; text-align:center;'>Error loading requests: ${response.status}</p>`;
            return;
        }

        const data = await response.json();
        console.log("Incidents from backend:", data);

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
            div.style.flexDirection = "column"; // Stack info and tracker
            div.style.alignItems = "stretch";

            // Map status to tracker steps (0-4)
            const statusMap = {
                'reported': 0,
                'pending': 0,
                'accepted': 1,
                'in_progress': 2,
                'awaiting_confirmation': 3,
                'closed': 4
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
                                <div class="step_icon">
                                    <i class="fas ${step.icon}"></i>
                                </div>
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
        const list = document.getElementById("requestList");
        list.innerHTML = `<p style='text-align:center; padding:20px; color:red;'>Error loading requests. Check if backend is running on port 8500.</p>`;
    }
}

// EDIT Function
function editIncident(id) {
    window.location.href = `edit_incident.html?id=${id}`;
}

// DELETE Function
async function deleteIncident(id) {
    if (!confirm("Are you sure you want to delete this request?")) return;

    try {
        const response = await fetch(`/api/users/incidents/${id}?user_id=${user.id}`, {
            method: "DELETE"
        });

        if (response.ok) {
            alert("Request deleted successfully");
            loadRequests(); // Refresh list
        } else {
            const data = await response.json();
            alert("Error deleting: " + (data.detail || "Unknown error"));
        }
    } catch (e) {
        console.error("Delete error:", e);
        alert("Failed to connect to server");
    }
}
loadRequests();
setInterval(loadRequests, 5000); // Auto-refresh user requests every 5 seconds

// --- Profile Sidebar Logic ---

function toggleProfile() {
    const sidebar = document.getElementById("profileSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
    if (sidebar.classList.contains("active")) {
        loadProfileData();
    }
}

function loadProfileData() {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    document.getElementById("userNameDisplay").textContent = user.username || "SafeUser";
    document.getElementById("userEmail").textContent = user.email || "No Email Found";
    document.getElementById("userRoleBadge").textContent = (user.role || 'User').toUpperCase();

    // Profile Image
    if (user.profile_image) {
        const userImg = document.getElementById("userImg");
        const defaultIcon = document.getElementById("defaultIcon");
        let imgPath = user.profile_image;
        if (!imgPath.startsWith('http')) {
            imgPath = `/api/${imgPath}`;
        }
        userImg.src = imgPath;
        userImg.classList.remove("hidden");
        defaultIcon.classList.add("hidden");
    }

    // Modal populate
    document.getElementById("editUsername").value = user.username || "";
    document.getElementById("editEmail").value = user.email || "";
    document.getElementById("editAddress").value = user.address || "";

    // Address display
    document.getElementById("userAddress").textContent = user.address || "Address not set";
}

function openEditModal() {
    document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal() {
    document.getElementById("editModal").classList.add("hidden");
}

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const userImg = document.getElementById("userImg");
            const defaultIcon = document.getElementById("defaultIcon");
            userImg.src = e.target.result;
            userImg.classList.remove("hidden");
            defaultIcon.classList.add("hidden");
        }
        reader.readAsDataURL(file);
    }
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
    if (imageInput.files[0]) {
        formData.append("image", imageInput.files[0]);
    }

    try {
        const res = await fetch("/api/users/profile/update", {
            method: "PUT",
            body: formData
        });

        if (res.ok) {
            const updatedUser = await res.json();
            const newUser = { ...user, ...updatedUser };
            localStorage.setItem("user", JSON.stringify(newUser));
            alert("Profile updated successfully!");
            closeEditModal();
            loadProfileData(); // Refresh sidebar data
        } else {
            const errorData = await res.json();
            alert(errorData.detail || "Failed to update profile.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error. Try again.");
    }
});
