const crypto = require("crypto");

const SESSION_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MIN_PULL_INTERVAL_MS = 800;

const sessions = new Map();
let cleanupTimer = null;

function now() {
  return Date.now();
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function ensureCleanupTimer() {
  if (cleanupTimer) {
    return;
  }
  cleanupTimer = setInterval(cleanExpiredSessions, CLEANUP_INTERVAL_MS);
}

function cleanExpiredSessions() {
  const timestamp = now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= timestamp) {
      sessions.delete(token);
    }
  }
}

function buildSessionPayload(session) {
  return {
    sessionToken: session.token,
    expiresInMs: Math.max(0, session.expiresAt - now()),
    pollIntervalMs: session.pollIntervalMs,
    apps: session.apps.map((app) => ({ ...app })),
  };
}

function validateApps(apps) {
  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error("apps must be a non-empty array");
  }

  const seenConnections = new Set();
  const validated = [];
  for (const app of apps) {
    const appId = typeof app?.appId === "string" ? app.appId.trim() : "";
    const connectionName = typeof app?.connectionName === "string" ? app.connectionName.trim() : "";
    const name = typeof app?.name === "string" ? app.name.trim() : appId;
    if (!appId || !connectionName) {
      throw new Error("appId and connectionName are required");
    }
    if (seenConnections.has(connectionName)) {
      throw new Error(`duplicate connectionName: ${connectionName}`);
    }
    seenConnections.add(connectionName);
    validated.push({ appId, connectionName, name });
  }
  return validated;
}

function createSession(options = {}) {
  ensureCleanupTimer();
  const apps = validateApps(options.apps);
  const token = createToken();
  const session = {
    token,
    apps,
    appMap: new Map(apps.map((app) => [app.appId, app])),
    expiresAt: now() + (options.ttlMs || SESSION_TTL_MS),
    pollIntervalMs: Number.isFinite(options.pollIntervalMs)
      ? Math.max(1000, Number(options.pollIntervalMs))
      : 4000,
    lastPullAt: 0,
  };
  sessions.set(token, session);
  return buildSessionPayload(session);
}

function invalidateSession(token) {
  sessions.delete(token);
}

function findSession(token) {
  if (!token || !sessions.has(token)) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function touchSession(session, ttlMs = SESSION_TTL_MS) {
  session.expiresAt = now() + ttlMs;
}

function parseSessionToken(authHeader) {
  if (typeof authHeader !== "string") {
    return "";
  }
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

function getSessionFromHeader(authHeader) {
  const token = parseSessionToken(authHeader);
  const session = findSession(token);
  if (!session) {
    return null;
  }
  touchSession(session);
  return session;
}

function checkPullRate(session) {
  const timestamp = now();
  if (session.lastPullAt > 0 && timestamp - session.lastPullAt < MIN_PULL_INTERVAL_MS) {
    return false;
  }
  session.lastPullAt = timestamp;
  return true;
}

function refreshSession(authHeader) {
  const session = getSessionFromHeader(authHeader);
  if (!session) {
    return null;
  }
  return buildSessionPayload(session);
}

module.exports = {
  SESSION_TTL_MS,
  MIN_PULL_INTERVAL_MS,
  createSession,
  invalidateSession,
  findSession,
  getSessionFromHeader,
  checkPullRate,
  refreshSession,
};
