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

// Dynamic logo redirect based on role
const logoLink = document.getElementById('logoLink');
if (logoLink && loggedUser) {
    if (loggedUser.role === 'volunteer') {
        logoLink.href = 'volunteer.html';
    } else if (loggedUser.role === 'user') {
        logoLink.href = 'user.html';
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
        const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") ? "http://127.0.0.1:8500" : "";
        if (!imgPath.startsWith('http')) {
            // Locally, the files are served at /uploads, not /api/uploads
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
        const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") ? "http://127.0.0.1:8500" : "";
        const res = await fetch(`${apiBase}/api/users/profile/update`, {
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

// Check for logged-in user to pre-fill the form
const user = loggedUser;
if (user) {
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');

    if (nameInput && user.username) {
        nameInput.value = user.username;
        nameInput.readOnly = true;
        nameInput.style.backgroundColor = "#f1f5f9";
        nameInput.parentElement.style.opacity = "0.7";
    }
    if (emailInput && user.email) {
        emailInput.value = user.email;
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = "#f1f5f9";
        emailInput.parentElement.style.opacity = "0.7";
    }
}

const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const subject = document.getElementById('subject').value;
        const message = document.getElementById('message').value;

        const payload = {
            name: name,
            email: email,
            subject: subject,
            message: message
        };

        try {
            const apiBase = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") ? "http://127.0.0.1:8500" : "";
            const response = await fetch(`${apiBase}/api/users/complaints`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                alert('Thank you for reaching out! Your message has been sent to the admin.');
                // Only reset non-readonly fields if logged in
                if (user) {
                    const subjectField = document.getElementById('subject');
                    const messageField = document.getElementById('message');
                    if (subjectField) subjectField.value = "";
                    if (messageField) messageField.value = "";
                } else {
                    contactForm.reset();
                }
            } else {
                alert('Failed to send message. Please try again later.');
            }
        } catch (error) {
            console.error("Error:", error);
            alert('Could not connect to server.');
        }
    });
}
