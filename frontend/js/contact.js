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

// Dynamic logo redirect based on role
const logoLink = document.getElementById('logoLink');
if (logoLink && loggedUser) {
    if (loggedUser.role === 'volunteer') {
        logoLink.href = 'volunteer.html';
    } else if (loggedUser.role === 'user') {
        logoLink.href = 'user.html';
    }
}

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
            const hn = window.location.hostname;
            const apiBase = (hn === "127.0.0.1" || hn === "localhost" || hn.startsWith("192.168.") || hn.startsWith("10.") || hn.startsWith("172.")) ? `http://${hn}:8500` : "";
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
