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
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB, 支持手机拍照大图传输
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
        const hasAttachments = msg.attachments && msg.attachments.length > 0;
        console.log(`[Socket] Message from ${msg.source} (App: ${app.name}): text=${msg.text ? msg.text.substring(0, 30) : '(empty)'}, attachments=${hasAttachments ? msg.attachments.length : 0}`);

        let finalMessage = { ...msg };
        const timestamp = Date.now();

        // Process image attachments if present
        if (msg.attachments && msg.attachments.length > 0) {
          const processedAttachments = [];

          for (const attachment of msg.attachments) {
            if (attachment.type === "image") {
              try {
                // 已通过 HTTP 上传的图片（已有 url 或处理后的 data），直接使用
                if (attachment.url || (attachment.data && !attachment.data.startsWith("data:"))) {
                  processedAttachments.push({
                    type: "image",
                    data: attachment.data,
                    url: attachment.url,
                    filename: attachment.filename,
                    size: attachment.size,
                  });
                  continue;
                }

                // Fallback: 通过 socket 传输的 base64 图片，服务端处理
                let base64Data = attachment.data;
                if (base64Data && base64Data.startsWith("data:")) {
                  base64Data = base64Data.split(",")[1];
                }

                const result = await processImage(
                  base64Data,
                  attachment.mimeType || "image/png",
                  attachment.filename || "image.png",
                );

                processedAttachments.push({
                  type: "image",
                  data: result.data,
                  url: result.url,
                  filename: attachment.filename,
                  size: result.size,
                });
              } catch (imgErr) {
                console.error(`[Socket] Failed to process image ${attachment.filename}:`, imgErr.message);
              }
            }
          }

          finalMessage.attachments = processedAttachments.length > 0
            ? processedAttachments
            : undefined;
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
          // 重新读取最新配置，避免使用连接时缓存的旧对象（Admin 面板更新后 token 可能已变）
          const latestApp = config.findAppById(appId) || app;
          console.log(`[Socket] Message from VS Code (App: ${latestApp.name}), triggering Gotify...`);
          const targetUrl = latestApp.clickUrl || msg.clickUrl || CLICK_URL;
          const priority = latestApp.gotifyPriority ?? 10;
          const pushText = finalMessage.attachments
            ? "[图片]"
            : finalMessage.text;

          // Push notification is fire-and-forget and must not block message delivery.
          void sendNotification("New Reply", pushText, priority, targetUrl, latestApp);
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
