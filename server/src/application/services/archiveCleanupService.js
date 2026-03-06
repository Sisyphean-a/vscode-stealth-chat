const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MESSAGE_COLUMNS = "id, app_id, text, source, timestamp, quote_message_id, client_message_id";

function getDistinctAppIds(database) {
  const stmt = database.prepare("SELECT DISTINCT app_id FROM messages");
  const appIds = [];
  while (stmt.step()) {
    appIds.push(stmt.getAsObject().app_id);
  }
  stmt.free();
  return appIds;
}

function getRowsToArchiveByRetention(database, retentionTimestamp) {
  const stmt = database.prepare(`
    SELECT ${MESSAGE_COLUMNS}
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

function getRowsToArchiveByMaxCount(options) {
  const { database, maxCount, getMessageCount } = options;
  const rows = [];
  for (const appId of getDistinctAppIds(database)) {
    const count = getMessageCount(appId);
    if (count <= maxCount) {
      continue;
    }
    const stmt = database.prepare(`
      SELECT ${MESSAGE_COLUMNS}
      FROM messages
      WHERE app_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);
    stmt.bind([appId, count - maxCount]);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
  }
  return rows;
}

function deleteMessagesByIds(database, buildPlaceholders, messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return 0;
  }
  const placeholders = buildPlaceholders(messageIds.length);
  database.run(`DELETE FROM messages WHERE id IN (${placeholders})`, messageIds);
  return database.getRowsModified();
}

function archiveAndRemoveRows(options) {
  const { database, rows, reason, archiveDb, buildPlaceholders } = options;
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const archivedCount = archiveDb.archiveMessages(rows, reason);
  if (archivedCount !== rows.length) {
    throw new Error(`[DB] Archive count mismatch: expected ${rows.length}, got ${archivedCount}`);
  }
  const deletedCount = deleteMessagesByIds(
    database,
    buildPlaceholders,
    rows.map((row) => row.id),
  );
  if (deletedCount !== rows.length) {
    throw new Error(`[DB] Delete count mismatch: expected ${rows.length}, got ${deletedCount}`);
  }
  return archivedCount;
}

function createArchiveCleanupService(options) {
  const {
    ensureInitialized,
    getDatabase,
    getConfig,
    getMessageCount,
    buildPlaceholders,
    archiveDb,
    saveToFile,
  } = options;

  async function cleanupOldMessages() {
    if (!ensureInitialized()) {
      return;
    }
    try {
      const database = getDatabase();
      const config = getConfig();
      const retentionTimestamp = Date.now() - config.retentionDays * DAY_IN_MS;
      const archivedByRetention = archiveAndRemoveRows({
        database,
        rows: getRowsToArchiveByRetention(database, retentionTimestamp),
        reason: archiveDb.ARCHIVE_REASON_RETENTION,
        archiveDb,
        buildPlaceholders,
      });
      const archivedByCount = archiveAndRemoveRows({
        database,
        rows: getRowsToArchiveByMaxCount({ database, maxCount: config.maxCount, getMessageCount }),
        reason: archiveDb.ARCHIVE_REASON_MAX_COUNT,
        archiveDb,
        buildPlaceholders,
      });
      const totalArchived = archivedByRetention + archivedByCount;
      if (totalArchived > 0) {
        console.log(`[DB] Archived ${totalArchived} messages in cleanup task`);
      }
      await saveToFile();
    } catch (error) {
      console.error(`[DB] Cleanup failed: ${error.message}`);
    }
  }

  return { cleanupOldMessages };
}

module.exports = { createArchiveCleanupService };
