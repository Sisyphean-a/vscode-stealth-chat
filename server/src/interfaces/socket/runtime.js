const {
  DEFAULT_AROUND_WINDOW_SIZE,
  MAX_AROUND_WINDOW_SIZE,
  SEARCH_RESULT_LIMIT,
} = require("../../../../packages/chat-core/index.cjs");
const {
  SOCKET_EVENTS,
  buildSocketServerEnvelope,
  parseSocketClientPayload,
  parseSocketServerPayload,
} = require("../../../../packages/protocol/socket-events.cjs");

const MAX_SEARCH_LIMIT = 100;
const VALID_CLIENT_TYPES = new Set(["mobile", "vscode", "unknown"]);
const TRACE_RANDOM_SLICE_START = 2;
const TRACE_RANDOM_SLICE_END = 10;
const TRACE_PREFIX_SERVER = "srv";

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

function createTraceId(prefix = TRACE_PREFIX_SERVER) {
  const random = Math.random().toString(16).slice(TRACE_RANDOM_SLICE_START, TRACE_RANDOM_SLICE_END);
  return `${prefix}-${Date.now()}-${random}`;
}

function parseClientEnvelope(event, payload) {
  return parseSocketClientPayload(event, payload);
}

function readTraceId(rawEnvelope, fallbackPrefix = TRACE_PREFIX_SERVER) {
  const traceId = rawEnvelope?.traceId;
  if (typeof traceId === "string" && traceId.trim()) {
    return traceId.trim();
  }
  return createTraceId(fallbackPrefix);
}

function emitServerPayload(target, event, payload, traceId = createTraceId()) {
  const envelope = buildSocketServerEnvelope(event, payload, { traceId });
  const validated = parseSocketServerPayload(event, envelope);
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
    const currentSocket = io.sockets.sockets.get(socketId);
    const clientType = normalizeClientType(currentSocket?.data?.clientType);
    if (clientType === "mobile") {
      mobile += 1;
      continue;
    }
    if (clientType === "vscode") {
      vscode += 1;
    }
  }

  return { appId, total: room.size, mobile, vscode };
}

function emitPresenceUpdate(io, appId) {
  emitServerPayload(io.to(appId), SOCKET_EVENTS.PRESENCE_UPDATE, buildPresencePayload(io, appId));
}

module.exports = {
  SOCKET_EVENTS,
  normalizeWindowSize,
  normalizeSearchLimit,
  normalizeClientType,
  safeAck,
  parseClientEnvelope,
  readTraceId,
  emitServerPayload,
  emitPresenceUpdate,
};
