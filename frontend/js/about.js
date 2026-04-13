// Helper to get API Base URL
const hostname = window.location.hostname;
const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.");
const apiBase = isLocal ? `http://${hostname}:8500` : "";

// Navbar Dynamic Logic
const navLinks = document.getElementById('navLinks');
const loggedUser = JSON.parse(localStorage.getItem("user"));

if (navLinks) {
    if (loggedUser) {
        navLinks.innerHTML += `
            <a href="../index.html" class="nav_link" onclick="localStorage.removeItem('user')">Logout</a>
        `;
    } else {
        navLinks.innerHTML += `
            <a href="login.html" class="nav_link">Login</a>
            <a href="signup.html" class="nav_link">Sign Up</a>
        `;
    }
}
