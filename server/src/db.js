const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const archiveDb = require("./archiveDb");

const DEFAULT_DB_PATH = path.join(__dirname, "../data/messages.db");
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_COUNT = 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SAVE_INTERVAL_MS = 5 * 60 * 1000;

const state = {
  db: null,
  isInitialized: false,
  config: null,
  cleanupTimer: null,
  saveTimer: null,
  isSaving: false,
  pendingSave: false,
};

function parsePositiveInt(input, fallback) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveConfig(options = {}) {
  return {
    dbPath: options.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH,
    retentionDays: parsePositiveInt(
      options.retentionDays ?? process.env.MESSAGE_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
    maxCount: parsePositiveInt(
      options.maxCount ?? process.env.MESSAGE_MAX_COUNT,
      DEFAULT_MAX_COUNT,
    ),
    archiveDbPath: options.archiveDbPath || process.env.ARCHIVE_DB_PATH || undefined,
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
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT DEFAULT 'default',
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    database.run("SELECT app_id FROM messages LIMIT 1");
  } catch (error) {
    console.log("[DB] Migrating schema: adding app_id column...");
    database.run("ALTER TABLE messages ADD COLUMN app_id TEXT DEFAULT 'default'");
    database.run("UPDATE messages SET app_id = 'default' WHERE app_id IS NULL");
    console.log("[DB] Migration completed.");
  }

  database.run("CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_app_id ON messages(app_id);");
}

function clearTimers() {
  if (state.cleanupTimer) {
    clearInterval(state.cleanupTimer);
    state.cleanupTimer = null;
  }
  if (state.saveTimer) {
    clearInterval(state.saveTimer);
    state.saveTimer = null;
  }
}

function resetState() {
  state.db = null;
  state.isInitialized = false;
  state.config = null;
  state.pendingSave = false;
  state.isSaving = false;
}

function startCleanupTask() {
  state.cleanupTimer = setInterval(() => {
    void cleanupOldMessages();
  }, CLEANUP_INTERVAL_MS);
  console.log("[DB] Cleanup task started (runs every hour)");
}

function startSaveTask() {
  state.saveTimer = setInterval(() => {
    void saveToFile();
  }, SAVE_INTERVAL_MS);
  console.log("[DB] Auto-save task started (runs every 5 minutes)");
}

function ensureInitialized() {
  return state.isInitialized && state.db && state.config;
}

function buildPlaceholders(count) {
  return new Array(count).fill("?").join(", ");
}

function parseMessageText(rowText) {
  try {
    const parsed = JSON.parse(rowText);
    if (parsed.attachments) {
      return { text: parsed.text, attachments: parsed.attachments };
    }
  } catch (error) {
    // plain text message
  }
  return { text: rowText, attachments: null };
}

function mapMessageRow(row) {
  const parsed = parseMessageText(row.text);
  return {
    text: parsed.text,
    source: row.source,
    timestamp: row.timestamp,
    attachments: parsed.attachments,
  };
}

function mapArchivedRow(row) {
  const message = mapMessageRow(row);
  return {
    ...message,
    appId: row.app_id,
    archiveId: row.archive_id,
    originalMessageId: row.original_message_id,
    archivedAt: row.archived_at,
    archiveReason: row.archive_reason,
    restoredAt: row.restored_at,
  };
}

async function init(options = {}) {
  if (state.isInitialized) {
    await close();
  }

  try {
    state.config = resolveConfig(options);
    await ensureDataDir(state.config.dbPath);

    const SQL = await initSqlJs();
    const buffer = await loadDatabaseBuffer(state.config.dbPath);
    state.db = buffer ? new SQL.Database(buffer) : new SQL.Database();

    createSchema(state.db);
    await archiveDb.init(SQL, { archiveDbPath: state.config.archiveDbPath });
    state.isInitialized = true;

    const saved = await saveToFile();
    if (!saved) {
      throw new Error(`Unable to persist database snapshot at ${state.config.dbPath}`);
    }

    clearTimers();
    startCleanupTask();
    startSaveTask();

    console.log(`[DB] Initialized at ${state.config.dbPath}`);
  } catch (error) {
    clearTimers();
    if (state.db) {
      state.db.close();
    }
    resetState();
    await archiveDb.close();
    throw new Error(`[DB] Initialization failed: ${error.message}`);
  }
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
      const archiveSaved = await archiveDb.saveToFile();
      if (!archiveSaved) {
        throw new Error("Unable to save archive database");
      }
    } while (state.pendingSave);
    return true;
  } catch (error) {
    console.error(`[DB] Failed to save to file: ${error.message}`);
    return false;
  } finally {
    state.isSaving = false;
  }
}

