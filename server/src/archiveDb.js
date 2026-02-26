const path = require("path");
const fs = require("fs");

const DEFAULT_ARCHIVE_DB_PATH = path.join(__dirname, "../data/messages.archive.db");
const DEFAULT_LIMIT = 50;

const ARCHIVE_REASON_RETENTION = "retention";
const ARCHIVE_REASON_MAX_COUNT = "max_count";
const ARCHIVE_REASON_MANUAL = "manual";

const VALID_ARCHIVE_REASONS = new Set([
  ARCHIVE_REASON_RETENTION,
  ARCHIVE_REASON_MAX_COUNT,
  ARCHIVE_REASON_MANUAL,
]);

const state = {
  db: null,
  isInitialized: false,
  config: null,
  isSaving: false,
  pendingSave: false,
};

function parsePositiveInt(input, fallback) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveConfig(options = {}) {
  return {
    dbPath: options.archiveDbPath || process.env.ARCHIVE_DB_PATH || DEFAULT_ARCHIVE_DB_PATH,
  };
}

async function ensureDataDir(dbPath) {
  const dbDir = path.dirname(dbPath);
  await fs.promises.mkdir(dbDir, { recursive: true });
}

async function loadDatabaseBuffer(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  return fs.promises.readFile(dbPath);
}

function createSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS archived_messages (
      archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      original_message_id INTEGER NOT NULL,
      archived_at INTEGER NOT NULL,
      archive_reason TEXT NOT NULL,
      restored_at INTEGER
    );
  `);
  database.run("CREATE INDEX IF NOT EXISTS idx_archive_app_time ON archived_messages(app_id, timestamp DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_archive_archived_at ON archived_messages(archived_at DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_archive_restored_at ON archived_messages(restored_at);");
}

function ensureInitialized() {
  return state.isInitialized && state.db && state.config;
}

function assertInitialized() {
  if (!ensureInitialized()) {
    throw new Error("[ArchiveDB] Database is not initialized");
  }
}

function normalizeArchiveReason(reason) {
  if (!VALID_ARCHIVE_REASONS.has(reason)) {
    throw new Error(`[ArchiveDB] Unsupported archive reason: ${reason}`);
  }
  return reason;
}

function normalizeArchiveIds(archiveIds) {
  if (!Array.isArray(archiveIds)) {
    return [];
  }
  const normalized = [];
  for (const id of archiveIds) {
    const parsed = Number.parseInt(String(id), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      normalized.push(parsed);
    }
  }
  return Array.from(new Set(normalized));
}

function normalizeTimestamp(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[ArchiveDB] Invalid timestamp: ${input}`);
  }
  return parsed;
}

function normalizeAppId(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const appId = String(input).trim();
  return appId.length > 0 ? appId : null;
}

function buildPlaceholders(count) {
  return new Array(count).fill("?").join(", ");
}

function validateMessageRow(row) {
  const messageId = Number.parseInt(String(row?.id), 10);
  const appId = normalizeAppId(row?.app_id);
  const text = row?.text;
  const source = row?.source;
  const timestamp = normalizeTimestamp(row?.timestamp);

  if (!Number.isFinite(messageId) || messageId <= 0) {
    throw new Error(`[ArchiveDB] Invalid source message id: ${row?.id}`);
  }
  if (!appId) {
    throw new Error("[ArchiveDB] Missing app_id in archived message");
  }
  if (typeof text !== "string") {
    throw new Error("[ArchiveDB] Invalid text field in archived message");
  }
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("[ArchiveDB] Invalid source field in archived message");
  }

  return { messageId, appId, text, source, timestamp };
}

async function init(SQL, options = {}) {
  if (!SQL || typeof SQL.Database !== "function") {
    throw new Error("[ArchiveDB] Invalid SQL.js instance");
  }

  if (state.isInitialized) {
    await close();
  }

  state.config = resolveConfig(options);
  await ensureDataDir(state.config.dbPath);

  const buffer = await loadDatabaseBuffer(state.config.dbPath);
  state.db = buffer ? new SQL.Database(buffer) : new SQL.Database();
  createSchema(state.db);
  state.isInitialized = true;

  const saved = await saveToFile();
  if (!saved) {
    throw new Error(`[ArchiveDB] Unable to persist snapshot at ${state.config.dbPath}`);
  }

  console.log(`[ArchiveDB] Initialized at ${state.config.dbPath}`);
}

async function writeSnapshot() {
  const data = state.db.export();
  const buffer = Buffer.from(data);
  await fs.promises.writeFile(state.config.dbPath, buffer);
}

