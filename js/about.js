// Helper to get API Base URL
const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:8500"
    : "";

// Navbar Dynamic Logic
const navLinks = document.getElementById('navLinks');
const loggedUser = JSON.parse(localStorage.getItem("user"));

if (navLinks) {
    if (loggedUser) {
        navLinks.innerHTML += `
            <a href="javascript:void(0)" onclick="toggleProfile()" class="nav_link">My Profile</a>
            <a href="../index.html" class="nav_link" onclick="localStorage.removeItem('user')">Logout</a>
        `;
    } else {
        navLinks.innerHTML += `
            <a href="login.html" class="nav_link">Login</a>
            <a href="signup.html" class="nav_link">Sign Up</a>
        `;
    }
}

// Side Profile Logic
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
            imgPath = `${apiBase}/${imgPath}`;
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
        const res = await fetch(`${apiBase}/api/users/profile/update`, {
            method: "PUT",
            body: formData
        });

        if (res.ok) {
            const updatedUser = await res.json();
            localStorage.setItem("user", JSON.stringify({ ...user, ...updatedUser }));
            alert("Profile updated successfully!");
            document.getElementById("editModal").classList.add("hidden");
            loadProfileData();
        }
    } catch (err) {
        console.error(err);
        alert("Server error. Try again.");
    }
});

function openEditModal() { document.getElementById("editModal").classList.remove("hidden"); }
function closeEditModal() { document.getElementById("editModal").classList.add("hidden"); }
