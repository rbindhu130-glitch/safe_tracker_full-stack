// Chat Core Logic
const chat_hostname = window.location.hostname;
const chat_isLocal = chat_hostname === "127.0.0.1" || chat_hostname === "localhost" || chat_hostname.startsWith("192.168.") || chat_hostname.startsWith("10.") || chat_hostname.startsWith("172.");
const chat_apiBase = chat_isLocal ? `http://${chat_hostname}:8500` : "";
const chat_user = JSON.parse(localStorage.getItem("user"));

let currentChatIncidentId = null;
let chatPollInterval = null;
let lastMessageId = 0;
let isFetchingChat = false;

function openChat(incidentId, title, status) {
    currentChatIncidentId = incidentId;
    lastMessageId = 0; // Reset for new chat

    document.getElementById("chatTitle").innerHTML = `<i class="fas fa-comments"></i> Chat: ${title}`;
    document.getElementById("chatModal").classList.add("active");

    // Disable input if chat is closed
    const chatInput = document.getElementById("chatInput");
    const chatSubmitBtn = document.querySelector("#chatForm button[type='submit']");
    if (status === 'closed') {
        chatInput.disabled = true;
        chatSubmitBtn.disabled = true;
        chatInput.placeholder = "Incident closed. Chat is read-only.";
    } else {
        chatInput.disabled = false;
        chatSubmitBtn.disabled = false;
        chatInput.placeholder = "Type your message...";
    }

    const chatBody = document.getElementById("chatBody");
    chatBody.innerHTML = "<p id='loadingChat' style='text-align:center; color:#64748b; font-size:12px;'>Loading history...</p>";

    // Immediate fetch
    fetchChatHistory();

    // Start polling every 3 seconds
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(fetchChatHistory, 3000);
}

function closeChat() {
    if (chatPollInterval) clearInterval(chatPollInterval);
    currentChatIncidentId = null;
    document.getElementById("chatModal").classList.remove("active");
    document.getElementById("chatBody").innerHTML = "";
}

async function fetchChatHistory() {
    if (!currentChatIncidentId || isFetchingChat) return;

    isFetchingChat = true;
    try {
        const res = await fetch(`${chat_apiBase}/api/users/incidents/${currentChatIncidentId}/chat`);
        if (!res.ok) throw new Error("Failed to fetch chat");
        const messages = await res.json();

        const chatBody = document.getElementById("chatBody");
        const loadingEl = document.getElementById("loadingChat");
        if (loadingEl) loadingEl.remove();

        if (messages.length === 0 && chatBody.children.length === 0) {
            chatBody.innerHTML = "<p id='noHistoryMsg' style='text-align:center; color:#64748b; font-size:14px; margin-top:20px;'>No chat history available.</p>";
            isFetchingChat = false;
            return;
        }

        const noHistoryEls = chatBody.querySelectorAll('#noHistoryMsg');
        if (messages.length > 0 && noHistoryEls.length > 0) {
            noHistoryEls.forEach(el => el.remove());
        }

        let newMessagesFound = false;
        messages.forEach(msg => {
            if (msg.id > lastMessageId) {
                appendMessage(msg);
                lastMessageId = msg.id; // Update last processed message ID
                newMessagesFound = true;
            }
        });

        if (newMessagesFound) {
            scrollToBottom();
        }
    } catch (err) {
        console.error("Chat polling error:", err);
    } finally {
        isFetchingChat = false;
    }
}

function appendMessage(msg) {
    const chatBody = document.getElementById("chatBody");

    const div = document.createElement("div");
    const isMe = String(msg.sender_id) === String(chat_user.id);

    div.className = `message ${isMe ? 'message_sent' : 'message_received'}`;
    div.innerHTML = `
        <span class="message_info">${isMe ? 'You' : msg.sender_name}</span>
        ${msg.message}
    `;
    chatBody.appendChild(div);
}

function scrollToBottom() {
    setTimeout(() => {
        const chatBody = document.getElementById("chatBody");
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 50);
}

document.getElementById("chatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");

    if (input.disabled) return; // Prevent sending if input is disabled (chat closed)

    const msgText = input.value.trim();
    if (!msgText || !currentChatIncidentId) return;

    // Optimistic clear
    input.value = "";

    const payload = {
        message: msgText,
        incident_id: currentChatIncidentId,
        sender_id: chat_user.id
    };

    try {
        const res = await fetch(`${chat_apiBase}/api/users/incidents/${currentChatIncidentId}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Failed to send message");
        // Force an immediate poll to show the message instantly
        fetchChatHistory();
    } catch (err) {
        console.error("Error sending message:", err);
        alert("Could not send message. Please try again.");
    }
});
