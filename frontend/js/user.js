const apiBase = window.location.origin;
console.log("DEBUG: API Base set to", apiBase);

// --- STRICT ROLE CHECK ---
const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    window.location.href = "login.html";
} else if (user.role === "volunteer") {
    // If a volunteer tries to access the user page, send them to their dashboard
    window.location.href = "volunteer.html";
} else if (user.role === "admin") {
    window.location.href = "admin.html";
} else if (user.role !== "user") {
    // Safety fallback for unknown roles
    window.location.href = "login.html";
}
// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = "success") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast_container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

const incidentForm = document.getElementById("incidentForm");
const getMapBtn = document.querySelector(".get_map_btn");
const locationInput = document.getElementById("location");

// Initialize Fast Leaflet Map
let map = L.map('map').setView([13.0827, 80.2707], 11); // Default to Chennai
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let watchId = null;
let marker = null;
let currentLat = null;
let currentLng = null;
let editingId = null;
let activeIncidentIds = [];

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
    getMapBtn.style.background = "#3b82f6"; // Primary blue while waiting

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
        getMapBtn.style.background = "var(--primary, #3b82f6)";

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

    // Send live location update to DB for active incidents
    if (activeIncidentIds && activeIncidentIds.length > 0) {
        activeIncidentIds.forEach(id => {
            fetch(`${apiBase}/api/users/incidents/${id}/live-location?lat=${currentLat}&lng=${currentLng}`, {
                method: 'PUT'
            }).catch(e => console.error("Live coord update error:", e));
        });
    }
}

