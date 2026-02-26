const role = document.getElementById("role");
const imageSection = document.getElementById("imageSection");
const signupForm = document.getElementById("signupForm");
const imageInput = document.getElementById("image");
const fileNameDisplay = document.getElementById("file-name");

// --- Pre-select Role from URL ---
const urlParams = new URLSearchParams(window.location.search);
const roleParam = urlParams.get("role");
if (roleParam && (roleParam === "user" || roleParam === "volunteer")) {
    role.value = roleParam;
}

role.addEventListener("change", () => {
    if (role.value === "volunteer") {
        imageSection.style.display = "block";
    } else {
        imageSection.style.display = "none";
        if (imageInput) imageInput.value = "";
        if (fileNameDisplay) {
            fileNameDisplay.textContent = "Choose File";
            fileNameDisplay.style.color = "#6b7280";
        }
        const addrField = document.getElementById("address");
        if (addrField) addrField.value = "";
    }
});
role.dispatchEvent(new Event("change"));
if (imageInput) {
    imageInput.addEventListener("change", () => {
        if (imageInput.files && imageInput.files[0]) {
            fileNameDisplay.textContent = imageInput.files[0].name;
            fileNameDisplay.style.color = "var(--primary_blue)";
        } else {
            fileNameDisplay.textContent = "Choose File";
            fileNameDisplay.style.color = "#6b7280";
        }
    });
}

signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(signupForm);
    const roleValue = document.getElementById("role").value;
    const imageInput = document.getElementById("image");
    const hasImage = imageInput.files && imageInput.files.length > 0;

    if (roleValue === "volunteer") {
        const addressValue = document.getElementById("address").value.trim();
        if (!hasImage && !addressValue) {
            alert("Volunteer must upload image and enter address!");
            return;
        } else if (!hasImage) {
            alert("Volunteer must upload image!");
            return;
        } else if (!addressValue) {
            alert("Please enter your address!");
            return;
        }
    }

    if (roleValue === "user" && hasImage) {
        alert("Users should not upload an image. Please remove the image.");
        return;
    }

    if (roleValue !== "volunteer") {
        formData.delete("image");
        formData.delete("address");

    } else if (!hasImage) {
        formData.delete("image");
    }

    try {
        const response = await fetch("/api/users/signup", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            if (roleValue === "user") {
                // AUTO-LOGIN for Users to avoid "second signup page" feel
                const userObj = {
                    id: data.user_id,
                    username: formData.get("username"),
                    email: formData.get("email"),
                    role: data.role,
                    is_approved: true
                };
                localStorage.setItem("user", JSON.stringify(userObj));
                alert("Welcome to SafeTracker! You are now logged in.");
                window.location.href = "user.html";
            } else {
                // Volunteers still need to login/wait for approval
                alert("Signup successful! Please login to your dashboard.");
                window.location.href = "login.html";
            }
        } else {
            let errMsg = "Unknown error";
            if (typeof data.detail === "string") {
                errMsg = data.detail;
            } else if (Array.isArray(data.detail)) {
                errMsg = data.detail.map(err => err.msg || JSON.stringify(err)).join(", ");
            } else if (typeof data.detail === "object") {
                errMsg = JSON.stringify(data.detail);
            }
            alert("Signup failed: " + errMsg);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Could not connect to server. Make sure backend is running.");
    }
});
