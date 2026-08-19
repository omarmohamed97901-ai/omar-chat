require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const db = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ---------- helpers ----------

function uid() {
  return crypto.randomUUID();
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const AVATAR_COLORS = ["#00b894", "#0984e3", "#e17055", "#6c5ce7", "#e84393", "#00cec9", "#fdcb6e"];
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, lastSeen: u.lastSeen };
}

function isParticipant(userId, conversationId) {
  return db
    .prepare("SELECT 1 FROM conversation_participants WHERE userId = ? AND conversationId = ?")
    .get(userId, conversationId);
}

// ---------- auth routes ----------

app.post("/api/register", (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: "username, password, displayName are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return res.status(409).json({ error: "Username already taken" });

    const passwordHash = bcrypt.hashSync(password, 10);
    const id = uid();
    db.prepare(
      "INSERT INTO users (id, username, displayName, passwordHash, avatarColor) VALUES (?, ?, ?, ?, ?)"
    ).run(id, username, displayName, passwordHash, randomColor());

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid username or password" });

    db.prepare("UPDATE users SET lastSeen = datetime('now') WHERE id = ?").run(user.id);

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ---------- users ----------

app.get("/api/users", authMiddleware, (req, res) => {
  const users = db
    .prepare("SELECT * FROM users WHERE id != ? ORDER BY displayName ASC")
    .all(req.user.id)
    .map(publicUser);
  res.json(users);
});

// ---------- conversations ----------

app.get("/api/conversations", authMiddleware, (req, res) => {
  const convRows = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN conversation_participants cp ON cp.conversationId = c.id
       WHERE cp.userId = ?`
    )
    .all(req.user.id);

  const conversations = convRows.map((conv) => {
    const otherParticipants = db
      .prepare(
        `SELECT u.id, u.displayName, u.avatarColor FROM users u
         JOIN conversation_participants cp ON cp.userId = u.id
         WHERE cp.conversationId = ? AND cp.userId != ?`
      )
      .all(conv.id, req.user.id);

    const lastMessage = db
      .prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt DESC LIMIT 1")
      .get(conv.id);

    return {
      id: conv.id,
      isGroup: !!conv.isGroup,
      name: conv.isGroup ? conv.name : otherParticipants[0]?.displayName || "Unknown",
      avatarColor: conv.isGroup ? "#636e72" : otherParticipants[0]?.avatarColor || "#636e72",
      participants: otherParticipants,
      lastMessage: lastMessage
        ? { content: lastMessage.content, createdAt: lastMessage.createdAt, senderId: lastMessage.senderId }
        : null,
      updatedAt: lastMessage?.createdAt || conv.createdAt,
    };
  });

  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(conversations);
});

app.post("/api/conversations/direct", authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.user.id) return res.status(400).json({ error: "Invalid target user" });

  const existing = db
    .prepare(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants cp1 ON cp1.conversationId = c.id AND cp1.userId = ?
       JOIN conversation_participants cp2 ON cp2.conversationId = c.id AND cp2.userId = ?
       WHERE c.isGroup = 0`
    )
    .get(req.user.id, userId);

  if (existing) return res.json({ id: existing.id });

  const convId = uid();
  try {
    db.exec("BEGIN");
    db.prepare("INSERT INTO conversations (id, isGroup, name) VALUES (?, 0, NULL)").run(convId);
    db.prepare("INSERT INTO conversation_participants (id, userId, conversationId) VALUES (?, ?, ?)").run(
      uid(),
      req.user.id,
      convId
    );
    db.prepare("INSERT INTO conversation_participants (id, userId, conversationId) VALUES (?, ?, ?)").run(
      uid(),
      userId,
      convId
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.json({ id: convId });
});

app.post("/api/conversations/group", authMiddleware, (req, res) => {
  const { name, userIds } = req.body;
  if (!name || !Array.isArray(userIds) || userIds.length < 1) {
    return res.status(400).json({ error: "name and at least one other userId are required" });
  }
  const allIds = Array.from(new Set([req.user.id, ...userIds]));
  const convId = uid();

  try {
    db.exec("BEGIN");
    db.prepare("INSERT INTO conversations (id, isGroup, name) VALUES (?, 1, ?)").run(convId, name);
    const insertParticipant = db.prepare(
      "INSERT INTO conversation_participants (id, userId, conversationId) VALUES (?, ?, ?)"
    );
    for (const userId of allIds) insertParticipant.run(uid(), userId, convId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.json({ id: convId });
});

app.get("/api/conversations/:id/messages", authMiddleware, (req, res) => {
  const { id } = req.params;
  if (!isParticipant(req.user.id, id)) {
    return res.status(403).json({ error: "Not a participant of this conversation" });
  }

  const messages = db
    .prepare(
      `SELECT m.*, u.displayName as senderDisplayName, u.avatarColor as senderAvatarColor
       FROM messages m JOIN users u ON u.id = m.senderId
       WHERE m.conversationId = ? ORDER BY m.createdAt ASC LIMIT 200`
    )
    .all(id)
    .map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt,
      sender: { id: m.senderId, displayName: m.senderDisplayName, avatarColor: m.senderAvatarColor },
    }));

  res.json(messages);
});

// ---------- socket.io realtime ----------

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token"));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(`socket connected: ${socket.user.username}`);

  socket.on("joinConversation", (conversationId) => {
    if (!isParticipant(socket.user.id, conversationId)) return;
    socket.join(conversationId);
  });

  socket.on("leaveConversation", (conversationId) => {
    socket.leave(conversationId);
  });

  socket.on("sendMessage", ({ conversationId, content }, ack) => {
    try {
      if (!content || !content.trim()) return;
      if (!isParticipant(socket.user.id, conversationId)) return;

      const id = uid();
      db.prepare(
        "INSERT INTO messages (id, conversationId, senderId, content) VALUES (?, ?, ?, ?)"
      ).run(id, conversationId, socket.user.id, content.trim());

      const row = db
        .prepare(
          `SELECT m.*, u.displayName as senderDisplayName, u.avatarColor as senderAvatarColor
           FROM messages m JOIN users u ON u.id = m.senderId WHERE m.id = ?`
        )
        .get(id);

      const message = {
        id: row.id,
        conversationId: row.conversationId,
        senderId: row.senderId,
        content: row.content,
        createdAt: row.createdAt,
        sender: { id: row.senderId, displayName: row.senderDisplayName, avatarColor: row.senderAvatarColor },
      };

      io.to(conversationId).emit("newMessage", message);
      if (ack) ack({ ok: true, message });
    } catch (err) {
      console.error(err);
      if (ack) ack({ ok: false, error: "Failed to send message" });
    }
  });

  socket.on("typing", ({ conversationId }) => {
    socket.to(conversationId).emit("typing", { conversationId, userId: socket.user.id, username: socket.user.username });
  });

  socket.on("disconnect", () => {
    console.log(`socket disconnected: ${socket.user.username}`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat app running on http://localhost:${PORT}`);
});