function handleGPSError(error) {
    console.warn("GPS Error handled silently:", error);
    getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Map';
    getMapBtn.style.background = "var(--primary, #3b82f6)";
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
        console.log(`DEBUG: Received ${data.length} incidents for user ${user.id}`);
        const list = document.getElementById("requestList");
        list.innerHTML = "";
        
        if (!Array.isArray(data) || data.length === 0) {
            console.log("DEBUG: Data is empty or not an array");
            list.innerHTML = "<p style='text-align:center; padding:20px;'>No requests yet. Submit one using the form!</p>";
            return;
        }
        
        let activeIds = [];
        data.reverse().forEach((req) => {
            console.log(`DEBUG: Processing Incident ${req.id}, Status: ${req.status}`);
            const visibleStatuses = ['reported', 'pending', 'awaiting_confirmation', 'closed', 'in_progress', 'accepted'];
            if (!visibleStatuses.includes(req.status)) return;

            if (['reported', 'pending', 'accepted', 'in_progress'].includes(req.status)) {
                activeIds.push(req.id);
            }

            const div = document.createElement("div");
            div.className = "request_item";
            div.style.flexDirection = "column";
            div.style.alignItems = "stretch";

            div.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                <div class="request_info">
                  <h4>${req.title}</h4>
                  <p>${req.full_address || 'No address'}</p>
                </div>
                <div style="text-align:right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 100px;">
                   <span class="status_badge status_${req.status}">${req.status.replace('_', ' ').toUpperCase()}</span>
                   ${(['accepted', 'in_progress', 'awaiting_confirmation', 'closed'].includes(req.status)) ?
                    `<button class="chat_btn" onclick="openChat(${req.id}, '${req.title}', '${req.status}')" style="margin-top:5px; padding: 4px 8px; font-size: 11px; position: relative;">
                        <i class="fas fa-comments"></i> ${req.status === 'closed' ? 'History' : 'Chat with Volunteer'}
                        ${req.unread_count > 0 ? `<span class="chat_badge">${req.unread_count}</span>` : ''}
                     </button>` : ''}
                   ${(req.status === 'reported' || req.status === 'pending') ?
                    `<button class="delete_btn_icon" title="Cancel Request" onclick="deleteIncident('${req.id}')" style="background: none; border: none; color: #dc2626; font-size: 24px; cursor: pointer; padding: 0; transition: transform 0.2s; display: flex;">
                        <i class="fas fa-times-circle"></i>
                     </button>`
                    : ''}
                   ${(req.status === 'awaiting_confirmation') ?
                    `<div style="display:flex; gap:8px; margin-top:8px; flex-wrap: wrap;">
                       <button title="Confirm Completion" onclick="confirmIncident('${req.id}', true)" style="
                          background: linear-gradient(135deg, #10b981, #059669);
                          border: none; color: white; border-radius: 10px;
                          padding: 8px 16px; cursor: pointer; font-size: 13px;
                          font-weight: 600; font-family: 'Poppins', sans-serif;
                          box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
                          display: flex; align-items: center; gap: 6px;
                          transition: all 0.2s ease;
                       " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(5,150,105,0.4)'"
                          onmouseout="this.style.transform='';this.style.boxShadow='0 4px 12px rgba(5, 150, 105, 0.3)'">
                          <i class="fas fa-check-circle"></i> Confirm
                       </button>
                       <button title="Not Completed" onclick="confirmIncident('${req.id}', false)" style="
                          background: linear-gradient(135deg, #f87171, #dc2626);
                          border: none; color: white; border-radius: 10px;
                          padding: 8px 16px; cursor: pointer; font-size: 13px;
                          font-weight: 600; font-family: 'Poppins', sans-serif;
                          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
                          display: flex; align-items: center; gap: 6px;
                          transition: all 0.2s ease;
                       " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(220,38,38,0.4)'"
                          onmouseout="this.style.transform='';this.style.boxShadow='0 4px 12px rgba(220, 38, 38, 0.3)'">
                          <i class="fas fa-times-circle"></i> Not Done
                       </button>
                     </div>`
                    : ''}
                </div>
              </div>
            `;
            list.appendChild(div);
        });

        activeIncidentIds = activeIds;
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
            showToast(confirmed ? "Incident closed. Thank you!" : "Incident re-opened. We are re-assigned it.");
            loadRequests();
        }
    } catch (e) { console.error(e); }
}

let isSubmitting = false;
incidentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    const submitBtn = incidentForm.querySelector(".submit");
    const originalBtnText = submitBtn.innerHTML;
    
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

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
            showToast("Request submitted successfully!");
            incidentForm.reset();
            
            // --- FULL RESET OF LOCATION DATA ---
            currentLat = null;
            currentLng = null;
            
            // Stop GPS tracking if active
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }

            // Restore "Get Map" button to original state
            getMapBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Map';
            getMapBtn.style.background = "var(--primary, #3b82f6)";

            // Clear Map Marker and reset view
            if (marker) {
                map.removeLayer(marker);
                marker = null;
            }
            map.setView([13.0827, 80.2707], 11); // Back to Chennai default

            loadRequests();
        } else {
            const result = await response.json();
            showToast("Error: " + (result.detail || "Unknown error"), "error");
        }
    } catch (error) { 
        console.error(error);
        showToast("Connection error", "error");
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});

async function deleteIncident(id) {
    if (isSubmitting) return;
    if (!confirm("Are you sure you want to delete this request?")) return;
    
    isSubmitting = true;
    try {
        const response = await fetch(`${apiBase}/api/users/incidents/${id}?user_id=${user.id}`, { method: "DELETE" });
        if (response.ok) {
            showToast("Request deleted");
            loadRequests();
        }
    } catch (e) { console.error(e); }
    finally { isSubmitting = false; }
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
    if (isSubmitting) return;
    
    const saveBtn = e.target.querySelector(".btn_save");
    const originalText = saveBtn.innerHTML;
    
    isSubmitting = true;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

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
            showToast("Profile updated!");
            document.getElementById("editModal").classList.add("hidden");
            loadProfileData();
        }
    } catch (err) { console.error(err); }
    finally {
        isSubmitting = false;
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
});

function openEditModal() { document.getElementById("editModal").classList.remove("hidden"); }
function closeEditModal() { document.getElementById("editModal").classList.add("hidden"); }

loadRequests();
setInterval(loadRequests, 5000);
