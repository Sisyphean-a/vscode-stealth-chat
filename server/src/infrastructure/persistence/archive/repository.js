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
  const archiveReason = deps.normalizeArchiveReason(reason, deps.validArchiveReasons);
  return runArchiveTransaction(deps, messages, archiveReason);
}

function runArchiveTransaction(deps, messages, archiveReason) {
  const database = deps.getDatabase();
  const archivedAt = Date.now();
  database.run("BEGIN TRANSACTION");
  try {
    for (const row of messages) {
      const message = deps.validateMessageRow(row, deps.normalizeAppId, deps.normalizeTimestamp);
      insertArchiveRow(database, message, archivedAt, archiveReason);
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

function getArchivedMessages(deps, options = {}) {
  deps.assertInitialized();
  const appId = deps.normalizeAppId(options.appId);
  const beforeTimestamp = deps.normalizeTimestamp(options.beforeTimestamp);
  const includeRestored = options.includeRestored === true;
  const limit = deps.parsePositiveInt(options.limit, deps.defaultListLimit);
  const sql = buildArchiveListSql(Boolean(appId), beforeTimestamp !== null, includeRestored);
  const params = [];
  if (appId) {
    params.push(appId);
  }
  if (beforeTimestamp !== null) {
    params.push(beforeTimestamp);
  }
  params.push(limit);
  return queryRows(deps, sql, params).reverse();
}

function buildArchiveListSql(hasAppFilter, hasBeforeFilter, includeRestored) {
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

function getArchivedRowsByIds(deps, archiveIds, includeRestored = false) {
  deps.assertInitialized();
  const ids = deps.normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return [];
  }
  const placeholders = deps.buildPlaceholders(ids.length);
  const restoredClause = includeRestored ? "" : " AND restored_at IS NULL";
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE archive_id IN (${placeholders})${restoredClause}
    ORDER BY archive_id ASC
  `;
  return queryRows(deps, sql, ids);
}

function markRestored(deps, archiveIds) {
  deps.assertInitialized();
  const ids = deps.normalizeArchiveIds(archiveIds);
  if (ids.length === 0) {
    return 0;
  }
  const placeholders = deps.buildPlaceholders(ids.length);
  const sql = `
    UPDATE archived_messages
    SET restored_at = ?
    WHERE archive_id IN (${placeholders}) AND restored_at IS NULL
  `;
  deps.getDatabase().run(sql, [Date.now(), ...ids]);
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
  const sql = `SELECT COUNT(*) as count FROM archived_messages${whereClause}`;
  const row = querySingleRow(deps, sql, params);
  return row?.count || 0;
}

function getArchiveMessageById(deps, archiveId, appId, includeRestored = false) {
  deps.assertInitialized();
  const parsedArchiveId = Number.parseInt(String(archiveId ?? ""), 10);
  if (!Number.isFinite(parsedArchiveId) || parsedArchiveId <= 0) {
    return null;
  }
  const normalizedAppId = deps.normalizeAppId(appId);
  const { whereClause, params } = buildArchiveByIdFilters(
    parsedArchiveId,
    normalizedAppId,
    includeRestored,
  );
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE ${whereClause}
    LIMIT 1
  `;
  return querySingleRow(deps, sql, params);
}

function buildArchiveByIdFilters(parsedArchiveId, normalizedAppId, includeRestored) {
  const conditions = ["archive_id = ?"];
  const params = [parsedArchiveId];
  if (normalizedAppId) {
    conditions.push("app_id = ?");
    params.push(normalizedAppId);
  }
  if (!includeRestored) {
    conditions.push("restored_at IS NULL");
  }
  return { whereClause: conditions.join(" AND "), params };
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
  const safeBeforeLimit = deps.parsePositiveInt(beforeLimit, deps.defaultAroundLimit);
  const safeAfterLimit = deps.parsePositiveInt(afterLimit, deps.defaultAroundLimit);
  const olderRows = queryOlderAroundArchiveRows(
    deps,
    target,
    targetTimestamp,
    targetArchiveId,
    safeBeforeLimit + 1,
  );
  const newerRows = queryNewerAroundArchiveRows(
    deps,
    target,
    targetTimestamp,
    targetArchiveId,
    safeAfterLimit,
  );
  return [...olderRows.reverse(), ...newerRows];
}

function queryOlderAroundArchiveRows(deps, target, targetTimestamp, targetArchiveId, limit) {
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE app_id = ? AND restored_at IS NULL
      AND (timestamp < ? OR (timestamp = ? AND archive_id <= ?))
    ORDER BY timestamp DESC, archive_id DESC
    LIMIT ?
  `;
  return queryRows(deps, sql, [
    target.app_id,
    targetTimestamp,
    targetTimestamp,
    targetArchiveId,
    limit,
  ]);
}

function queryNewerAroundArchiveRows(deps, target, targetTimestamp, targetArchiveId, limit) {
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE app_id = ? AND restored_at IS NULL
      AND (timestamp > ? OR (timestamp = ? AND archive_id > ?))
    ORDER BY timestamp ASC, archive_id ASC
    LIMIT ?
  `;
  return queryRows(deps, sql, [
    target.app_id,
    targetTimestamp,
    targetTimestamp,
    targetArchiveId,
    limit,
  ]);
}

function searchArchivedMessages(deps, options = {}) {
  deps.assertInitialized();
  const appId = deps.normalizeAppId(options.appId);
  const keyword = String(options.keyword || "").trim();
  if (!appId || keyword.length === 0) {
    return [];
  }
  const limit = deps.parsePositiveInt(options.limit, deps.defaultListLimit);
  const sql = `
    SELECT archive_id, app_id, text, source, timestamp, original_message_id, archived_at, archive_reason, restored_at
    FROM archived_messages
    WHERE app_id = ? AND restored_at IS NULL AND text LIKE ?
    ORDER BY timestamp DESC, archive_id DESC
    LIMIT ?
  `;
  const rows = queryRows(deps, sql, [appId, `%${keyword}%`, limit]);
  const lowerKeyword = keyword.toLowerCase();
  return rows.filter((row) =>
    String(row.text || "")
      .toLowerCase()
      .includes(lowerKeyword),
  );
}

function queryRows(deps, sql, params) {
  const stmt = deps.getDatabase().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function querySingleRow(deps, sql, params) {
  const stmt = deps.getDatabase().prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

module.exports = { createArchiveRepository };
