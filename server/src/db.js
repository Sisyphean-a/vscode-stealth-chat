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
      quote_message_id INTEGER,
      client_message_id TEXT,
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

  try {
    database.run("SELECT quote_message_id FROM messages LIMIT 1");
  } catch (error) {
    console.log("[DB] Migrating schema: adding quote_message_id column...");
    database.run("ALTER TABLE messages ADD COLUMN quote_message_id INTEGER");
    console.log("[DB] Migration completed.");
  }

  try {
    database.run("SELECT client_message_id FROM messages LIMIT 1");
  } catch (error) {
    console.log("[DB] Migrating schema: adding client_message_id column...");
    database.run("ALTER TABLE messages ADD COLUMN client_message_id TEXT");
    console.log("[DB] Migration completed.");
  }

  database.run("CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_app_id ON messages(app_id);");
  database.run("CREATE INDEX IF NOT EXISTS idx_app_timestamp ON messages(app_id, timestamp DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_quote_message_id ON messages(quote_message_id);");
  database.run("CREATE INDEX IF NOT EXISTS idx_client_message_id ON messages(app_id, source, client_message_id);");
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

function parsePositiveMessageId(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeQuote(quote) {
  if (!quote || typeof quote !== "object") {
    return null;
  }

  const messageId = parsePositiveMessageId(quote.messageId);
  const source = quote.source === "mobile" || quote.source === "vscode" ? quote.source : null;
  const timestamp = Number.parseInt(String(quote.timestamp ?? ""), 10);
  if (!messageId || !source || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const textSnippet = typeof quote.textSnippet === "string" ? quote.textSnippet : "";
  return { messageId, source, timestamp, textSnippet };
}

function parseMessageText(rowText) {
  try {
    const parsed = JSON.parse(rowText);
    if (parsed && typeof parsed === "object") {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : null;
      const quote = normalizeQuote(parsed.quote);
      if (attachments || quote || Object.prototype.hasOwnProperty.call(parsed, "text")) {
        return { text, attachments, quote };
      }
    }
  } catch (error) {
    // plain text message
  }
  return { text: typeof rowText === "string" ? rowText : "", attachments: null, quote: null };
}

function mapMessageRow(row) {
  const parsed = parseMessageText(row.text);
  const messageId = parsePositiveMessageId(row.id);
  return {
    id: messageId,
    text: parsed.text,
    source: row.source,
    timestamp: row.timestamp,
    attachments: parsed.attachments,
    quote: parsed.quote,
    clientMessageId: typeof row.client_message_id === "string" ? row.client_message_id : null,
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

function getLastInsertedId() {
  const stmt = state.db.prepare("SELECT last_insert_rowid() AS id");
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return parsePositiveMessageId(row.id);
}

function insertMessage(options) {
  if (!ensureInitialized()) {
    return null;
  }

  const {
    text,
    source,
    timestamp,
    appId = "default",
    quoteMessageId = null,
    clientMessageId = null,
  } = options;
  const safeQuoteMessageId = parsePositiveMessageId(quoteMessageId);
  const safeClientMessageId = typeof clientMessageId === "string" && clientMessageId.trim().length > 0
    ? clientMessageId.trim()
    : null;

  if (safeClientMessageId) {
    const existing = getMessageByClientMessageId(safeClientMessageId, source, appId);
    if (existing && existing.id) {
      return existing.id;
    }
  }

  try {
    state.db.run(
      "INSERT INTO messages (text, source, timestamp, app_id, quote_message_id, client_message_id) VALUES (?, ?, ?, ?, ?, ?)",
      [text, source, timestamp, appId, safeQuoteMessageId, safeClientMessageId],
    );
    return getLastInsertedId();
  } catch (error) {
    console.error(`[DB] Failed to save message: ${error.message}`);
    return null;
  }
}

function saveMessage(text, source, timestamp, appId = "default") {
  return insertMessage({ text, source, timestamp, appId }) !== null;
}

function getRawMessageById(messageId, appId = "default") {
  if (!ensureInitialized()) {
    return null;
  }
  const safeMessageId = parsePositiveMessageId(messageId);
  if (!safeMessageId) {
    return null;
  }
  try {
    const stmt = state.db.prepare(`
      SELECT id, text, source, timestamp, client_message_id
      FROM messages
      WHERE id = ? AND app_id = ?
      LIMIT 1
    `);
    stmt.bind([safeMessageId, appId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  } catch (error) {
    console.error(`[DB] Failed to get message by id: ${error.message}`);
    return null;
  }
}

function getRawMessageByClientMessageId(clientMessageId, source, appId = "default") {
  if (!ensureInitialized()) {
    return null;
  }
  const safeClientMessageId = typeof clientMessageId === "string" ? clientMessageId.trim() : "";
  if (!safeClientMessageId) {
    return null;
  }
  try {
    const stmt = state.db.prepare(`
      SELECT id, text, source, timestamp, client_message_id
      FROM messages
      WHERE app_id = ? AND source = ? AND client_message_id = ?
      ORDER BY id DESC
      LIMIT 1
    `);
    stmt.bind([appId, source, safeClientMessageId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  } catch (error) {
    console.error(`[DB] Failed to get message by client_message_id: ${error.message}`);
    return null;
  }
}

function getMessageByClientMessageId(clientMessageId, source, appId = "default") {
  const row = getRawMessageByClientMessageId(clientMessageId, source, appId);
  return row ? mapMessageRow(row) : null;
}

function getMessageById(messageId, appId = "default") {
  const row = getRawMessageById(messageId, appId);
  return row ? mapMessageRow(row) : null;
}

function saveMessageRecord(options) {
  const insertedId = insertMessage(options);
  if (!insertedId) {
    return null;
  }
  return getMessageById(insertedId, options.appId);
}

function getRecentMessages(limit = 50, appId = "default", beforeTimestamp = null) {
  if (!ensureInitialized()) {
    return [];
  }

  const withPagination = beforeTimestamp !== null && beforeTimestamp !== undefined;
  const sql = withPagination
    ? `
      SELECT id, text, source, timestamp
      , client_message_id
      FROM messages
      WHERE app_id = ? AND timestamp < ?
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
    `
    : `
      SELECT id, text, source, timestamp
      , client_message_id
      FROM messages
      WHERE app_id = ?
      ORDER BY timestamp DESC, id DESC
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

function getMessagesAroundMessage(targetMessageId, appId = "default", beforeLimit = 25, afterLimit = 25) {
  if (!ensureInitialized()) {
    return [];
  }

  const target = getRawMessageById(targetMessageId, appId);
  if (!target) {
    return [];
  }

  const safeBeforeLimit = parsePositiveInt(beforeLimit, 25);
  const safeAfterLimit = parsePositiveInt(afterLimit, 25);
  const targetTimestamp = Number.parseInt(String(target.timestamp), 10);
  const targetId = parsePositiveMessageId(target.id);
  if (!Number.isFinite(targetTimestamp) || !targetId) {
    return [];
  }

  try {
    const olderStmt = state.db.prepare(`
      SELECT id, text, source, timestamp
      , client_message_id
      FROM messages
      WHERE app_id = ?
        AND (timestamp < ? OR (timestamp = ? AND id <= ?))
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
    `);
    olderStmt.bind([appId, targetTimestamp, targetTimestamp, targetId, safeBeforeLimit + 1]);
    const olderRows = [];
    while (olderStmt.step()) {
      olderRows.push(olderStmt.getAsObject());
    }
    olderStmt.free();

    const newerStmt = state.db.prepare(`
      SELECT id, text, source, timestamp
      , client_message_id
      FROM messages
      WHERE app_id = ?
        AND (timestamp > ? OR (timestamp = ? AND id > ?))
      ORDER BY timestamp ASC, id ASC
      LIMIT ?
    `);
    newerStmt.bind([appId, targetTimestamp, targetTimestamp, targetId, safeAfterLimit]);
    const newerRows = [];
    while (newerStmt.step()) {
      newerRows.push(newerStmt.getAsObject());
    }
    newerStmt.free();

    const combinedRows = [...olderRows.reverse(), ...newerRows];
    return combinedRows.map(mapMessageRow);
  } catch (error) {
    console.error(`[DB] Failed to get messages around target: ${error.message}`);
    return [];
  }
}

function buildSearchSnippet(message, keyword, maxLength = 120) {
  const lowerKeyword = keyword.toLowerCase();
  const text = typeof message.text === "string" ? message.text : "";
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const previewRaw = hasAttachments ? `[图片] ${text}`.trim() : text.trim();
  const preview = previewRaw || "(空消息)";
  const lowerPreview = preview.toLowerCase();
  const hitIndex = lowerPreview.indexOf(lowerKeyword);
  if (hitIndex < 0 || preview.length <= maxLength) {
    return preview.length <= maxLength
      ? preview
      : `${preview.slice(0, maxLength - 3)}...`;
  }

  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, hitIndex - half);
  const end = Math.min(preview.length, start + maxLength);
  const clipped = preview.slice(start, end);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < preview.length ? "..." : "";
  return `${prefix}${clipped}${suffix}`;
}

function getHotSearchRows(appId, keyword, limit) {
  const pattern = `%${keyword}%`;
  const stmt = state.db.prepare(`
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ? AND text LIKE ?
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `);
  stmt.bind([appId, pattern, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function searchMessages(options = {}) {
  if (!ensureInitialized()) {
    return [];
  }

  const appId = typeof options.appId === "string" && options.appId.trim().length > 0
    ? options.appId.trim()
    : null;
  const keyword = typeof options.keyword === "string" ? options.keyword.trim() : "";
  const limit = parsePositiveInt(options.limit, 50);
  if (!appId || keyword.length === 0) {
    return [];
  }

  const lowerKeyword = keyword.toLowerCase();
  const hotRows = getHotSearchRows(appId, keyword, limit);
  const hotResults = hotRows
    .map((row) => mapMessageRow(row))
    .filter((message) => {
      const text = `${message.text || ""} ${JSON.stringify(message.attachments || [])}`.toLowerCase();
      return text.includes(lowerKeyword);
    })
    .map((message) => ({
      targetType: "hot",
      messageId: message.id,
      archiveId: null,
      source: message.source,
      timestamp: message.timestamp,
      preview: buildSearchSnippet(message, keyword),
      restored: false,
    }));

  const archiveRows = archiveDb.searchArchivedMessages({ appId, keyword, limit });
  const archiveResults = archiveRows.map((row) => {
    const message = mapArchivedRow(row);
    return {
      targetType: "archive",
      messageId: null,
      archiveId: Number.parseInt(String(message.archiveId), 10),
      source: message.source,
      timestamp: message.timestamp,
      preview: buildSearchSnippet(message, keyword),
      restored: false,
    };
  });

  return [...hotResults, ...archiveResults]
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        const aId = a.messageId || a.archiveId || 0;
        const bId = b.messageId || b.archiveId || 0;
        return bId - aId;
      }
      return b.timestamp - a.timestamp;
    })
    .slice(0, limit);
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

function mapArchivedRowToChatMessage(row) {
  const message = mapArchivedRow(row);
  return {
    id: null,
    text: message.text,
    source: message.source,
    timestamp: message.timestamp,
    attachments: message.attachments,
    quote: message.quote,
    archiveId: message.archiveId,
    archived: true,
    originalMessageId: message.originalMessageId,
  };
}

function getArchivedMessagesAround(archiveId, appId = "default", beforeLimit = 25, afterLimit = 25) {
  if (!ensureInitialized()) {
    return [];
  }
  const rows = archiveDb.getMessagesAroundArchiveId(archiveId, appId, beforeLimit, afterLimit);
  return rows.map(mapArchivedRowToChatMessage);
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
        "INSERT INTO messages (text, source, timestamp, app_id, quote_message_id) VALUES (?, ?, ?, ?, NULL)",
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
  saveMessageRecord,
  getRecentMessages,
  getMessageById,
  getMessageByClientMessageId,
  getMessagesAroundMessage,
  getArchivedMessagesAround,
  searchMessages,
  getMessageCount,
  getArchivedMessages,
  getArchiveMessageCount,
  restoreArchivedMessages,
  cleanupOldMessages,
  saveToFile,
  close,
  getDatabaseStatus,
};
