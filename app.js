const API = ""; // same origin

let token = localStorage.getItem("chat_token") || null;
let me = JSON.parse(localStorage.getItem("chat_me") || "null");
let socket = null;
let activeConversationId = null;
let conversationsCache = [];
let typingTimeout = null;

// ---------- helpers ----------

function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------- auth screen ----------

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

tabLogin.onclick = () => {
  tabLogin.classList.add("active"); tabRegister.classList.remove("active");
  loginForm.classList.remove("hidden"); registerForm.classList.add("hidden");
};
tabRegister.onclick = () => {
  tabRegister.classList.add("active"); tabLogin.classList.remove("active");
  registerForm.classList.remove("hidden"); loginForm.classList.add("hidden");
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
    onAuthSuccess(data);
  } catch (err) {
    document.getElementById("loginError").textContent = err.message;
  }
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("regUsername").value.trim();
  const displayName = document.getElementById("regDisplayName").value.trim();
  const password = document.getElementById("regPassword").value;
  try {
    const data = await api("/api/register", { method: "POST", body: JSON.stringify({ username, displayName, password }) });
    onAuthSuccess(data);
  } catch (err) {
    document.getElementById("registerError").textContent = err.message;
  }
};

function onAuthSuccess(data) {
  token = data.token;
  me = data.user;
  localStorage.setItem("chat_token", token);
  localStorage.setItem("chat_me", JSON.stringify(me));
  showChatScreen();
}

document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem("chat_token");
  localStorage.removeItem("chat_me");
  location.reload();
};

// ---------- chat screen boot ----------

function showChatScreen() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("chatScreen").classList.remove("hidden");
  document.getElementById("meName").textContent = me.displayName;
  const meAvatar = document.getElementById("meAvatar");
  meAvatar.textContent = initials(me.displayName);
  meAvatar.style.background = me.avatarColor;

  connectSocket();
  loadConversations();
}