function saveMessage(text, source, timestamp, appId = "default") {
  if (!ensureInitialized()) {
    return false;
  }

  try {
    state.db.run(
      "INSERT INTO messages (text, source, timestamp, app_id) VALUES (?, ?, ?, ?)",
      [text, source, timestamp, appId],
    );
    return true;
  } catch (error) {
    console.error(`[DB] Failed to save message: ${error.message}`);
    return false;
  }
}

function getRecentMessages(limit = 50, appId = "default", beforeTimestamp = null) {
  if (!ensureInitialized()) {
    return [];
  }

  const withPagination = beforeTimestamp !== null && beforeTimestamp !== undefined;
  const sql = withPagination
    ? `
      SELECT text, source, timestamp
      FROM messages
      WHERE app_id = ? AND timestamp < ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
    : `
      SELECT text, source, timestamp
      FROM messages
      WHERE app_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
  const params = withPagination ? [appId, beforeTimestamp, limit] : [appId, limit];

  try {
    const stmt = state.db.prepare(sql);
    stmt.bind(params);
    const messages = [];
    while (stmt.step()) {
      messages.push(mapMessageRow(stmt.getAsObject()));
    }
    stmt.free();
    return messages.reverse();
  } catch (error) {
    console.error(`[DB] Failed to get messages: ${error.message}`);
    return [];
  }
}

function getMessageCount(appId) {
  if (!ensureInitialized()) {
    return 0;
  }

  try {
    const hasAppFilter = !!appId;
    const sql = hasAppFilter
      ? "SELECT COUNT(*) as count FROM messages WHERE app_id = ?"
      : "SELECT COUNT(*) as count FROM messages";
    const stmt = state.db.prepare(sql);
    if (hasAppFilter) {
      stmt.bind([appId]);
    }
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.count;
  } catch (error) {
    console.error(`[DB] Failed to get message count: ${error.message}`);
    return 0;
  }
}

function getDistinctAppIds() {
  const stmt = state.db.prepare("SELECT DISTINCT app_id FROM messages");
  const appIds = [];
  while (stmt.step()) {
    appIds.push(stmt.getAsObject().app_id);
  }
  stmt.free();
  return appIds;
}

