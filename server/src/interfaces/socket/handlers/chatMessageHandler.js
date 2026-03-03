const { QUOTE_SNIPPET_MAX_LENGTH } = require("../../../../../packages/chat-core/index.cjs");
const {
  SOCKET_EVENTS,
  buildAckError,
  buildAckOk,
} = require("../../../../../packages/protocol/socket-events.cjs");

function buildMessagePreviewText(message) {
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

function buildQuoteSnapshot(db, quoteInput, appId) {
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
    textSnippet: buildMessagePreviewText(targetMessage),
    source: targetMessage.source,
    timestamp: targetMessage.timestamp,
  };
}

function serializeMessagePayload(message) {
  const payload = { text: message.text };
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    payload.attachments = message.attachments;
  }
  if (message.quote) {
    payload.quote = message.quote;
  }
  return JSON.stringify(payload);
}

async function processAttachments(attachments, processImage) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  const processed = [];
  for (const attachment of attachments) {
    if (attachment?.type !== "image") {
      continue;
    }
    const next = await processAttachmentImage(attachment, processImage);
    if (next) {
      processed.push(next);
    }
  }

  return processed.length > 0 ? processed : undefined;
}

async function processAttachmentImage(attachment, processImage) {
  try {
    if (attachment.url || (attachment.data && !attachment.data.startsWith("data:"))) {
      return {
        type: "image",
        data: attachment.data,
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
      };
    }

    let base64Data = attachment.data;
    if (base64Data?.startsWith("data:")) {
      const segments = base64Data.split(",");
      base64Data = segments.length > 1 ? segments[1] : "";
    }

    const result = await processImage(
      base64Data,
      attachment.mimeType || "image/png",
      attachment.filename || "image.png",
    );

    return {
      type: "image",
      data: result.data,
      url: result.url,
      filename: attachment.filename,
      size: result.size,
    };
  } catch (error) {
    const filename = attachment?.filename || "unknown";
    console.error(`[Socket] Failed to process image ${filename}:`, error.message);
    return null;
  }
}

function readAckClientMessageId(rawMessage) {
  const clientMessageId = rawMessage?.payload?.clientMessageId;
  return typeof clientMessageId === "string" ? clientMessageId : null;
}

function logIncomingMessage(app, request) {
  const source = request.source;
  const text = request.text;
  const hasAttachments = Array.isArray(request.attachments) && request.attachments.length > 0;
  console.log(
    `[Socket] Message from ${source} (App: ${app.name}): text=${text ? text.substring(0, 30) : "(empty)"}, attachments=${hasAttachments ? request.attachments.length : 0}`,
  );
}

async function buildFinalMessagePayload(options) {
  const { db, appId, request, processImage } = options;
  const quote = buildQuoteSnapshot(db, request.quote, appId);
  const finalMessage = {
    text: request.text,
    source: request.source,
    attachments: await processAttachments(request.attachments, processImage),
  };
  if (quote) {
    finalMessage.quote = quote;
  }
  return { quote, finalMessage };
}

function persistMessage(options) {
  const { db, appId, request, quote, finalMessage } = options;
  const clientMessageId = request.clientMessageId.trim();
  const savedMessage = db.saveMessageRecord({
    text: serializeMessagePayload(finalMessage),
    source: request.source,
    timestamp: Date.now(),
    appId,
    quoteMessageId: quote?.messageId ?? null,
    clientMessageId,
  });
  if (!savedMessage?.serverMessageId) {
    throw new Error("Failed to persist message");
  }
  return { clientMessageId, savedMessage };
}

function ackAndBroadcastMessage(options) {
  const { io, appId, requestEnvelope, runtime, ack, clientMessageId, savedMessage } = options;
  runtime.emitServerPayload(
    io.to(appId),
    SOCKET_EVENTS.CHAT_MESSAGE,
    savedMessage,
    requestEnvelope.traceId,
  );
  runtime.safeAck(
    ack,
    buildAckOk({
      traceId: requestEnvelope.traceId,
      data: {
        clientMessageId,
        message: savedMessage,
      },
    }),
  );
}

function maybeSendVscodeNotification(options) {
  const { request, source, appId, app, config, clickUrl, sendNotification, savedMessage } = options;
  if (source !== "vscode") {
    return;
  }
  const latestApp = config.findAppById(appId) || app;
  console.log(`[Socket] Message from VS Code (App: ${latestApp.name}), triggering Gotify...`);
  const targetUrl = latestApp.clickUrl || request.clickUrl || clickUrl;
  const priority = latestApp.gotifyPriority ?? 10;
  const pushText = savedMessage.attachments
    ? "[图片]"
    : savedMessage.text || savedMessage.quote?.textSnippet || "(空消息)";
  void sendNotification("New Reply", pushText, priority, targetUrl, latestApp);
}

async function handleChatMessage(options) {
  const {
    io,
    app,
    appId,
    rawMessage,
    ack,
    runtime,
    db,
    config,
    processImage,
    sendNotification,
    clickUrl,
  } = options;
  const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.CHAT_MESSAGE, rawMessage);
  const request = requestEnvelope.payload;
  logIncomingMessage(app, request);

  const built = await buildFinalMessagePayload({ db, appId, request, processImage });
  const persisted = persistMessage({
    db,
    appId,
    request,
    quote: built.quote,
    finalMessage: built.finalMessage,
  });
  ackAndBroadcastMessage({
    io,
    appId,
    requestEnvelope,
    runtime,
    ack,
    clientMessageId: persisted.clientMessageId,
    savedMessage: persisted.savedMessage,
  });
  maybeSendVscodeNotification({
    request,
    source: request.source,
    appId,
    app,
    config,
    clickUrl,
    sendNotification,
    savedMessage: persisted.savedMessage,
  });

  return persisted.savedMessage;
}

function registerChatMessageHandler(options) {
  const { socket, runtime } = options;

  socket.on(SOCKET_EVENTS.CHAT_MESSAGE, async (rawMessage, ack) => {
    try {
      await handleChatMessage({
        ...options,
        rawMessage,
        ack,
      });
    } catch (error) {
      console.error("[Socket] Error processing message:", error);
      runtime.safeAck(
        ack,
        buildAckError({
          traceId: runtime.readTraceId(rawMessage, "chat"),
          code: "CHAT_MESSAGE_FAILED",
          message: error.message || "Failed to process message",
          data: {
            clientMessageId: readAckClientMessageId(rawMessage),
          },
        }),
      );
      socket.emit("error", {
        message: error.message || "Failed to process message",
      });
    }
  });
}

module.exports = { registerChatMessageHandler };
