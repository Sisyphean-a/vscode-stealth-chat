const {
  ARCHIVE_COLUMNS,
  buildArchiveListSql,
  buildArchiveByIdFilters,
  queryRows,
  querySingleRow,
  queryOlderAroundArchiveRows,
  queryNewerAroundArchiveRows,
} = require("./sql");

function createArchiveRepository(options) {
  const deps = { ...options };
  return {
    archiveMessages: (messages, reason) => archiveMessages(deps, messages, reason),
    getArchivedMessages: (input) => getArchivedMessages(deps, input),
    getArchivedRowsByIds: (archiveIds, includeRestored) =>
      getArchivedRowsByIds(deps, archiveIds, includeRestored),
    markRestored: (archiveIds) => markRestored(deps, archiveIds),
    getArchiveMessageCount: (appId, includeRestored) =>
      getArchiveMessageCount(deps, appId, includeRestored),
    getArchiveMessageById: (archiveId, appId, includeRestored) =>
      getArchiveMessageById(deps, archiveId, appId, includeRestored),
    getMessagesAroundArchiveId: (archiveId, appId, beforeLimit, afterLimit) =>
      getMessagesAroundArchiveId(deps, archiveId, appId, beforeLimit, afterLimit),
    searchArchivedMessages: (input) => searchArchivedMessages(deps, input),
  };
}

function archiveMessages(deps, messages, reason) {
  deps.assertInitialized();
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  return runArchiveTransaction(
    deps.getDatabase(),
    messages,
    deps.normalizeArchiveReason(reason, deps.validArchiveReasons),
    (row) => deps.validateMessageRow(row, deps.normalizeAppId, deps.normalizeTimestamp),
  );
}

function runArchiveTransaction(database, messages, archiveReason, validateRow) {
  const archivedAt = Date.now();
  database.run("BEGIN TRANSACTION");
  try {
    for (const row of messages) {
      insertArchiveRow(database, validateRow(row), archivedAt, archiveReason);
    }
    database.run("COMMIT");
    return messages.length;
  } catch (error) {
    database.run("ROLLBACK");
    throw new Error(`[ArchiveDB] Failed to archive messages: ${error.message}`);
  }
}

