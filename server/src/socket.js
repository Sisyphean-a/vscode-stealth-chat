const { Server } = require("socket.io");
const { sendNotification } = require("./services/gotify");
const db = require("./db");
const { processImage } = require("./utils/imageStorage");

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
      try {
        let finalMessage = { ...msg };
        const timestamp = Date.now();

        // Process image attachments if present
        if (msg.attachments && msg.attachments.length > 0) {
          const processedAttachments = [];

          for (let attachment of msg.attachments) {
            if (attachment.type === "image") {
              // Extract base64 data (remove data URL prefix if present)
              let base64Data = attachment.data;
              if (base64Data && base64Data.startsWith("data:")) {
                base64Data = base64Data.split(",")[1];
              }

              // Process image (returns inline data URL or file URL)
              const result = processImage(
                base64Data,
                attachment.mimeType || "image/png",
                attachment.filename || "image.png",
              );

              processedAttachments.push({
                type: "image",
                data: result.data, // inline images (Base64)
                url: result.url, // file images (URL)
                filename: attachment.filename,
                size: result.size,
              });
            }
          }

          finalMessage.attachments = processedAttachments;
        }

        // Save to database (JSON serialize if has attachments)
        const dbText = finalMessage.attachments
          ? JSON.stringify({
              text: finalMessage.text,
              attachments: finalMessage.attachments,
            })
          : finalMessage.text;

        db.saveMessage(dbText, msg.source, timestamp);

        // Broadcast to all clients with timestamp
        io.emit("chat message", {
          ...finalMessage,
          timestamp: timestamp,
        });

        // Handle VS Code -> Mobile Notification
        if (msg.source === "vscode") {
          console.log("[Socket] Message from VS Code, triggering Gotify...");
          const targetUrl = msg.clickUrl || CLICK_URL;
          const pushText = finalMessage.attachments
            ? "[图片]"
            : finalMessage.text;
          sendNotification("New Reply", pushText, 8, targetUrl);
        }
      } catch (error) {
        console.error("[Socket] Error processing message:", error);
        socket.emit("error", {
          message: error.message || "Failed to process message",
        });
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
