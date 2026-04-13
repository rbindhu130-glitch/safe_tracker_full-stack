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
if (imageInput) {
  imageInput.addEventListener("change", () => {
    if (imageInput.files && imageInput.files[0]) {
      const file = imageInput.files[0];
      if (file.type !== "application/pdf") {
        alert("🛑 Only PDF files are allowed for Aadhar Card!");
        imageInput.value = "";
        fileNameDisplay.textContent = "Select Aadhar Card (PDF Only)";
        fileNameDisplay.style.color = "#ef4444";
        return;
      }
      fileNameDisplay.textContent = file.name;
      fileNameDisplay.style.color = "var(--primary_blue)";
    } else {
      fileNameDisplay.textContent = "Select Aadhar Card (PDF)";
      fileNameDisplay.style.color = "#6b7280";
    }
  });
}

let isSigningUp = false;
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSigningUp) return;

  const signupBtn = signupForm.querySelector("button[type='submit']");
  const originalText = signupBtn.innerText;

  const formData = new FormData(signupForm);
  const mobileValue = document
    .getElementById("Mobile")
    .value.replace(/\D/g, ""); 

  if (mobileValue.length !== 10) {
    alert("Please enter a valid 10-digit mobile number!");
    return;
  }

  const roleValue = document.getElementById("role").value;
  const imageInput = document.getElementById("image");       
  const hasImage = imageInput.files && imageInput.files.length > 0;

  if (roleValue === "volunteer") {
    const addressValue = document.getElementById("address").value.trim();
    if (!addressValue) {
      alert("Please enter your address!");
      return;
    }
    if (!hasImage) {
      alert(
        "Please upload your Aadhar Card (PDF) to sign up as a volunteer!",
      );
      return;
    }
    if (imageInput.files[0].type !== "application/pdf") {
      alert("Please upload Aadhar Card in PDF format!");
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
  }

  isSigningUp = true;
  signupBtn.disabled = true;
  signupBtn.innerText = "Signing up...";

  try {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.");
    const apiBase = isLocal
      ? `http://${hostname}:8500`
      : window.location.origin;

    const response = await fetch(`${apiBase}/api/users/signup`, {
      method: "POST",
      body: formData,
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) { //e is name for the error object
      console.error("Non-JSON Response:", responseText);
      alert("🛑 Server Error: " + responseText);
      return;
    }

    if (response.ok) {
      if (roleValue === "user") {
        localStorage.setItem("user", JSON.stringify(data.user));
        alert("Welcome to SafeTracker! You are now logged in.");
        window.location.href = "user.html";
      } else {
        alert("Signup successful! Please login to your dashboard.");
        window.location.href = "login.html";
      }
    } else {
      let errMsg = "Unknown error";
      if (data && data.detail) {
        if (typeof data.detail === "string") {
          errMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errMsg = data.detail
            .map((err) => err.msg || JSON.stringify(err))
            .join(", ");
        } else {
          errMsg = JSON.stringify(data.detail);
        }
      }
      alert("Signup failed: " + errMsg);
    }
  } catch (error) {
    console.error("Connection Error:", error);
    alert("🔌 Could not connect to server. Check your connection.");
  } finally {
    isSigningUp = false;
    signupBtn.disabled = false;
    signupBtn.innerText = originalText;
  }
});
