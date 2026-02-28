const { Server } = require("socket.io");
const { sendNotification } = require("./services/gotify");
const db = require("./db");
const { processImage } = require("./utils/imageStorage");
const config = require("./config");
const {
  DEFAULT_AROUND_WINDOW_SIZE,
  MAX_AROUND_WINDOW_SIZE,
  QUOTE_SNIPPET_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
} = require("../../packages/chat-core/index.cjs");
const {
  SOCKET_EVENTS,
  buildAckError,
  buildAckOk,
  parseSocketClientPayload,
  parseSocketServerPayload,
} = require("../../packages/protocol/socket-events.cjs");

// Global click URL (can be overridden by app config if we extended it, 
// but currently clickUrl is passed in msg or falls back to global env)
const CLICK_URL = config.CLICK_URL;
const MAX_SEARCH_LIMIT = 100;
const VALID_CLIENT_TYPES = new Set(["mobile", "vscode", "unknown"]);

function normalizeWindowSize(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AROUND_WINDOW_SIZE;
  }
  return Math.min(parsed, MAX_AROUND_WINDOW_SIZE);
}

function normalizeSearchLimit(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SEARCH_RESULT_LIMIT;
  }
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function normalizeClientType(input) {
  const type = typeof input === "string" ? input.trim().toLowerCase() : "";
  return VALID_CLIENT_TYPES.has(type) ? type : "unknown";
}

function safeAck(ack, payload) {
  if (typeof ack === "function") {
    ack(payload);
  }
}

function parseClientPayload(event, payload) {
  return parseSocketClientPayload(event, payload);
}

function emitServerPayload(target, event, payload) {
  const validated = parseSocketServerPayload(event, payload);
  target.emit(event, validated);
}

function buildPresencePayload(io, appId) {
  const room = io.sockets.adapter.rooms.get(appId);
  if (!room || room.size === 0) {
    return { appId, total: 0, mobile: 0, vscode: 0 };
  }

  let mobile = 0;
  let vscode = 0;
  for (const socketId of room) {
    const roomSocket = io.sockets.sockets.get(socketId);
    const type = normalizeClientType(roomSocket?.data?.clientType);
    if (type === "mobile") {
      mobile += 1;
    } else if (type === "vscode") {
      vscode += 1;
    }
  }

  return { appId, total: room.size, mobile, vscode };
}

function emitPresenceUpdate(io, appId) {
  emitServerPayload(io.to(appId), SOCKET_EVENTS.PRESENCE_UPDATE, buildPresencePayload(io, appId));
}

function getMessagePreviewText(message) {
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const preview = hasAttachments ? `[图片] ${text}`.trim() : text;
  if (!preview) {
    return "(空消息)";
  }
  if (preview.length <= QUOTE_SNIPPET_MAX_LENGTH) {
    return preview;
  }
  return `${preview.slice(0, QUOTE_SNIPPET_MAX_LENGTH - 3)}...`;
}

function buildQuoteSnapshot(quoteInput, appId) {
  if (!quoteInput || typeof quoteInput !== "object") {
    return null;
  }
  const messageId = Number.parseInt(String(quoteInput.messageId ?? ""), 10);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    throw new Error("Invalid quoted message id");
  }

  const targetMessage = db.getMessageById(messageId, appId);
  if (!targetMessage || !targetMessage.id) {
    throw new Error("Quoted message not found");
  }

  return {
    messageId: targetMessage.id,
    textSnippet: getMessagePreviewText(targetMessage),
    source: targetMessage.source,
    timestamp: targetMessage.timestamp,
  };
}

