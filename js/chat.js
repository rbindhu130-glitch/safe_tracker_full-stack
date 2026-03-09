// Chat Core Logic
let chatSocket = null;
let currentChatIncidentId = null;

function openChat(incidentId, title) {
    currentChatIncidentId = incidentId;

    document.getElementById("chatTitle").innerHTML = `<i class="fas fa-comments"></i> Chat: ${title}`;
    document.getElementById("chatModal").classList.add("active");
    document.getElementById("chatBody").innerHTML = "<p style='text-align:center; color:#64748b; font-size:12px;'>Connecting...</p>";

    // Load history
    fetch(`${apiBase}/api/users/incidents/${incidentId}/chat`)
        .then(res => res.json())
        .then(messages => {
            document.getElementById("chatBody").innerHTML = "";
            messages.forEach(msg => appendMessage(msg));
            setTimeout(scrollToBottom, 100);
        });

    // WebSocket Connection
    // Replace http/https with ws/wss
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = isLocal ? `${hostname}:8500` : window.location.host;

    if (chatSocket) chatSocket.close();

    // Connect with the persistent user.id from the global variable
    chatSocket = new WebSocket(`${wsProto}//${wsHost}/ws/chat/${incidentId}/${user.id}`);

    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        appendMessage(msg);
        scrollToBottom();
    };

    chatSocket.onclose = () => console.log("Chat disconnected");
    chatSocket.onerror = (err) => console.error("Chat error", err);
}

function closeChat() {
    if (chatSocket) chatSocket.close();
    document.getElementById("chatModal").classList.remove("active");
    document.getElementById("chatBody").innerHTML = "";
}

function appendMessage(msg) {
    const chatBody = document.getElementById("chatBody");
    const div = document.createElement("div");

    // Use the global 'user' variable loaded at page start
    // This prevents shared localStorage bugs if user opens two tabs
    const isMe = String(msg.sender_id) === String(user.id);

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
    if (input.value.trim() && chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ message: input.value.trim() }));
        input.value = "";
    }
});
