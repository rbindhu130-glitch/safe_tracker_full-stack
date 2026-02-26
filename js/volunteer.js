const user = JSON.parse(localStorage.getItem("user"));

if (!user || user.role !== "volunteer") {
  window.location.href = "login.html";
}

let isProcessing = false; // Flag to prevent double submission

async function loadIncidents() {
  try {
    const response = await fetch("/api/users/incidents");
    const data = await response.json();

    const liveList = document.getElementById("live_list");
    const historyList = document.getElementById("history_list");

    // Clear previous list content only (headers are safe)
    liveList.innerHTML = '';
    historyList.innerHTML = '';

    data.forEach(incident => {
      // FILTER BY LOCATION
      const userAddrParts = (user.address || "").toLowerCase().split(",").map(p => p.trim()).filter(p => p);
      const incidentLocation = (incident.full_address || "").toLowerCase();

      // Check if ANY part of the user's address is found in the incident address
      const isLocationMatch = userAddrParts.some(part => incidentLocation.includes(part));

      // SHOW AVAILABLE INCIDENTS (Status 'accepted', 'reported', or 'pending' but NO volunteer assigned yet)
      if ((incident.status === "reported" || incident.status === "pending") && !incident.volunteer_id) {

        if (user.address && !isLocationMatch) {
          return; // Skip if location doesn't match
        }

        const div = document.createElement("div");
        div.className = "request";
        div.innerHTML = `
              <div class="request_row">
                <div class="request_info">
                  <p class="request_title">${incident.title}</p>
                  <p style="color:var(--primary_blue); font-size:14px; margin-bottom:4px;">Reported by: <strong>${incident.reporter_name}</strong></p>

                  <p class="request_meta">${incident.full_address || 'Location not specified'} <span class="dot"></span> ${new Date(incident.created_at).toLocaleString()}</p>
                </div>
                <span class="incident_status" onclick="updateStatus(${incident.id}, 'accept')">Accept</span>
              </div>
            `;
        liveList.appendChild(div);
      }
      // SHOW MY ACTIVE INCIDENTS (ACCEPTED OR IN PROGRESS)
      else if ((incident.status === "accepted" || incident.status === "in_progress") && incident.volunteer_id == user.id) {
        const div = document.createElement("div");
        div.className = "request";

        let actionBtn = "";
        if (incident.status === "accepted") {
          actionBtn = `<span class="incident_status" style="background:var(--primary_blue)" onclick="updateStatus(${incident.id}, 'in_progress')">Start Heading There</span>`;
        } else if (incident.status === "in_progress") {
          actionBtn = `<span class="incident_status" style="background:#16a34a" onclick="updateStatus(${incident.id}, 'complete')">I Have Arrived</span>`;
        }

        div.innerHTML = `
               <div class="request_row">
                 <div class="request_info">
                   <p class="request_title">${incident.title} (${incident.status.replace('_', ' ')})</p>
                   <p style="color:var(--primary_blue); font-size:14px; margin-bottom:4px;">Helping: <strong>${incident.reporter_name}</strong></p>
                   <p class="request_meta">${incident.full_address || 'Location not specified'}</p>

                   <!-- Fast Leaflet Map -->
                   <div id="map_${incident.id}" class="volunteer_map" style="margin-top: 10px; width: 100%; height: 200px; border-radius: 8px;"></div>
                   
                   <a href="https://www.google.com/maps?q=${incident.latitude && incident.longitude ? incident.latitude + ',' + incident.longitude : encodeURIComponent(incident.full_address || '')}" target="_blank" style="display:block; margin-top:8px; color:var(--primary_blue); font-size:13px; text-decoration:none;">
                     <i class="fas fa-external-link-alt"></i> Open in Google Maps for Navigation
                   </a>
                 </div>
                 ${actionBtn}
               </div>
             `;
        liveList.appendChild(div);

        // Initialize map after it's in the DOM
        const mapId = `map_${incident.id}`;
        const lat = incident.latitude || 20.5937;
        const lng = incident.longitude || 78.9629;
        const vmap = L.map(mapId).setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(vmap);
        L.marker([lat, lng]).addTo(vmap);
      }
      // SHOW MY PREVIOUS INCIDENTS (AWAITING OR CLOSED)
      else if (incident.volunteer_id == user.id) {
        const div = document.createElement("div");
        div.className = "completed_incident";
        const displayStatus = incident.status === "awaiting_confirmation" ? "Awaiting User Confirmation" : incident.status;
        const statusColor = incident.status === "closed" ? "green" : "purple";

        div.innerHTML = `
              <div>
                <p><strong>${incident.title}</strong></p>
                <p style="font-size:13px">User: ${incident.reporter_name}</p>
                <p style="font-size:13px">Location: ${incident.full_address}</p>
                <p style="font-size:13px; color:${statusColor}">Status: ${displayStatus.replace('_', ' ').toUpperCase()}</p>
              </div>
              <div class="status" style="background:${statusColor}">${incident.status.toUpperCase()}</div>
            `;
        historyList.appendChild(div);
      }
    });

    if (liveList.children.length === 0) {
      liveList.innerHTML += "<p style='text-align:center; padding:20px;'>No live requests.</p>";
    }
    if (historyList.children.length === 0) {
      historyList.innerHTML += "<p style='text-align:center; padding:20px;'>No history found.</p>";
    }

  } catch (error) {
    console.error("Error loading incidents:", error);
  }
}

loadIncidents();

// Auto-refresh every 5 seconds to show updates
setInterval(loadIncidents, 5000);

async function updateStatus(incidentId, action) {
  if (isProcessing) return; // Prevent double trigger
  isProcessing = true;
  document.body.style.cursor = "wait";

  const url = `/api/users/incidents/${incidentId}/${action}?volunteer_id=${user.id}`;
  try {
    const response = await fetch(url, { method: "PUT" });
    if (response.ok) {
      console.log("Incident updated successfully");
      loadIncidents();
    } else {
      console.error("Error updating incident status");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    isProcessing = false;
    document.body.style.cursor = "default";
  }
}

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

  document.getElementById("userNameDisplay").textContent = user.username || "SafeVolunteer";
  document.getElementById("userEmail").textContent = user.email || "No Email Found";
  document.getElementById("userRoleBadge").textContent = "VOLUNTEER";

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

  // Address
  if (user.address) {
    const addressSection = document.getElementById("addressSection");
    const userAddress = document.getElementById("userAddress");
    addressSection.classList.remove("hidden");
    userAddress.textContent = user.address;
    document.getElementById("editAddressGroup").classList.remove("hidden");
  }

  // Modal populate
  document.getElementById("editUsername").value = user.username || "";
  document.getElementById("editEmail").value = user.email || "";
  document.getElementById("editAddress").value = user.address || "";
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
