const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);

    try {
        const hostname = window.location.hostname;
        const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.");
        const apiBase = isLocal ? `http://${hostname}:8501` : window.location.origin;

        const response = await fetch(`${apiBase}/api/users/login`, {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            alert("Login successful!");
            localStorage.setItem("user", JSON.stringify(data.user));

            if (data.user.role === "admin") {
                window.location.href = "admin.html";
            } else if (data.user.role === "volunteer") {
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
