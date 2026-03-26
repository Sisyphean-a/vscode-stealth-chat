const {
  SOCKET_EVENTS,
  buildAckError,
  buildAckOk,
} = require("../../../../../packages/protocol/socket-events.cjs");

function registerSearchHandler(options) {
  const { socket, appId, runtime, db } = options;

  socket.on(SOCKET_EVENTS.SEARCH_MESSAGES, (data, ack) => {
    try {
      const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.SEARCH_MESSAGES, data);
      const request = requestEnvelope.payload;
      const keyword = request.keyword.trim();
      if (!keyword) {
        runtime.safeAck(
          ack,
          buildAckError({
            traceId: requestEnvelope.traceId,
            code: "SEARCH_KEYWORD_REQUIRED",
            message: "Keyword is required",
          }),
        );
        return;
      }
      const limit = runtime.normalizeSearchLimit(request.limit);
      const includeArchived = request.includeArchived !== false;
      const results = db.searchMessages({ appId, keyword, limit, includeArchived });
      runtime.safeAck(
        ack,
        buildAckOk({
          traceId: requestEnvelope.traceId,
          data: { results, keyword, limit },
        }),
      );
    } catch (error) {
      console.error(`[Socket] "search messages" error:`, error);
      runtime.safeAck(
        ack,
        buildAckError({
          traceId: runtime.readTraceId(data, "search"),
          code: "SEARCH_FAILED",
          message: error.message || "Search failed",
        }),
      );
    }
  });
}

module.exports = { registerSearchHandler };
