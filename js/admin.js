// Helper to get API Base URL
const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:8500"
    : "";

async function fetchAllData() {
    try {
        // Fetch Users
        const userRes = await fetch(`${apiBase}/api/users/users-raw`);
        const users = await userRes.json();

        // Fetch Incidents
        const incidentRes = await fetch(`${apiBase}/api/users/incidents`);
        const incidents = await incidentRes.json();

        // Fetch Complaints
        const complaintRes = await fetch(`${apiBase}/api/users/complaints`);
        const complaints = await complaintRes.json();

        updateStats(users, incidents, complaints);
        renderUsers(users);
        renderIncidents(incidents);
        renderComplaints(complaints);
    } catch (e) {
        console.error("Admin Load Error:", e);
    }
}

function updateStats(users, incidents, complaints) {
    document.getElementById('statTotalUsers').innerText = users.length;
    document.getElementById('statVolunteers').innerText = users.filter(u => u.role === 'volunteer').length;
    document.getElementById('statIncidents').innerText = incidents.filter(i => i.status !== 'closed').length;
    if (document.getElementById('statComplaints')) {
        document.getElementById('statComplaints').innerText = complaints.length;
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = users.map(user => {
        const isVolunteer = user.role === 'volunteer';
        const approvalBadge = isVolunteer
            ? `<span class="badge ${user.is_approved ? 'badge_approved' : 'badge_pending'}">${user.is_approved ? 'Approved' : 'Pending'}</span>`
            : '<span class="badge badge_approved">N/A</span>';

        // Fix for image path: Supabase URL starts with http, local path doesn't
        let fullImagePath = user.profile_image || "";
        if (fullImagePath && !fullImagePath.startsWith('http')) {
            fullImagePath = `${apiBase}/${fullImagePath}`;
        }

        return `
        <tr>
            <td>#${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.mobile}</td>
            <td><span class="badge badge_${user.role}">${user.role}</span></td>
            <td>${approvalBadge}</td>
            <td>
                ${isVolunteer ? `<button class="action_btn btn_view" onclick="openImage('${fullImagePath}?t=${Date.now()}')">View ID</button>` : ''}
                ${(isVolunteer && !user.is_approved) ? `<button class="action_btn btn_approve" onclick="approveVolunteer(${user.id})">Approve</button>` : ''}
                <button class="action_btn btn_delete" onclick="deleteUser(${user.id})">Delete</button>
            </td>
        </tr>
    `}).join('');
}

function renderIncidents(incidents) {
    const tbody = document.getElementById('incidentTableBody');
    tbody.innerHTML = incidents.map(inc => `
        <tr>
            <td>#${inc.id}</td>
            <td>${inc.title}</td>
            <td>${inc.full_address}</td>
            <td>${inc.reporter_name}</td>
            <td>${inc.volunteer_name}</td>
            <td><span class="badge badge_${inc.status}">${inc.status}</span></td>
        </tr>
    `).join('');
}

function renderComplaints(complaints) {
    const tbody = document.getElementById('complaintTableBody');
    if (!tbody) return;
    tbody.innerHTML = complaints.map(comp => `
        <tr>
            <td>#${comp.id}</td>
            <td>${comp.name}</td>
            <td>${comp.email}</td>
            <td>${comp.subject}</td>
            <td style="max-width: 300px; white-space: normal;">${comp.message}</td>
            <td>${new Date(comp.created_at).toLocaleString()}</td>
        </tr>
    `).join('');
}

function showSection(section) {
    document.getElementById('usersSection').classList.toggle('hidden', section !== 'users');
    document.getElementById('incidentsSection').classList.toggle('hidden', section !== 'incidents');
    document.getElementById('complaintsSection').classList.toggle('hidden', section !== 'complaints');

    // Toggle active link
    document.querySelectorAll('.admin_nav_link').forEach(link => {
        link.classList.remove('active');
        // Check if link text matches section (e.g. "Manage Users", "Incidents", "Complaints")
        if (link.innerText.toLowerCase().includes(section)) link.classList.add('active');
    });
}

async function approveVolunteer(id) {
    try {
        const res = await fetch(`${apiBase}/api/users/admin/approve/${id}`, { method: 'PUT' });
        if (res.ok) {
            alert("Volunteer approved successfully!");
            fetchAllData();
        }
    } catch (e) { console.error(e); }
}

function openImage(url) {
    console.log("Opening ID Image:", url);
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImg');
    if (!url) {
        alert("No image available");
        return;
    }
    img.src = url;
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('imageModal').classList.add('hidden');
}

async function deleteUser(id) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
        const res = await fetch(`${apiBase}/api/users/admin/user/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert("User deleted");
            fetchAllData();
        }
    } catch (e) { console.error(e); }
}

// Initial Load
fetchAllData();
setInterval(fetchAllData, 10000); // Auto refresh every 10s
