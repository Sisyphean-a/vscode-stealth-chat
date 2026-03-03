const { SOCKET_EVENTS } = require("../../../../../packages/protocol/socket-events.cjs");

function registerHistoryHandlers(options) {
  const { socket, app, appId, runtime, db } = options;

  socket.on(SOCKET_EVENTS.LOAD_HISTORY, (data) => {
    try {
      const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.LOAD_HISTORY, data);
      const limit = requestEnvelope.payload;
      console.log(`[Socket] Loading history (limit: ${limit}) for ${socket.id} (App: ${app.name})`);
      const messages = db.getRecentMessages(limit, appId);
      runtime.emitServerPayload(
        socket,
        SOCKET_EVENTS.HISTORY_LOADED,
        messages,
        requestEnvelope.traceId,
      );
    } catch (error) {
      console.error(`[Socket] "load history" error:`, error);
      runtime.emitServerPayload(
        socket,
        SOCKET_EVENTS.HISTORY_LOADED,
        [],
        runtime.readTraceId(data, "history"),
      );
    }
  });

  socket.on(SOCKET_EVENTS.LOAD_MORE_HISTORY, (data) => {
    try {
      const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.LOAD_MORE_HISTORY, data);
      const request = requestEnvelope.payload;
      console.log(
        `[Socket] Loading more history (limit: ${request.limit}, before: ${request.beforeTimestamp}) for ${socket.id} (App: ${app.name})`,
      );
      const messages = db.getRecentMessages(request.limit, appId, request.beforeTimestamp);
      runtime.emitServerPayload(
        socket,
        SOCKET_EVENTS.MORE_HISTORY_LOADED,
        {
          messages,
          hasMore: messages.length === request.limit,
        },
        requestEnvelope.traceId,
      );
    } catch (error) {
      console.error(`[Socket] "load more history" error:`, error);
      runtime.emitServerPayload(
        socket,
        SOCKET_EVENTS.MORE_HISTORY_LOADED,
        { messages: [], hasMore: false },
        runtime.readTraceId(data, "history-more"),
      );
    }
  });
}

module.exports = { registerHistoryHandlers };
