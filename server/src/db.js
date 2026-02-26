const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

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
    state.db = null;
    state.isInitialized = false;
    state.config = null;
    clearTimers();
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

  const params = withPagination
    ? [appId, beforeTimestamp, limit]
    : [appId, limit];

  try {
    const stmt = state.db.prepare(sql);
    stmt.bind(params);

    const messages = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const parsed = parseMessageText(row.text);
      messages.push({
        text: parsed.text,
        source: row.source,
        timestamp: row.timestamp,
        attachments: parsed.attachments,
      });
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

function enforceMaxCountPerApp(maxCount) {
  const appIds = getDistinctAppIds();
  for (const appId of appIds) {
    const count = getMessageCount(appId);
    if (count <= maxCount) {
      continue;
    }

    const excess = count - maxCount;
    state.db.run(
      `
      DELETE FROM messages
      WHERE id IN (
        SELECT id FROM messages
        WHERE app_id = ?
        ORDER BY timestamp ASC
        LIMIT ?
      )
      `,
      [appId, excess],
    );
    console.log(`[DB] Cleaned up ${excess} excess messages for app ${appId}`);
  }
}

async function cleanupOldMessages() {
  if (!ensureInitialized()) {
    return;
  }

  try {
    const retentionTimestamp = Date.now() - state.config.retentionDays * 24 * 60 * 60 * 1000;
    state.db.run("DELETE FROM messages WHERE timestamp < ?", [retentionTimestamp]);
    enforceMaxCountPerApp(state.config.maxCount);
    await saveToFile();
  } catch (error) {
    console.error(`[DB] Cleanup failed: ${error.message}`);
  }
}

async function close() {
  clearTimers();

  if (!state.db) {
    state.isInitialized = false;
    state.config = null;
    state.pendingSave = false;
    state.isSaving = false;
    return;
  }

  await saveToFile();
  state.db.close();
  console.log("[DB] Connection closed");

  state.db = null;
  state.isInitialized = false;
  state.config = null;
  state.pendingSave = false;
  state.isSaving = false;
}

function getDatabaseStatus() {
  return ensureInitialized() ? "connected" : "uninitialized";
}

module.exports = {
  init,
  saveMessage,
  getRecentMessages,
  getMessageCount,
  cleanupOldMessages,
  saveToFile,
  close,
  getDatabaseStatus,
};
