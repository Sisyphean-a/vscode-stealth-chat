const { SOCKET_EVENTS } = require("../../../../../packages/protocol/socket-events.cjs");

function parseOptionalPositiveInt(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function registerReadReceiptHandler(options) {
  const { socket, appId, runtime } = options;

  socket.on(SOCKET_EVENTS.MARK_READ, (data) => {
    try {
      const requestEnvelope = runtime.parseClientEnvelope(SOCKET_EVENTS.MARK_READ, data);
      const request = requestEnvelope.payload;
      const lastReadTimestamp = parseOptionalPositiveInt(request.lastReadTimestamp);
      if (!lastReadTimestamp) {
        return;
      }
      const payload = {
        appId,
        clientType: runtime.normalizeClientType(request.clientType || socket.data.clientType),
        lastReadTimestamp,
        lastReadMessageId: parseOptionalPositiveInt(request.lastReadMessageId),
      };
      runtime.emitServerPayload(
        socket.to(appId),
        SOCKET_EVENTS.READ_RECEIPT,
        payload,
        requestEnvelope.traceId,
      );
    } catch (error) {
      console.error(`[Socket] "mark read" error:`, error);
    }
  });
}

module.exports = { registerReadReceiptHandler };