function insertArchiveRow(database, message, archivedAt, archiveReason) {
  database.run(
    `
      INSERT INTO archived_messages (
        app_id,
        text,
        source,
        timestamp,
        original_message_id,
        archived_at,
        archive_reason,
        quote_message_id,
        client_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      message.appId,
      message.text,
      message.source,
      message.timestamp,
      message.messageId,
      archivedAt,
      archiveReason,
      message.quoteMessageId,
      message.clientMessageId,
    ],
  );
}

function getArchivedMessages(deps, options = {}) {
  deps.assertInitialized();
  const appId = deps.normalizeAppId(options.appId);
  const beforeTimestamp = deps.normalizeTimestamp(options.beforeTimestamp);
  const includeRestored = options.includeRestored === true;
  const limit = deps.parsePositiveInt(options.limit, deps.defaultListLimit);
  const params = [];
  if (appId) {
    params.push(appId);
  }
  if (beforeTimestamp !== null) {
    params.push(beforeTimestamp);
  }
  params.push(limit);
  return queryRows(
    deps.getDatabase(),
    buildArchiveListSql(Boolean(appId), beforeTimestamp !== null, includeRestored),
    params,
  ).reverse();
}

function getArchivedRowsByIds(deps, archiveIds, includeRestored = false) {
  deps.assertInitialized();
  const ids = deps.normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return [];
  }
  const placeholders = deps.buildPlaceholders(ids.length);
  const restoredClause = includeRestored ? "" : " AND restored_at IS NULL";
  const sql = `
    SELECT ${ARCHIVE_COLUMNS}
    FROM archived_messages
    WHERE archive_id IN (${placeholders})${restoredClause}
    ORDER BY archive_id ASC
  `;
  return queryRows(deps.getDatabase(), sql, ids);
}

function markRestored(deps, archiveIds) {
  deps.assertInitialized();
  const ids = deps.normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return 0;
  }
  const placeholders = deps.buildPlaceholders(ids.length);
  deps.getDatabase().run(
    `
      UPDATE archived_messages
      SET restored_at = ?
      WHERE archive_id IN (${placeholders}) AND restored_at IS NULL
    `,
    [Date.now(), ...ids],
  );
  return deps.getDatabase().getRowsModified();
}

function getArchiveMessageCount(deps, appId, includeRestored = false) {
  deps.assertInitialized();
  const normalizedAppId = deps.normalizeAppId(appId);
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
  const row = querySingleRow(
    deps.getDatabase(),
    `SELECT COUNT(*) as count FROM archived_messages${whereClause}`,
    params,
  );
  return row?.count || 0;
}

function getArchiveMessageById(deps, archiveId, appId, includeRestored = false) {
  deps.assertInitialized();
  const parsedArchiveId = Number.parseInt(String(archiveId ?? ""), 10);
  if (!Number.isFinite(parsedArchiveId) || parsedArchiveId <= 0) {
    return null;
  }
  const filters = buildArchiveByIdFilters(
    parsedArchiveId,
    deps.normalizeAppId(appId),
    includeRestored,
  );
  return querySingleRow(
    deps.getDatabase(),
    `SELECT ${ARCHIVE_COLUMNS} FROM archived_messages WHERE ${filters.whereClause} LIMIT 1`,
    filters.params,
  );
}

function getMessagesAroundArchiveId(
  deps,
  archiveId,
  appId,
  beforeLimit = deps.defaultAroundLimit,
  afterLimit = deps.defaultAroundLimit,
) {
  deps.assertInitialized();
  const target = getArchiveMessageById(deps, archiveId, appId, false);
  if (!target) {
    return [];
  }
  return queryAroundArchiveRows(deps, target, beforeLimit, afterLimit);
}

function queryAroundArchiveRows(deps, target, beforeLimit, afterLimit) {
  const targetArchiveId = Number.parseInt(String(target.archive_id), 10);
  const targetTimestamp = Number.parseInt(String(target.timestamp), 10);
  if (
    !Number.isFinite(targetArchiveId) ||
    targetArchiveId <= 0 ||
    !Number.isFinite(targetTimestamp)
  ) {
    return [];
  }
  const safeBefore = deps.parsePositiveInt(beforeLimit, deps.defaultAroundLimit) + 1;
  const safeAfter = deps.parsePositiveInt(afterLimit, deps.defaultAroundLimit);
  const database = deps.getDatabase();
  const olderRows = queryOlderAroundArchiveRows(
    database,
    target,
    targetTimestamp,
    targetArchiveId,
    safeBefore,
  );
  const newerRows = queryNewerAroundArchiveRows(
    database,
    target,
    targetTimestamp,
    targetArchiveId,
    safeAfter,
  );
  return [...olderRows.reverse(), ...newerRows];
}

function searchArchivedMessages(deps, options = {}) {
  deps.assertInitialized();
  const appId = deps.normalizeAppId(options.appId);
  const keyword = String(options.keyword || "").trim();
  if (!appId || keyword.length === 0) {
    return [];
  }
  const limit = deps.parsePositiveInt(options.limit, deps.defaultListLimit);
  const rows = queryRows(
    deps.getDatabase(),
    `
      SELECT ${ARCHIVE_COLUMNS}
      FROM archived_messages
      WHERE app_id = ? AND restored_at IS NULL AND text LIKE ?
      ORDER BY timestamp DESC, archive_id DESC
      LIMIT ?
    `,
    [appId, `%${keyword}%`, limit],
  );
  const lowerKeyword = keyword.toLowerCase();
  return rows.filter((row) =>
    String(row.text || "")
      .toLowerCase()
      .includes(lowerKeyword),
  );
}

module.exports = { createArchiveRepository };
