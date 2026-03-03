const DEFAULT_RECENT_LIMIT = 50;
const DEFAULT_AROUND_LIMIT = 25;

function createMessageRepository(options) {
  const deps = { ...options };
  return {
    saveMessage: (text, source, timestamp, appId) =>
      saveMessage(deps, text, source, timestamp, appId),
    saveMessageRecord: (record) => saveMessageRecord(deps, record),
    getRawMessageById: (messageId, appId) => getRawMessageById(deps, messageId, appId),
    getRawMessageByClientMessageId: (clientMessageId, source, appId) =>
      getRawMessageByClientMessageId(deps, clientMessageId, source, appId),
    getMessageById: (messageId, appId) => getMessageById(deps, messageId, appId),
    getMessageByClientMessageId: (clientMessageId, source, appId) =>
      getMessageByClientMessageId(deps, clientMessageId, source, appId),
    getRecentMessages: (limit, appId, beforeTimestamp) =>
      getRecentMessages(deps, limit, appId, beforeTimestamp),
    getMessagesAfterCursor: (appId, cursor, limit) =>
      getMessagesAfterCursor(deps, appId, cursor, limit),
    getMessagesAroundMessage: (targetMessageId, appId, beforeLimit, afterLimit) =>
      getMessagesAroundMessage(deps, targetMessageId, appId, beforeLimit, afterLimit),
    getMessageCount: (appId) => getMessageCount(deps, appId),
  };
}

function saveMessage(deps, text, source, timestamp, appId = "default") {
  const payload = JSON.stringify({ text: typeof text === "string" ? text : "" });
  return insertMessage(deps, { text: payload, source, timestamp, appId }) !== null;
}

function saveMessageRecord(deps, record) {
  const insertedId = insertMessage(deps, record);
  if (!insertedId) {
    return null;
  }
  return getMessageById(deps, insertedId, record.appId);
}

function insertMessage(deps, record) {
  if (!deps.ensureInitialized()) {
    return null;
  }
  const safeClientMessageId = normalizeClientMessageId(record.clientMessageId);
  if (safeClientMessageId) {
    const existing = getMessageByClientMessageId(
      deps,
      safeClientMessageId,
      record.source,
      record.appId,
    );
    if (existing?.id) {
      return existing.id;
    }
  }
  return runInsertMessage(deps, record, safeClientMessageId);
}

function runInsertMessage(deps, record, safeClientMessageId) {
  const safeQuoteId = deps.parsePositiveMessageId(record.quoteMessageId);
  const appId = record.appId || "default";
  const sql =
    "INSERT INTO messages (text, source, timestamp, app_id, quote_message_id, client_message_id) VALUES (?, ?, ?, ?, ?, ?)";
  try {
    deps
      .getDatabase()
      .run(sql, [
        record.text,
        record.source,
        record.timestamp,
        appId,
        safeQuoteId,
        safeClientMessageId,
      ]);
    return getLastInsertedId(deps);
  } catch (error) {
    console.error(`[DB] Failed to save message: ${error.message}`);
    return null;
  }
}

function getLastInsertedId(deps) {
  const row = querySingleRow(
    deps,
    "SELECT last_insert_rowid() AS id",
    [],
    "Failed to resolve last inserted id",
  );
  return deps.parsePositiveMessageId(row?.id);
}

function getMessageById(deps, messageId, appId = "default") {
  const row = getRawMessageById(deps, messageId, appId);
  return row ? deps.mapMessageRow(row) : null;
}

function getMessageByClientMessageId(deps, clientMessageId, source, appId = "default") {
  const row = getRawMessageByClientMessageId(deps, clientMessageId, source, appId);
  return row ? deps.mapMessageRow(row) : null;
}

function getRawMessageById(deps, messageId, appId = "default") {
  if (!deps.ensureInitialized()) {
    return null;
  }
  const safeMessageId = deps.parsePositiveMessageId(messageId);
  if (!safeMessageId) {
    return null;
  }
  const sql = `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE id = ? AND app_id = ?
    LIMIT 1
  `;
  return querySingleRow(deps, sql, [safeMessageId, appId], "Failed to get message by id");
}

function getRawMessageByClientMessageId(deps, clientMessageId, source, appId = "default") {
  if (!deps.ensureInitialized()) {
    return null;
  }
  const safeClientMessageId = normalizeClientMessageId(clientMessageId);
  if (!safeClientMessageId) {
    return null;
  }
  const sql = `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ? AND source = ? AND client_message_id = ?
    ORDER BY id DESC
    LIMIT 1
  `;
  return querySingleRow(
    deps,
    sql,
    [appId, source, safeClientMessageId],
    "Failed to get message by client_message_id",
  );
}

