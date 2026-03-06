const ARCHIVE_COLUMNS = [
  "archive_id",
  "app_id",
  "text",
  "source",
  "timestamp",
  "original_message_id",
  "archived_at",
  "archive_reason",
  "quote_message_id",
  "client_message_id",
  "restored_at",
].join(", ");

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
    SELECT ${ARCHIVE_COLUMNS}
    FROM archived_messages
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `;
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

function queryRows(database, sql, params) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function querySingleRow(database, sql, params) {
  const stmt = database.prepare(sql);
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

function queryOlderAroundArchiveRows(database, target, targetTimestamp, targetArchiveId, limit) {
  const sql = `
    SELECT ${ARCHIVE_COLUMNS}
    FROM archived_messages
    WHERE app_id = ? AND restored_at IS NULL
      AND (timestamp < ? OR (timestamp = ? AND archive_id <= ?))
    ORDER BY timestamp DESC, archive_id DESC
    LIMIT ?
  `;
  return queryRows(database, sql, [
    target.app_id,
    targetTimestamp,
    targetTimestamp,
    targetArchiveId,
    limit,
  ]);
}

function queryNewerAroundArchiveRows(database, target, targetTimestamp, targetArchiveId, limit) {
  const sql = `
    SELECT ${ARCHIVE_COLUMNS}
    FROM archived_messages
    WHERE app_id = ? AND restored_at IS NULL
      AND (timestamp > ? OR (timestamp = ? AND archive_id > ?))
    ORDER BY timestamp ASC, archive_id ASC
    LIMIT ?
  `;
  return queryRows(database, sql, [
    target.app_id,
    targetTimestamp,
    targetTimestamp,
    targetArchiveId,
    limit,
  ]);
}

module.exports = {
  ARCHIVE_COLUMNS,
  buildArchiveListSql,
  buildArchiveByIdFilters,
  queryRows,
  querySingleRow,
  queryOlderAroundArchiveRows,
  queryNewerAroundArchiveRows,
};
