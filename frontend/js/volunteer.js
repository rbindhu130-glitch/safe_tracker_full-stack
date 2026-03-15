const apiBase = window.location.origin;
console.log("DEBUG: API Base set to", apiBase);

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "login.html";
} else if (user.role === "user") {
  window.location.href = "user.html";
} else if (user.role === "admin") {
  window.location.href = "admin.html";
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

let isProcessing = false;
let mapInstances = {};

let vLat = null;
let vLng = null;
let vWatchId = null;

if (navigator.geolocation) {
  vWatchId = navigator.geolocation.watchPosition((pos) => {
    vLat = pos.coords.latitude;
    vLng = pos.coords.longitude;
    console.log("Volunteer location updated:", vLat, vLng);
  }, (err) => {
    console.warn("Volunteer GPS error", err);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}


async function loadIncidents() {
  try {
    const url = `${apiBase}/api/users/incidents?user_id=${user.id}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Failed to fetch incidents:", response.status);
      return;
    }
    const data = await response.json();
    
    // Check if data is identical to previous load to prevent jumpy UI
    const dataHash = JSON.stringify(data);
    if (window.lastIncidentsHash === dataHash) {
        return; 
    }
    window.lastIncidentsHash = dataHash;

    const liveList = document.getElementById("live_list");
    const historyList = document.getElementById("history_list");

    // Save scroll positions
    const liveScroll = liveList ? liveList.scrollTop : 0;
    const historyScroll = historyList ? historyList.scrollTop : 0;

    // Pre-cleanup maps
    for (let id in mapInstances) {
      if (mapInstances[id]) {
        mapInstances[id].remove();
        delete mapInstances[id];
      }
    }

    liveList.innerHTML = '';
    historyList.innerHTML = '';

    console.log(`DEBUG: Received ${data.length} incidents from API`);
    data.forEach(incident => {
      console.log(`DEBUG: Checking Incident ${incident.id}, Status: ${incident.status}, VolID: ${incident.volunteer_id}`);
      
      // Temporary: Show ALL reported incidents regardless of location match for debugging
      if ((incident.status === "reported" || incident.status === "pending") && !incident.volunteer_id) {
        console.log(`DEBUG: Incident ${incident.id} MATCHES filter. Appending to liveList.`);
        
        const nearbyBadge = isLocationMatch && volAddrWords.length > 0 ? '<span class="nearby_badge">Nearby</span> ' : '';

        const div = document.createElement("div");
        div.className = "request";
        div.innerHTML = `
              <div class="request_row">
                <div class="request_info">
                  <p class="request_title">${nearbyBadge}${incident.title}</p>
                  <p style="color:var(--primary); font-size:14px; margin-bottom:4px;">Reported by: <strong>${incident.reporter_name || 'Anonymous'}</strong></p>
                  <p class="request_meta">${incident.full_address || 'No location'} <span class="dot"></span> ${new Date(incident.created_at).toLocaleString()}</p>
                </div>
                <span class="incident_status" onclick="updateStatus(${incident.id}, 'accept')">Accept</span>
              </div>
            `;
        liveList.appendChild(div);
      }
      else if (incident.status === "in_progress" && incident.volunteer_id == user.id) {
        const div = document.createElement("div");
        div.className = "request";

        let actionBtn = "";
        if (incident.status === "in_progress") {
          actionBtn = `<span class="incident_status" style="background:#16a34a" onclick="updateStatus(${incident.id}, 'complete')">Mark as Completed</span>`;
        }

        const mapId = `map_${incident.id}`;

        let distHtml = "";
        if (vLat && vLng && incident.latitude && incident.longitude) {
          const dist = getDistance(vLat, vLng, incident.latitude, incident.longitude);
          if (dist !== null) {
            distHtml = `<p style="color:#059669; font-size:15px; margin-bottom:4px; font-weight:bold;">📍 User is ${dist} km away</p>`;
          }
        }

        div.innerHTML = `
               <div class="request_row">
                 <div class="request_info" style="width: 100%;">
                   <p class="request_title">${incident.title} (${incident.status.replace('_', ' ')})</p>
                   <p style="color:var(--primary_blue); font-size:14px; margin-bottom:4px;">Helping: <strong>${incident.reporter_name || 'User'}</strong></p>
                   ${distHtml}
                    <p class="request_meta">${incident.full_address || 'No location'}</p>
                    <button class="chat_btn" onclick="openChat(${incident.id}, '${incident.title}', '${incident.status}')" style="position: relative;">
                        <i class="fas fa-comments"></i> Chat with User
                        ${incident.unread_count > 0 ? `<span class="chat_badge">${incident.unread_count}</span>` : ''}
                    </button>
                    <div id="${mapId}" class="volunteer_map" style="margin-top: 10px; width: 100%; height: 200px; border-radius: 8px;"></div>
                    <div style="margin-top: 15px; display: flex; justify-content: center;">
                        ${actionBtn}
                    </div>
                 </div>
               </div>
             `;
        liveList.appendChild(div);

        try {
          const lat = incident.latitude || 20.5937;
          const lng = incident.longitude || 78.9629;
          const vmap = L.map(mapId).setView([lat, lng], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(vmap);
          L.marker([lat, lng]).addTo(vmap);

          if (vLat && vLng) {
            const vIcon = L.divIcon({
              className: 'custom-div-icon',
              html: "<div style='background-color:#059669; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);'></div>",
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            L.marker([vLat, vLng], { icon: vIcon }).addTo(vmap).bindPopup("Your Location");

            // Draw a line connecting Volunteer and User
            const routeLine = L.polyline([
              [lat, lng],
              [vLat, vLng]
            ], {
              color: '#2563eb', // primary blue
              weight: 4,
              opacity: 0.7,
              dashArray: '10, 10'
            }).addTo(vmap);

            vmap.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
          }

          mapInstances[mapId] = vmap;
        } catch (mapErr) {
          console.error("Map init error:", mapErr);
        }
      }
      else if (incident.volunteer_id == user.id) {
        const div = document.createElement("div");
        div.className = "completed_incident";
        const displayStatus = incident.status === "awaiting_confirmation" ? "Awaiting User Confirmation" : incident.status;
        const statusBg = incident.status === "closed" ? "#16a34a" : "#6366f1";
        div.innerHTML = `
              <div style="flex: 1;">
                <p><strong>${incident.title}</strong></p>
                <p style="font-size:13px; color:#64748b;">User: ${incident.reporter_name || 'Anonymous'}</p>
                   ${(['accepted', 'in_progress', 'awaiting_confirmation', 'closed'].includes(incident.status)) ?
            `<button class="chat_btn" onclick="openChat(${incident.id}, '${incident.title}', '${incident.status}')" style="margin-top:8px; position: relative;">
                        <i class="fas fa-comments"></i> ${incident.status === 'closed' ? 'History' : 'Chat'}
                        ${incident.unread_count > 0 ? `<span class="chat_badge">${incident.unread_count}</span>` : ''}
                     </button>` : ''}
              </div>
              <div class="status" style="background:${statusBg}; color: white; border:none; font-weight:700; font-size:11px; min-width:90px; text-align:center;">
                ${displayStatus.toUpperCase()}
              </div>
            `;
        historyList.appendChild(div);
      }
    });

    if (liveList.children.length === 0) liveList.innerHTML += "<p style='text-align:center; padding:20px;'>No live requests.</p>";
    if (historyList.children.length === 0) historyList.innerHTML += "<p style='text-align:center; padding:20px;'>No history found.</p>";

    // Restore scroll positions
    if (liveList) liveList.scrollTop = liveScroll;
    if (historyList) historyList.scrollTop = historyScroll;

  } catch (error) {
    console.error("Error loading incidents:", error);
  }
}


async function updateStatus(incidentId, action) {
  if (isProcessing) return;
  isProcessing = true;
  document.body.style.cursor = "wait";

  try {
    const response = await fetch(`${apiBase}/api/users/incidents/${incidentId}/${action}?volunteer_id=${user.id}`, { method: "PUT" });
    if (response.ok) {
      showToast(action === "accept" ? "Incident Accepted!" : "Incident Completed!");
      loadIncidents();
    } else {
      const err = await response.json();
      showToast(err.detail || "Error updating status", "error");
      loadIncidents();
    }
  } catch (error) { console.error(error); } finally {
    isProcessing = false;
    document.body.style.cursor = "default";
  }
}

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

  document.getElementById("userNameDisplay").textContent = user.username || "SafeVolunteer";
  document.getElementById("userEmail").textContent = user.email || "No Email Found";
  document.getElementById("userRoleBadge").textContent = "VOLUNTEER";

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
  document.getElementById("userAddress").textContent = user.address || "No address set";
  
  // Ensure address fields are visible for volunteers
  const addrSection = document.getElementById("addressSection");
  if (addrSection) addrSection.classList.remove("hidden");
  const editAddrGroup = document.getElementById("editAddressGroup");
  if (editAddrGroup) editAddrGroup.classList.remove("hidden");
}

document.getElementById("editProfileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isProcessing) return;

  const saveBtn = e.target.querySelector(".btn_save");
  const originalText = saveBtn.innerHTML;

  isProcessing = true;
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
    isProcessing = false;
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
});

loadIncidents();
setInterval(loadIncidents, 5000);
