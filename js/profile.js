const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    window.location.href = "login.html";
}

// Set Dashboard link based on role
const dashboardLink = document.getElementById("dashboardLink");
if (dashboardLink) {
    dashboardLink.href = user.role === 'volunteer' ? 'volunteer.html' : 'user.html';
}

// Populate Profile Data
document.getElementById("userNameDisplay").textContent = user.username || "SafeUser";
document.getElementById("userEmail").textContent = user.email || "No Email Found";
document.getElementById("userRoleBadge").textContent = user.role.toUpperCase();

// Role based theme adjustment
if (user.role === 'volunteer') {
    document.getElementById("userRoleBadge").style.backgroundColor = "#10b981"; // Green for volunteer
}

// Profile Image Handling (specifically for volunteers who uploaded IDs or profiles)
if (user.profile_image) {
    const userImg = document.getElementById("userImg");
    const defaultIcon = document.getElementById("defaultIcon");

    // Check if it's a relative path starting with static/ or uploads/
    let imgPath = user.profile_image;
    if (!imgPath.startsWith('http')) {
        imgPath = `/api/${imgPath}`;
    }

    userImg.src = imgPath;
    userImg.classList.remove("hidden");
    defaultIcon.classList.add("hidden");
}

// Address handling for volunteers
if (user.role === 'volunteer' && user.address) {
    const addressSection = document.getElementById("addressSection");
    const userAddress = document.getElementById("userAddress");
    addressSection.classList.remove("hidden");
    userAddress.textContent = user.address;

    // Show address field in edit modal for volunteers
    document.getElementById("editAddressGroup").classList.remove("hidden");
}

// Modal Toggle Functions
function openEditModal() {
    document.getElementById("editUsername").value = user.username;
    document.getElementById("editEmail").value = user.email;
    if (user.role === 'volunteer') {
        document.getElementById("editAddress").value = user.address || "";
    }
    document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal() {
    document.getElementById("editModal").classList.add("hidden");
}

// Image Preview
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

// Form Submission
document.getElementById("editProfileForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("user_id", user.id);
    formData.append("username", document.getElementById("editUsername").value);
    formData.append("email", document.getElementById("editEmail").value);
    if (user.role === 'volunteer') {
        formData.append("address", document.getElementById("editAddress").value);
    }

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
            // Important: Preserve the password in localStorage if response doesn't include it
            const newUser = { ...user, ...updatedUser };
            localStorage.setItem("user", JSON.stringify(newUser));
            alert("Profile updated successfully!");
            location.reload();
        } else {
            const errorData = await res.json();
            alert(errorData.detail || "Failed to update profile.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error. Try again.");
    }
});
