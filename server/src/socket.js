const { Server } = require("socket.io");
const { sendNotification } = require("./services/gotify");
const db = require("./db");
const { processImage } = require("./utils/imageStorage");
const config = require("./config");

// Global click URL (can be overridden by app config if we extended it, 
// but currently clickUrl is passed in msg or falls back to global env)
const CLICK_URL = config.CLICK_URL;

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const app = config.findAppByToken(token);

    if (app) {
      // Store app info in socket session
      socket.data.app = app;
      socket.data.appId = app.id;
      next();
    } else {
      console.log(`[Socket] Unauthorized access attempt: ${socket.id}`);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { app, appId } = socket.data;
    console.log(`[Socket] Client connected: ${socket.id} (App: ${app.name})`);

    // Join room based on App ID for isolation
    socket.join(appId);

    // Handle chat messages
    socket.on("chat message", async (msg) => {
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

        // Save with App ID
        db.saveMessage(dbText, msg.source, timestamp, appId);

        // Broadcast ONLY to this App's room
        io.to(appId).emit("chat message", {
          ...finalMessage,
          timestamp: timestamp,
        });

        // Handle VS Code -> Mobile Notification
        if (msg.source === "vscode") {
          console.log(`[Socket] Message from VS Code (App: ${app.name}), triggering Gotify...`);
          const targetUrl = msg.clickUrl || CLICK_URL;
          const pushText = finalMessage.attachments
            ? "[图片]"
            : finalMessage.text;

          // Pass app config to Gotify service (异步等待)
          try {
            await sendNotification("New Reply", pushText, 8, targetUrl, app);
          } catch (notifyErr) {
            console.error('[Socket] Gotify push failed:', notifyErr.message);
          }
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
        `[Socket] Loading history (limit: ${limit}) for ${socket.id} (App: ${app.name})`,
      );
      // Load history for this App ID
      const messages = db.getRecentMessages(limit, appId);
      socket.emit("history loaded", messages);
    });

    // Handle load more history request
    socket.on("load more history", (data) => {
      try {
        const { limit = 50, beforeTimestamp } = data || {};
        console.log(
          `[Socket] Loading more history (limit: ${limit}, before: ${beforeTimestamp}) for ${socket.id} (App: ${app.name})`,
        );
        const messages = db.getRecentMessages(limit, appId, beforeTimestamp);
        socket.emit("more history loaded", { messages, hasMore: messages.length === limit });
      } catch (err) {
        console.error(`[Socket] "load more history" error:`, err);
        socket.emit("more history loaded", { messages: [], hasMore: false });
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { initSocket };
