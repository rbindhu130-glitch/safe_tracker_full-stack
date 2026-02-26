// Home Page Navbar Logic
const navLinks = document.getElementById('navLinks');
const loggedUser = JSON.parse(localStorage.getItem("user"));

if (navLinks) {
    if (loggedUser) {
        navLinks.innerHTML += `
            <a href="javascript:void(0)" class="nav_link" onclick="toggleProfile()">My Profile</a>
            <a href="#" class="nav_link" onclick="localStorage.removeItem('user'); location.reload();">Logout</a>
        `;
    } else {
        navLinks.innerHTML += `
            <a href="./pages/login.html" class="nav_link">Login</a>
            <a href="./pages/signup.html" class="nav_link">Sign Up</a>
        `;
    }
}

// Dynamic logo redirect based on role
const logoLink = document.getElementById('logoLink');
const userCards = document.querySelectorAll('.card_role');

if (loggedUser) {
    if (logoLink) {
        if (loggedUser.role === 'volunteer') {
            logoLink.href = './pages/volunteer.html';
        } else if (loggedUser.role === 'user') {
            logoLink.href = './pages/user.html';
        }
    }

    // Update Portal Cards on Home Page if logged in
    userCards.forEach(card => {
        const isUserCard = card.querySelector('h2').innerText.toLowerCase().includes('user');
        const isVolCard = card.querySelector('h2').innerText.toLowerCase().includes('volunteer');

        if (isUserCard) {
            card.href = './pages/user.html';
            card.querySelector('.btn_action').innerText = 'Go to Dashboard';
        } else if (isVolCard) {
            card.href = './pages/volunteer.html';
            card.querySelector('.btn_action').innerText = 'Go to Dashboard';
        }
    });
}

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

document.getElementById("editProfileForm")?.addEventListener("submit", async (e) => {
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