function getRowsToArchiveByRetention(retentionTimestamp) {
  const stmt = state.db.prepare(`
    SELECT id, app_id, text, source, timestamp
    FROM messages
    WHERE timestamp < ?
    ORDER BY timestamp ASC
  `);
  stmt.bind([retentionTimestamp]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getRowsToArchiveByMaxCount(maxCount) {
  const rows = [];
  const appIds = getDistinctAppIds();
  for (const appId of appIds) {
    const count = getMessageCount(appId);
    if (count <= maxCount) {
      continue;
    }
    const excess = count - maxCount;
    const stmt = state.db.prepare(`
      SELECT id, app_id, text, source, timestamp
      FROM messages
      WHERE app_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);
    stmt.bind([appId, excess]);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
  }
  return rows;
}

function deleteMessagesByIds(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return 0;
  }
  const placeholders = buildPlaceholders(messageIds.length);
  state.db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, messageIds);
  return state.db.getRowsModified();
}

function archiveAndRemoveRows(rows, reason) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const archivedCount = archiveDb.archiveMessages(rows, reason);
  if (archivedCount !== rows.length) {
    throw new Error(`[DB] Archive count mismatch: expected ${rows.length}, got ${archivedCount}`);
  }

  const messageIds = rows.map((row) => row.id);
  const deletedCount = deleteMessagesByIds(messageIds);
  if (deletedCount !== rows.length) {
    throw new Error(`[DB] Delete count mismatch: expected ${rows.length}, got ${deletedCount}`);
  }
  return archivedCount;
}

async function cleanupOldMessages() {
  if (!ensureInitialized()) {
    return;
  }

  try {
    const retentionTimestamp = Date.now() - state.config.retentionDays * 24 * 60 * 60 * 1000;
    const retentionRows = getRowsToArchiveByRetention(retentionTimestamp);
    const archivedByRetention = archiveAndRemoveRows(retentionRows, archiveDb.ARCHIVE_REASON_RETENTION);

    const maxCountRows = getRowsToArchiveByMaxCount(state.config.maxCount);
    const archivedByCount = archiveAndRemoveRows(maxCountRows, archiveDb.ARCHIVE_REASON_MAX_COUNT);

    const totalArchived = archivedByRetention + archivedByCount;
    if (totalArchived > 0) {
      console.log(`[DB] Archived ${totalArchived} messages in cleanup task`);
    }
    await saveToFile();
  } catch (error) {
    console.error(`[DB] Cleanup failed: ${error.message}`);
  }
}

function getArchivedMessages(limit = 50, appId = null, beforeTimestamp = null, includeRestored = false) {
  if (!ensureInitialized()) {
    return [];
  }
  const rows = archiveDb.getArchivedMessages({ limit, appId, beforeTimestamp, includeRestored });
  return rows.map(mapArchivedRow);
}

function getArchiveMessageCount(appId, includeRestored = false) {
  if (!ensureInitialized()) {
    return 0;
  }
  return archiveDb.getArchiveMessageCount(appId, includeRestored);
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

function restoreRowsToHotStorage(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  state.db.run("BEGIN TRANSACTION");
  try {
    for (const row of rows) {
      state.db.run(
        "INSERT INTO messages (text, source, timestamp, app_id) VALUES (?, ?, ?, ?)",
        [row.text, row.source, row.timestamp, row.app_id],
      );
    }
    state.db.run("COMMIT");
    return rows.length;
  } catch (error) {
    state.db.run("ROLLBACK");
    throw new Error(`[DB] Restore failed while writing hot messages: ${error.message}`);
  }
}

async function restoreArchivedMessages(archiveIds) {
  if (!ensureInitialized()) {
    return { requested: 0, restored: 0 };
  }

  const normalizedIds = normalizeArchiveIds(archiveIds);
  if (normalizedIds.length === 0) {
    throw new Error("[DB] archiveIds must contain positive integers");
  }

  const rows = archiveDb.getArchivedRowsByIds(normalizedIds, false);
  if (rows.length === 0) {
    return { requested: normalizedIds.length, restored: 0 };
  }

  const restored = restoreRowsToHotStorage(rows);
  const marked = archiveDb.markRestored(rows.map((row) => row.archive_id));
  if (marked !== restored) {
    throw new Error(`[DB] Restore mark mismatch: expected ${restored}, got ${marked}`);
  }

  const saved = await saveToFile();
  if (!saved) {
    throw new Error("[DB] Restore succeeded in memory but failed to persist");
  }

  return { requested: normalizedIds.length, restored };
}

async function close() {
  clearTimers();
  if (!state.db) {
    resetState();
    await archiveDb.close();
    return;
  }

  await saveToFile();
  state.db.close();
  console.log("[DB] Connection closed");
  resetState();
  await archiveDb.close();
}

function getDatabaseStatus() {
  return ensureInitialized() ? "connected" : "uninitialized";
}

module.exports = {
  init,
  saveMessage,
  getRecentMessages,
  getMessageCount,
  getArchivedMessages,
  getArchiveMessageCount,
  restoreArchivedMessages,
  cleanupOldMessages,
  saveToFile,
  close,
  getDatabaseStatus,
};