function serializeMessagePayload(message) {
  if (!message.attachments && !message.quote) {
    return message.text;
  }
  return JSON.stringify({
    text: message.text,
    attachments: message.attachments,
    quote: message.quote,
  });
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB, 支持手机拍照大图传输
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const app = config.findAppByToken(token);
    const clientType = normalizeClientType(socket.handshake.auth.clientType);

    if (app) {
      // Store app info in socket session
      socket.data.app = app;
      socket.data.appId = app.id;
      socket.data.clientType = clientType;
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
    emitPresenceUpdate(io, appId);

    // Handle chat messages
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, async (msg, ack) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.CHAT_MESSAGE, msg);
        const source = request.source;
        const text = request.text;
        const hasAttachments = request.attachments && request.attachments.length > 0;
        console.log(`[Socket] Message from ${source} (App: ${app.name}): text=${text ? text.substring(0, 30) : "(empty)"}, attachments=${hasAttachments ? request.attachments.length : 0}`);

        const clientMessageId = typeof request.clientMessageId === "string" ? request.clientMessageId.trim() : "";
        let finalMessage = { text, source };
        const timestamp = Date.now();
        const quote = buildQuoteSnapshot(request.quote, appId);
        if (quote) {
          finalMessage.quote = quote;
        }

        // Process image attachments if present
        if (request.attachments && request.attachments.length > 0) {
          const processedAttachments = [];

          for (const attachment of request.attachments) {
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

        // Save with App ID
        const dbText = serializeMessagePayload(finalMessage);
        const savedMessage = db.saveMessageRecord({
          text: dbText,
          source,
          timestamp,
          appId,
          quoteMessageId: quote?.messageId ?? null,
          clientMessageId: clientMessageId || null,
        });
        if (!savedMessage || !savedMessage.id) {
          throw new Error("Failed to persist message");
        }

        // Broadcast ONLY to this App's room
        emitServerPayload(io.to(appId), SOCKET_EVENTS.CHAT_MESSAGE, savedMessage);
        safeAck(ack, buildAckOk({
          clientMessageId: clientMessageId || null,
          message: savedMessage,
        }));

        // Handle VS Code -> Mobile Notification
        if (source === "vscode") {
          // 重新读取最新配置，避免使用连接时缓存的旧对象（Admin 面板更新后 token 可能已变）
          const latestApp = config.findAppById(appId) || app;
          console.log(`[Socket] Message from VS Code (App: ${latestApp.name}), triggering Gotify...`);
          const targetUrl = latestApp.clickUrl || request.clickUrl || CLICK_URL;
          const priority = latestApp.gotifyPriority ?? 10;
          const pushText = savedMessage.attachments
            ? "[图片]"
            : (savedMessage.text || savedMessage.quote?.textSnippet || "(空消息)");

          // Push notification is fire-and-forget and must not block message delivery.
          void sendNotification("New Reply", pushText, priority, targetUrl, latestApp);
        }
      } catch (error) {
        console.error("[Socket] Error processing message:", error);
        safeAck(ack, buildAckError(
          "CHAT_MESSAGE_FAILED",
          error.message || "Failed to process message",
          { clientMessageId: typeof msg?.clientMessageId === "string" ? msg.clientMessageId : null },
        ));
        socket.emit("error", {
          message: error.message || "Failed to process message",
        });
      }
    });

    // Handle history loading request
    socket.on(SOCKET_EVENTS.LOAD_HISTORY, (limit = 50) => {
      try {
        const safeLimit = parseClientPayload(SOCKET_EVENTS.LOAD_HISTORY, limit);
        console.log(
          `[Socket] Loading history (limit: ${safeLimit}) for ${socket.id} (App: ${app.name})`,
        );
        const messages = db.getRecentMessages(safeLimit, appId);
        emitServerPayload(socket, SOCKET_EVENTS.HISTORY_LOADED, messages);
      } catch (error) {
        console.error(`[Socket] "load history" error:`, error);
        emitServerPayload(socket, SOCKET_EVENTS.HISTORY_LOADED, []);
      }
    });

    // Handle load more history request
    socket.on(SOCKET_EVENTS.LOAD_MORE_HISTORY, (data) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.LOAD_MORE_HISTORY, data);
        const { limit, beforeTimestamp } = request;
        console.log(
          `[Socket] Loading more history (limit: ${limit}, before: ${beforeTimestamp}) for ${socket.id} (App: ${app.name})`,
        );
        const messages = db.getRecentMessages(limit, appId, beforeTimestamp);
        emitServerPayload(socket, SOCKET_EVENTS.MORE_HISTORY_LOADED, {
          messages,
          hasMore: messages.length === limit,
        });
      } catch (err) {
        console.error(`[Socket] "load more history" error:`, err);
        emitServerPayload(socket, SOCKET_EVENTS.MORE_HISTORY_LOADED, { messages: [], hasMore: false });
      }
    });

    socket.on(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, (data) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, data);
        const targetMessageId = Number.parseInt(String(request.targetMessageId ?? ""), 10);
        if (!Number.isFinite(targetMessageId) || targetMessageId <= 0) {
          emitServerPayload(socket, SOCKET_EVENTS.AROUND_MESSAGE_LOADED, {
            messages: [],
            targetMessageId: null,
            error: "Invalid target message id",
          });
          return;
        }

        const targetMessage = db.getMessageById(targetMessageId, appId);
        if (!targetMessage) {
          emitServerPayload(socket, SOCKET_EVENTS.AROUND_MESSAGE_LOADED, {
            messages: [],
            targetMessageId,
            error: "Target message not found",
          });
          return;
        }

        const windowSize = normalizeWindowSize(request.windowSize);
        const messages = db.getMessagesAroundMessage(targetMessageId, appId, windowSize, windowSize);
        emitServerPayload(socket, SOCKET_EVENTS.AROUND_MESSAGE_LOADED, {
          messages,
          targetMessageId,
          error: null,
        });
      } catch (error) {
        console.error(`[Socket] "load around message" error:`, error);
        emitServerPayload(socket, SOCKET_EVENTS.AROUND_MESSAGE_LOADED, {
          messages: [],
          targetMessageId: null,
          error: error.message || "Failed to load message context",
        });
      }
    });

    socket.on(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, (data) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, data);
        const targetArchiveId = Number.parseInt(String(request.targetArchiveId ?? ""), 10);
        if (!Number.isFinite(targetArchiveId) || targetArchiveId <= 0) {
          emitServerPayload(socket, SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, {
            messages: [],
            targetArchiveId: null,
            error: "Invalid target archive id",
          });
          return;
        }

        const windowSize = normalizeWindowSize(request.windowSize);
        const messages = db.getArchivedMessagesAround(targetArchiveId, appId, windowSize, windowSize);
        if (messages.length === 0) {
          emitServerPayload(socket, SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, {
            messages: [],
            targetArchiveId,
            error: "Target archive message not found",
          });
          return;
        }
        emitServerPayload(socket, SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, {
          messages,
          targetArchiveId,
          error: null,
        });
      } catch (error) {
        console.error(`[Socket] "load around archived message" error:`, error);
        emitServerPayload(socket, SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, {
          messages: [],
          targetArchiveId: null,
          error: error.message || "Failed to load archived context",
        });
      }
    });

    socket.on(SOCKET_EVENTS.SEARCH_MESSAGES, (data, ack) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.SEARCH_MESSAGES, data);
        const keyword = request.keyword.trim();
        if (!keyword) {
          safeAck(ack, buildAckError("SEARCH_KEYWORD_REQUIRED", "Keyword is required"));
          return;
        }
        const limit = normalizeSearchLimit(request.limit);
        const results = db.searchMessages({ appId, keyword, limit });
        safeAck(ack, buildAckOk({ results, keyword, limit }));
      } catch (error) {
        console.error(`[Socket] "search messages" error:`, error);
        safeAck(ack, buildAckError("SEARCH_FAILED", error.message || "Search failed"));
      }
    });

    socket.on(SOCKET_EVENTS.MARK_READ, (data) => {
      try {
        const request = parseClientPayload(SOCKET_EVENTS.MARK_READ, data);
        const lastReadTimestamp = Number.parseInt(String(request.lastReadTimestamp ?? ""), 10);
        if (!Number.isFinite(lastReadTimestamp) || lastReadTimestamp <= 0) {
          return;
        }
        const lastReadMessageId = Number.parseInt(String(request.lastReadMessageId ?? ""), 10);
        const payload = {
          appId,
          clientType: normalizeClientType(request.clientType || socket.data.clientType),
          lastReadTimestamp,
          lastReadMessageId: Number.isFinite(lastReadMessageId) && lastReadMessageId > 0
            ? lastReadMessageId
            : null,
        };
        emitServerPayload(socket.to(appId), SOCKET_EVENTS.READ_RECEIPT, payload);
      } catch (error) {
        console.error(`[Socket] "mark read" error:`, error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      emitPresenceUpdate(io, appId);
    });
  });

  return io;
}

module.exports = { initSocket };
