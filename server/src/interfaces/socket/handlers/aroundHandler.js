const { SOCKET_EVENTS } = require("../../../../../packages/protocol/socket-events.cjs");

function parsePositiveInt(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function handleInvalidTarget(socket, runtime, event, traceId, field, message) {
  runtime.emitServerPayload(
    socket,
    event,
    {
      messages: [],
      [field]: null,
      error: message,
    },
    traceId,
  );
}

function emitAroundMessageResult(socket, runtime, traceId, payload) {
  runtime.emitServerPayload(socket, SOCKET_EVENTS.AROUND_MESSAGE_LOADED, payload, traceId);
}

function emitAroundArchiveResult(socket, runtime, traceId, payload) {
  runtime.emitServerPayload(socket, SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, payload, traceId);
}

function handleLoadAroundMessage(context, data) {
  const { socket, appId, runtime, db } = context;
  const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, data);
  const request = requestEnvelope.payload;
  const targetMessageId = parsePositiveInt(request.targetMessageId);
  if (!targetMessageId) {
    handleInvalidTarget(
      socket,
      runtime,
      SOCKET_EVENTS.AROUND_MESSAGE_LOADED,
      requestEnvelope.traceId,
      "targetMessageId",
      "Invalid target message id",
    );
    return;
  }
  if (!db.getMessageById(targetMessageId, appId)) {
    emitAroundMessageResult(socket, runtime, requestEnvelope.traceId, {
      messages: [],
      targetMessageId,
      error: "Target message not found",
    });
    return;
  }
  const windowSize = runtime.normalizeWindowSize(request.windowSize);
  const messages = db.getMessagesAroundMessage(targetMessageId, appId, windowSize, windowSize);
  emitAroundMessageResult(socket, runtime, requestEnvelope.traceId, {
    messages,
    targetMessageId,
    error: null,
  });
}

function handleLoadAroundArchive(context, data) {
  const { socket, appId, runtime, db } = context;
  const requestEnvelope = runtime.parseClientEnvelope(
    SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE,
    data,
  );
  const request = requestEnvelope.payload;
  const targetArchiveId = parsePositiveInt(request.targetArchiveId);
  if (!targetArchiveId) {
    handleInvalidTarget(
      socket,
      runtime,
      SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED,
      requestEnvelope.traceId,
      "targetArchiveId",
      "Invalid target archive id",
    );
    return;
  }
  const windowSize = runtime.normalizeWindowSize(request.windowSize);
  const messages = db.getArchivedMessagesAround(targetArchiveId, appId, windowSize, windowSize);
  if (messages.length === 0) {
    emitAroundArchiveResult(socket, runtime, requestEnvelope.traceId, {
      messages: [],
      targetArchiveId,
      error: "Target archive message not found",
    });
    return;
  }
  emitAroundArchiveResult(socket, runtime, requestEnvelope.traceId, {
    messages,
    targetArchiveId,
    error: null,
  });
}

function registerAroundHandlers(options) {
  const { socket, runtime } = options;
  socket.on(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, (data) => {
    try {
      handleLoadAroundMessage(options, data);
    } catch (error) {
      console.error(`[Socket] "load around message" error:`, error);
      emitAroundMessageResult(socket, runtime, runtime.readTraceId(data, "around-message"), {
        messages: [],
        targetMessageId: null,
        error: error.message || "Failed to load message context",
      });
    }
  });
  socket.on(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, (data) => {
    try {
      handleLoadAroundArchive(options, data);
    } catch (error) {
      console.error(`[Socket] "load around archived message" error:`, error);
      emitAroundArchiveResult(socket, runtime, runtime.readTraceId(data, "around-archive"), {
        messages: [],
        targetArchiveId: null,
        error: error.message || "Failed to load archived context",
      });
    }
  });
}

module.exports = { registerAroundHandlers };
