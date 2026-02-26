// Helper to get API Base URL
const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  ? "http://127.0.0.1:8500"
  : "";

const user = JSON.parse(localStorage.getItem("user"));

if (!user || user.role !== "volunteer") {
  window.location.href = "login.html";
}

let isProcessing = false;

async function loadIncidents() {
  try {
    const response = await fetch(`${apiBase}/api/users/incidents`);
    const data = await response.json();

    const liveList = document.getElementById("live_list");
    const historyList = document.getElementById("history_list");

    liveList.innerHTML = '';
    historyList.innerHTML = '';

    data.forEach(incident => {
      const userAddrParts = (user.address || "").toLowerCase().split(",").map(p => p.trim()).filter(p => p);
      const incidentLocation = (incident.full_address || "").toLowerCase();
      const isLocationMatch = userAddrParts.some(part => incidentLocation.includes(part));

      if ((incident.status === "reported" || incident.status === "pending") && !incident.volunteer_id) {
        if (user.address && !isLocationMatch) return;

        const div = document.createElement("div");
        div.className = "request";
        div.innerHTML = `
              <div class="request_row">
                <div class="request_info">
                  <p class="request_title">${incident.title}</p>
                  <p style="color:var(--primary_blue); font-size:14px; margin-bottom:4px;">Reported by: <strong>${incident.reporter_name}</strong></p>
                  <p class="request_meta">${incident.full_address || 'No location'} <span class="dot"></span> ${new Date(incident.created_at).toLocaleString()}</p>
                </div>
                <span class="incident_status" onclick="updateStatus(${incident.id}, 'accept')">Accept</span>
              </div>
            `;
        liveList.appendChild(div);
      }
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
                   <p class="request_meta">${incident.full_address || 'No location'}</p>
                   <div id="map_${incident.id}" class="volunteer_map" style="margin-top: 10px; width: 100%; height: 200px; border-radius: 8px;"></div>
                   <a href="https://www.google.com/maps?q=${incident.latitude && incident.longitude ? incident.latitude + ',' + incident.longitude : encodeURIComponent(incident.full_address || '')}" target="_blank" style="display:block; margin-top:8px; color:var(--primary_blue); font-size:13px; text-decoration:none;">
                     <i class="fas fa-external-link-alt"></i> Open in Google Maps
                   </a>
                 </div>
                 ${actionBtn}
               </div>
             `;
        liveList.appendChild(div);

        const mapId = `map_${incident.id}`;
        const lat = incident.latitude || 20.5937;
        const lng = incident.longitude || 78.9629;
        const vmap = L.map(mapId).setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(vmap);
        L.marker([lat, lng]).addTo(vmap);
      }
      else if (incident.volunteer_id == user.id) {
        const div = document.createElement("div");
        div.className = "completed_incident";
        const displayStatus = incident.status === "awaiting_confirmation" ? "Awaiting User Confirmation" : incident.status;
        const statusColor = incident.status === "closed" ? "green" : "purple";

        div.innerHTML = `
              <div>
                <p><strong>${incident.title}</strong></p>
                <p style="font-size:13px">User: ${incident.reporter_name}</p>
                <p style="font-size:13px; color:${statusColor}">Status: ${displayStatus.replace('_', ' ').toUpperCase()}</p>
              </div>
              <div class="status" style="background:${statusColor}">${incident.status.toUpperCase()}</div>
            `;
        historyList.appendChild(div);
      }
    });

    if (liveList.children.length === 0) liveList.innerHTML += "<p style='text-align:center; padding:20px;'>No live requests.</p>";
    if (historyList.children.length === 0) historyList.innerHTML += "<p style='text-align:center; padding:20px;'>No history found.</p>";

  } catch (error) { console.error(error); }
}

async function updateStatus(incidentId, action) {
  if (isProcessing) return;
  isProcessing = true;
  document.body.style.cursor = "wait";

  try {
    const response = await fetch(`${apiBase}/api/users/incidents/${incidentId}/${action}?volunteer_id=${user.id}`, { method: "PUT" });
    if (response.ok) loadIncidents();
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

loadIncidents();
setInterval(loadIncidents, 5000);
