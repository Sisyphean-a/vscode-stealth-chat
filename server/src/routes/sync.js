const express = require("express");
const config = require("../config");
const db = require("../db");
const {
  createSession,
  getSessionFromHeader,
  checkPullRate,
  refreshSession,
  findSession,
  invalidateSession,
} = require("../services/syncSessionStore");

const router = express.Router();

const MAX_CONNECTIONS = 30;
const DEFAULT_LIMIT_PER_APP = 50;
const MAX_LIMIT_PER_APP = 100;

function sendError(res, status, code, message) {
  res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

function parseLimitPerApp(raw) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT_PER_APP;
  }
  return Math.min(parsed, MAX_LIMIT_PER_APP);
}

function getCursorByApp(cursors, appId, connectionName) {
  if (!cursors || typeof cursors !== "object") {
    return { timestamp: 0, id: 0 };
  }
  const fromAppId = cursors[appId];
  const fromConnection = cursors[connectionName];
  const raw = fromAppId || fromConnection;
  const timestamp = Number.parseInt(String(raw?.ts ?? raw?.timestamp ?? ""), 10);
  const id = Number.parseInt(String(raw?.id ?? ""), 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(id) || id <= 0) {
    return { timestamp: 0, id: 0 };
  }
  return { timestamp, id };
}

function nextCursorFromMessages(messages, fallback) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return fallback;
  }
  const tail = messages[messages.length - 1];
  if (!Number.isFinite(tail?.timestamp) || !Number.isFinite(tail?.id)) {
    return fallback;
  }
  return { timestamp: tail.timestamp, id: tail.id };
}

function normalizeSessionConnections(rawConnections) {
  if (!Array.isArray(rawConnections) || rawConnections.length === 0) {
    throw new Error("connections must be a non-empty array");
  }
  if (rawConnections.length > MAX_CONNECTIONS) {
    throw new Error(`connections cannot exceed ${MAX_CONNECTIONS}`);
  }

  const normalized = [];
  const seenNames = new Set();
  const seenAppIds = new Set();
  for (const conn of rawConnections) {
    const connectionName = typeof conn?.name === "string" ? conn.name.trim() : "";
    const token = typeof conn?.token === "string" ? conn.token.trim() : "";
    if (!connectionName || !token) {
      throw new Error("connection name and token are required");
    }
    if (seenNames.has(connectionName)) {
      throw new Error(`duplicate connection name: ${connectionName}`);
    }
    seenNames.add(connectionName);
    const app = config.findAppByToken(token);
    if (!app || !app.id) {
      throw new Error(`invalid token for connection: ${connectionName}`);
    }
    if (seenAppIds.has(app.id)) {
      throw new Error(`duplicate app target: ${app.id}`);
    }
    seenAppIds.add(app.id);
    normalized.push({
      appId: app.id,
      name: app.name || app.id,
      connectionName,
    });
  }

  return normalized;
}

router.post("/session", (req, res) => {
  try {
    const apps = normalizeSessionConnections(req.body?.connections);
    const payload = createSession({ apps, pollIntervalMs: req.body?.pollIntervalMs });
    res.json({ ok: true, ...payload });
  } catch (error) {
    sendError(res, 400, "SYNC_SESSION_CREATE_FAILED", error.message || "Failed to create sync session");
  }
});

router.post("/pull", (req, res) => {
  const session = getSessionFromHeader(req.headers.authorization);
  if (!session) {
    sendError(res, 401, "SYNC_SESSION_INVALID", "Session token is invalid or expired");
    return;
  }
  if (!checkPullRate(session)) {
    sendError(res, 429, "SYNC_RATE_LIMITED", "Pulling too frequently");
    return;
  }

  const limitPerApp = parseLimitPerApp(req.body?.limitPerApp);
  const cursors = req.body?.cursors;

  const updates = [];
  for (const app of session.apps) {
    const cursor = getCursorByApp(cursors, app.appId, app.connectionName);
    const messages = db.getMessagesAfterCursor(app.appId, cursor, limitPerApp);
    const nextCursor = nextCursorFromMessages(messages, cursor);
    updates.push({
      appId: app.appId,
      connectionName: app.connectionName,
      messages,
      nextCursor,
      hasMore: messages.length === limitPerApp,
    });
  }

  res.json({
    ok: true,
    serverTime: Date.now(),
    updates,
  });
});

router.post("/refresh", (req, res) => {
  const payload = refreshSession(req.headers.authorization);
  if (!payload) {
    sendError(res, 401, "SYNC_SESSION_INVALID", "Session token is invalid or expired");
    return;
  }
  res.json({ ok: true, ...payload });
});

router.post("/close", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const session = findSession(token);
  if (!session) {
    sendError(res, 401, "SYNC_SESSION_INVALID", "Session token is invalid or expired");
    return;
  }
  invalidateSession(token);
  res.json({ ok: true });
});

module.exports = router;