function connectSocket() {
  socket = io({ auth: { token } });

  socket.on("newMessage", (message) => {
    if (message.conversationId === activeConversationId) {
      renderMessage(message);
      scrollMessagesToBottom();
    }
    loadConversations(); // refresh previews/order
  });

  socket.on("typing", ({ conversationId, username }) => {
    if (conversationId !== activeConversationId) return;
    const el = document.getElementById("typingIndicator");
    el.textContent = `${username} بيكتب...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => (el.textContent = ""), 2000);
  });
}

// ---------- conversations ----------

async function loadConversations() {
  conversationsCache = await api("/api/conversations");
  renderConversationList();
}

function renderConversationList() {
  const list = document.getElementById("conversationList");
  list.innerHTML = "";
  if (conversationsCache.length === 0) {
    list.innerHTML = `<div style="padding:16px;color:#888;font-size:13px;">مفيش محادثات لسه. ابدأ واحدة!</div>`;
    return;
  }
  for (const conv of conversationsCache) {
    const item = document.createElement("div");
    item.className = "conversation-item" + (conv.id === activeConversationId ? " active" : "");
    const preview = conv.lastMessage
      ? (conv.lastMessage.senderId === me.id ? "انت: " : "") + conv.lastMessage.content
      : "لسه مفيش رسايل";
    item.innerHTML = `
      <span class="avatar" style="background:${conv.avatarColor}">${conv.isGroup ? "👥" : initials(conv.name)}</span>
      <div class="info">
        <div class="name">${escapeHtml(conv.name)}</div>
        <div class="preview">${escapeHtml(preview)}</div>
      </div>
    `;
    item.onclick = () => openConversation(conv);
    list.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function openConversation(conv) {
  if (activeConversationId) socket.emit("leaveConversation", activeConversationId);
  activeConversationId = conv.id;
  socket.emit("joinConversation", activeConversationId);

  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("chatPane").classList.remove("hidden");
  document.getElementById("chatTitle").textContent = conv.name;
  const chatAvatar = document.getElementById("chatAvatar");
  chatAvatar.textContent = conv.isGroup ? "👥" : initials(conv.name);
  chatAvatar.style.background = conv.avatarColor;

  renderConversationList();

  const messages = await api(`/api/conversations/${conv.id}/messages`);
  const container = document.getElementById("messagesContainer");
  container.innerHTML = "";
  for (const m of messages) renderMessage(m);
  scrollMessagesToBottom();
}

function renderMessage(message) {
  const container = document.getElementById("messagesContainer");
  const mine = message.senderId === me.id || message.sender?.id === me.id;
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "theirs");
  const senderName = message.sender?.displayName || "";
  div.innerHTML = `
    ${!mine ? `<div class="sender">${escapeHtml(senderName)}</div>` : ""}
    <div>${escapeHtml(message.content)}</div>
    <div class="time">${formatTime(message.createdAt)}</div>
  `;
  container.appendChild(div);
}

function scrollMessagesToBottom() {
  const container = document.getElementById("messagesContainer");
  container.scrollTop = container.scrollHeight;
}

// ---------- sending messages ----------

document.getElementById("messageForm").onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const content = input.value.trim();
  if (!content || !activeConversationId) return;
  socket.emit("sendMessage", { conversationId: activeConversationId, content });
  input.value = "";
};

document.getElementById("messageInput").addEventListener("input", () => {
  if (activeConversationId) socket.emit("typing", { conversationId: activeConversationId });
});

// ---------- new direct chat modal ----------

document.getElementById("newDirectBtn").onclick = async () => {
  const users = await api("/api/users");
  const list = document.getElementById("userList");
  list.innerHTML = "";
  if (users.length === 0) {
    list.innerHTML = `<div style="color:#888;font-size:13px;">مفيش يوزرز تانيين متسجلين لسه</div>`;
  }
  for (const u of users) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `<span class="avatar" style="background:${u.avatarColor}">${initials(u.displayName)}</span> ${escapeHtml(u.displayName)}`;
    row.onclick = async () => {
      const { id } = await api("/api/conversations/direct", { method: "POST", body: JSON.stringify({ userId: u.id }) });
      closeModal("directModal");
      await loadConversations();
      const conv = conversationsCache.find((c) => c.id === id);
      if (conv) openConversation(conv);
    };
    list.appendChild(row);
  }
  document.getElementById("directModal").classList.remove("hidden");
};

// ---------- new group modal ----------

document.getElementById("newGroupBtn").onclick = async () => {
  const users = await api("/api/users");
  const list = document.getElementById("groupUserList");
  list.innerHTML = "";
  document.getElementById("groupName").value = "";
  for (const u of users) {
    const row = document.createElement("label");
    row.className = "user-row";
    row.innerHTML = `
      <span class="avatar" style="background:${u.avatarColor}">${initials(u.displayName)}</span>
      ${escapeHtml(u.displayName)}
      <input type="checkbox" value="${u.id}" />
    `;
    list.appendChild(row);
  }
  document.getElementById("groupModal").classList.remove("hidden");
};

document.getElementById("createGroupBtn").onclick = async () => {
  const name = document.getElementById("groupName").value.trim();
  const checked = [...document.querySelectorAll("#groupUserList input:checked")].map((c) => c.value);
  if (!name || checked.length === 0) {
    alert("لازم اسم للجروب واختيار شخص واحد على الأقل");
    return;
  }
  const { id } = await api("/api/conversations/group", { method: "POST", body: JSON.stringify({ name, userIds: checked }) });
  closeModal("groupModal");
  await loadConversations();
  const conv = conversationsCache.find((c) => c.id === id);
  if (conv) openConversation(conv);
};

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
document.querySelectorAll(".closeModal").forEach((btn) => {
  btn.onclick = () => closeModal(btn.dataset.modal);
});

// ---------- boot ----------

if (token && me) {
  showChatScreen();
}