async function saveToFile() {
  if (!ensureInitialized()) {
    return false;
  }

  if (state.isSaving) {
    state.pendingSave = true;
    return true;
  }

  state.isSaving = true;
  try {
    do {
      state.pendingSave = false;
      await writeSnapshot();
    } while (state.pendingSave);
    return true;
  } catch (error) {
    console.error(`[ArchiveDB] Failed to save to file: ${error.message}`);
    return false;
  } finally {
    state.isSaving = false;
  }
}

function archiveMessages(messages, reason) {
  assertInitialized();
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  const archivedAt = Date.now();
  const archiveReason = normalizeArchiveReason(reason);

  state.db.run("BEGIN TRANSACTION");
  try {
    for (const row of messages) {
      const message = validateMessageRow(row);
      state.db.run(
        `
        INSERT INTO archived_messages (
          app_id, text, source, timestamp, original_message_id, archived_at, archive_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          message.appId,
          message.text,
          message.source,
          message.timestamp,
          message.messageId,
          archivedAt,
          archiveReason,
        ],
      );
    }
    state.db.run("COMMIT");
    return messages.length;
  } catch (error) {
    state.db.run("ROLLBACK");
    throw new Error(`[ArchiveDB] Failed to archive messages: ${error.message}`);
  }
}

function buildArchiveListQuery(hasAppFilter, hasBeforeFilter, includeRestored) {
  const conditions = [];
  if (hasAppFilter) {
    conditions.push("app_id = ?");
  }
  if (hasBeforeFilter) {
    conditions.push("timestamp < ?");
  }
  if (!includeRestored) {
    conditions.push("restored_at IS NULL");
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `;
}

function getArchivedMessages(options = {}) {
  assertInitialized();
  const appId = normalizeAppId(options.appId);
  const beforeTimestamp = normalizeTimestamp(options.beforeTimestamp);
  const includeRestored = options.includeRestored === true;
  const limit = parsePositiveInt(options.limit, DEFAULT_LIMIT);

  const sql = buildArchiveListQuery(!!appId, beforeTimestamp !== null, includeRestored);
  const params = [];
  if (appId) {
    params.push(appId);
  }
  if (beforeTimestamp !== null) {
    params.push(beforeTimestamp);
  }
  params.push(limit);

  const stmt = state.db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.reverse();
}

function getArchivedRowsByIds(archiveIds, includeRestored = false) {
  assertInitialized();
  const ids = normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return [];
  }

  const placeholders = buildPlaceholders(ids.length);
  const restoredClause = includeRestored ? "" : " AND restored_at IS NULL";
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE archive_id IN (${placeholders})${restoredClause}
    ORDER BY archive_id ASC
  `;

  const stmt = state.db.prepare(sql);
  stmt.bind(ids);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function markRestored(archiveIds) {
  assertInitialized();
  const ids = normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return 0;
  }

  const placeholders = buildPlaceholders(ids.length);
  const restoredAt = Date.now();
  state.db.run(
    `
    UPDATE archived_messages
    SET restored_at = ?
    WHERE archive_id IN (${placeholders}) AND restored_at IS NULL
    `,
    [restoredAt, ...ids],
  );
  return state.db.getRowsModified();
}

function getArchiveMessageCount(appId, includeRestored = false) {
  assertInitialized();
  const normalizedAppId = normalizeAppId(appId);
  const conditions = [];
  const params = [];

  if (normalizedAppId) {
    conditions.push("app_id = ?");
    params.push(normalizedAppId);
  }
  if (!includeRestored) {
    conditions.push("restored_at IS NULL");
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const stmt = state.db.prepare(`SELECT COUNT(*) as count FROM archived_messages${whereClause}`);
  if (params.length > 0) {
    stmt.bind(params);
  }
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result.count;
}

async function close() {
  if (!state.db) {
    state.isInitialized = false;
    state.config = null;
    state.pendingSave = false;
    state.isSaving = false;
    return;
  }

  await saveToFile();
  state.db.close();
  console.log("[ArchiveDB] Connection closed");

  state.db = null;
  state.isInitialized = false;
  state.config = null;
  state.pendingSave = false;
  state.isSaving = false;
}

module.exports = {
  init,
  saveToFile,
  archiveMessages,
  getArchivedMessages,
  getArchivedRowsByIds,
  markRestored,
  getArchiveMessageCount,
  close,
  ARCHIVE_REASON_RETENTION,
  ARCHIVE_REASON_MAX_COUNT,
  ARCHIVE_REASON_MANUAL,
};
