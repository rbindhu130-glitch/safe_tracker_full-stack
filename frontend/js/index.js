// Home Page Navbar Logic
const navLinks = document.getElementById('navLinks');
const loggedUser = JSON.parse(localStorage.getItem("user"));

const hostname = window.location.hostname;
const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.");
const apiBase = isLocal ? `http://${hostname}:8500` : window.location.origin;

if (navLinks) {
    if (loggedUser) {
        navLinks.innerHTML += `
            <a href="index.html" class="nav_link" onclick="localStorage.removeItem('user');">Logout</a>
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

