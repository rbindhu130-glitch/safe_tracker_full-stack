// Chat Core Logic
const chat_hostname = window.location.hostname;
const chat_isLocal = chat_hostname === "127.0.0.1" || chat_hostname === "localhost" || chat_hostname.startsWith("192.168.") || chat_hostname.startsWith("10.") || chat_hostname.startsWith("172.");
const chat_apiBase = chat_isLocal ? `http://${chat_hostname}:8501` : "";
const chat_user = JSON.parse(localStorage.getItem("user"));

let chatSocket = null;
let currentChatIncidentId = null;

function openChat(incidentId, title) {
    currentChatIncidentId = incidentId;

    document.getElementById("chatTitle").innerHTML = `<i class="fas fa-comments"></i> Chat: ${title}`;
    document.getElementById("chatModal").classList.add("active");
    document.getElementById("chatBody").innerHTML = "<p style='text-align:center; color:#64748b; font-size:12px;'>Connecting...</p>";

    // Load history
    fetch(`${chat_apiBase}/api/users/incidents/${incidentId}/chat`)
        .then(res => res.json())
        .then(messages => {
            const chatBody = document.getElementById("chatBody");
            chatBody.innerHTML = "";
            if (messages.length === 0) {
                chatBody.innerHTML = "<p style='text-align:center; color:#64748b; font-size:14px; margin-top:20px;'>No chat history available.</p>";
            } else {
                messages.forEach(msg => appendMessage(msg));
                setTimeout(scrollToBottom, 100);
            }
        });

    // WebSocket Connection
    // Replace http/https with ws/wss
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = chat_isLocal ? `${chat_hostname}:8501` : window.location.host;

    if (chatSocket) chatSocket.close();

    // Connect with the persistent user.id from the local variable
    chatSocket = new WebSocket(`${wsProto}//${wsHost}/ws/chat/${incidentId}/${chat_user.id}`);

    chatSocket.onopen = () => {
        console.log("WebSocket connected to incident:", incidentId);
        document.getElementById("chatBody").innerHTML += "<p style='text-align:center; color:#10b981; font-size:10px;'>Connected</p>";
    };

    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log("WebSocket message received:", msg);
        appendMessage(msg);
        scrollToBottom();
    };

    chatSocket.onclose = (event) => {
        console.log("Chat disconnected", event);
        document.getElementById("chatBody").innerHTML += `<p style='text-align:center; color:#ef4444; font-size:10px;'>Disconnected (Code: ${event.code})</p>`;
    };
    chatSocket.onerror = (err) => console.error("Chat error", err);
}

function closeChat() {
    if (chatSocket) chatSocket.close();
    document.getElementById("chatModal").classList.remove("active");
    document.getElementById("chatBody").innerHTML = "";
}

function appendMessage(msg) {
    const chatBody = document.getElementById("chatBody");

    // Clear "No chat history" placeholder if it exists
    if (chatBody.innerHTML.includes("No chat history available.")) {
        chatBody.innerHTML = "";
    }

    const div = document.createElement("div");

    // Use the global 'user' variable loaded at page start
    // This prevents shared localStorage bugs if user opens two tabs
    const isMe = String(msg.sender_id) === String(chat_user.id);

    div.className = `message ${isMe ? 'message_sent' : 'message_received'}`;
    div.innerHTML = `
        <span class="message_info">${isMe ? 'You' : msg.sender_name}</span>
        ${msg.message}
    `;
    chatBody.appendChild(div);
}

function scrollToBottom() {
    const chatBody = document.getElementById("chatBody");
    chatBody.scrollTop = chatBody.scrollHeight;
}

document.getElementById("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    console.log("Chat form submitted. Message:", input.value.trim());

    if (!input.value.trim()) return;

    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        console.error("Chat Socket is not open! Current state:", chatSocket ? chatSocket.readyState : "null");
        alert("Chat connection is lost. Opening again...");
        openChat(currentChatIncidentId, document.getElementById("chatTitle").innerText.replace(" Chat: ", ""));
        return;
    }

    try {
        const payload = JSON.stringify({ message: input.value.trim() });
        console.log("Sending payload:", payload);
        chatSocket.send(payload);
        input.value = "";
    } catch (err) {
        console.error("Error sending message:", err);
    }
});
