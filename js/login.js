const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);

    try {
        const response = await fetch("/api/users/login", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            alert("Login successful!");
            localStorage.setItem("user", JSON.stringify(data.user));

            if (data.user.role === "volunteer") {
                window.location.href = "volunteer.html";
            } else {
                window.location.href = "user.html";
            }
        } else {
            alert("Login failed: " + (data.detail || "Invalid credentials"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Could not connect to server. Make sure backend is running.");
    }
});
