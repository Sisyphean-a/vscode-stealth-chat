const { Server } = require("socket.io");
const { sendNotification } = require("./services/gotify");
const db = require("./db");

const CHAT_SECRET = process.env.STEALTH_SECRET || "ChangeMeInProduction";
// External URL for the phone to open when clicking notification
const CLICK_URL = process.env.CLICK_URL || "http://localhost:3000";

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token === CHAT_SECRET) {
      next();
    } else {
      console.log(`[Socket] Unauthorized access attempt: ${socket.id}`);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Handle chat messages
    socket.on("chat message", (msg) => {
      // Save message to database
      const timestamp = Date.now();
      db.saveMessage(msg.text, msg.source, timestamp);

      // Broadcast to all clients (VS Code & Mobile) with timestamp
      io.emit("chat message", {
        ...msg,
        timestamp: timestamp,
      });

      // Handle VS Code -> Mobile Notification
      if (msg.source === "vscode") {
        console.log("[Socket] Message from VS Code, triggering Gotify...");
        const targetUrl = msg.clickUrl || CLICK_URL;
        sendNotification("New Reply", msg.text, 8, targetUrl);
      }
    });

    // Handle history loading request
    socket.on("load history", (limit = 50) => {
      console.log(
        `[Socket] Loading history (limit: ${limit}) for ${socket.id}`,
      );
      const messages = db.getRecentMessages(limit);
      socket.emit("history loaded", messages);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { initSocket };