function getRecentMessages(
  deps,
  limit = DEFAULT_RECENT_LIMIT,
  appId = "default",
  beforeTimestamp = null,
) {
  if (!deps.ensureInitialized()) {
    return [];
  }
  const withPagination = beforeTimestamp !== null && beforeTimestamp !== undefined;
  const sql = withPagination ? buildPagedRecentSql() : buildRecentSql();
  const params = withPagination ? [appId, beforeTimestamp, limit] : [appId, limit];
  const rows = queryRows(deps, sql, params, "Failed to get messages");
  return rows.map(deps.mapMessageRow).reverse();
}

function getMessagesAfterCursor(
  deps,
  appId = "default",
  cursor = {},
  limit = DEFAULT_RECENT_LIMIT,
) {
  if (!deps.ensureInitialized()) {
    return [];
  }
  const safeLimit = deps.parsePositiveInt(limit, DEFAULT_RECENT_LIMIT);
  const normalizedCursor = deps.normalizeCursor(cursor);
  const sql = `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ?
      AND (timestamp > ? OR (timestamp = ? AND id > ?))
    ORDER BY timestamp ASC, id ASC
    LIMIT ?
  `;
  const rows = queryRows(
    deps,
    sql,
    [appId, normalizedCursor.timestamp, normalizedCursor.timestamp, normalizedCursor.id, safeLimit],
    "Failed to get messages after cursor",
  );
  return rows.map(deps.mapMessageRow);
}

function getMessagesAroundMessage(
  deps,
  targetMessageId,
  appId = "default",
  beforeLimit = DEFAULT_AROUND_LIMIT,
  afterLimit = DEFAULT_AROUND_LIMIT,
) {
  if (!deps.ensureInitialized()) {
    return [];
  }
  const target = getRawMessageById(deps, targetMessageId, appId);
  if (!target) {
    return [];
  }
  return queryAroundMessages(deps, target, appId, beforeLimit, afterLimit);
}

function queryAroundMessages(deps, target, appId, beforeLimit, afterLimit) {
  const targetTimestamp = Number.parseInt(String(target.timestamp), 10);
  const targetId = deps.parsePositiveMessageId(target.id);
  if (!Number.isFinite(targetTimestamp) || !targetId) {
    return [];
  }
  const safeBefore = deps.parsePositiveInt(beforeLimit, DEFAULT_AROUND_LIMIT);
  const safeAfter = deps.parsePositiveInt(afterLimit, DEFAULT_AROUND_LIMIT);
  const olderRows = queryOlderAroundRows(deps, appId, targetTimestamp, targetId, safeBefore + 1);
  const newerRows = queryNewerAroundRows(deps, appId, targetTimestamp, targetId, safeAfter);
  return [...olderRows.reverse(), ...newerRows].map(deps.mapMessageRow);
}

function queryOlderAroundRows(deps, appId, targetTimestamp, targetId, limit) {
  const sql = `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ?
      AND (timestamp < ? OR (timestamp = ? AND id <= ?))
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `;
  return queryRows(
    deps,
    sql,
    [appId, targetTimestamp, targetTimestamp, targetId, limit],
    "Failed to get messages around target",
  );
}

function queryNewerAroundRows(deps, appId, targetTimestamp, targetId, limit) {
  const sql = `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ?
      AND (timestamp > ? OR (timestamp = ? AND id > ?))
    ORDER BY timestamp ASC, id ASC
    LIMIT ?
  `;
  return queryRows(
    deps,
    sql,
    [appId, targetTimestamp, targetTimestamp, targetId, limit],
    "Failed to get messages around target",
  );
}

function getMessageCount(deps, appId) {
  if (!deps.ensureInitialized()) {
    return 0;
  }
  const hasAppFilter = Boolean(appId);
  const sql = hasAppFilter
    ? "SELECT COUNT(*) as count FROM messages WHERE app_id = ?"
    : "SELECT COUNT(*) as count FROM messages";
  const params = hasAppFilter ? [appId] : [];
  const row = querySingleRow(deps, sql, params, "Failed to get message count");
  return row?.count || 0;
}

function buildRecentSql() {
  return `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ?
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `;
}

function buildPagedRecentSql() {
  return `
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ? AND timestamp < ?
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `;
}

function queryRows(deps, sql, params, errorPrefix) {
  try {
    const stmt = deps.getDatabase().prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error(`[DB] ${errorPrefix}: ${error.message}`);
    return [];
  }
}

function querySingleRow(deps, sql, params, errorPrefix) {
  try {
    const stmt = deps.getDatabase().prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const hasRow = stmt.step();
    const row = hasRow ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  } catch (error) {
    console.error(`[DB] ${errorPrefix}: ${error.message}`);
    return null;
  }
}

function normalizeClientMessageId(clientMessageId) {
  const normalized = typeof clientMessageId === "string" ? clientMessageId.trim() : "";
  return normalized || null;
}

module.exports = { createMessageRepository };
