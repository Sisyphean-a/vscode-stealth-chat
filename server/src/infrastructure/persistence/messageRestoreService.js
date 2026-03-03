function createMessageRestoreService(options) {
  const { ensureInitialized, getDatabase, saveToFile, archiveDb } = options;
  return {
    restoreArchivedMessages: (archiveIds) =>
      restoreArchivedMessages(ensureInitialized, getDatabase, saveToFile, archiveDb, archiveIds),
  };
}

async function restoreArchivedMessages(
  ensureInitialized,
  getDatabase,
  saveToFile,
  archiveDb,
  archiveIds,
) {
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
  const restored = restoreRowsToHotStorage(getDatabase(), rows);
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

function restoreRowsToHotStorage(database, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  database.run("BEGIN TRANSACTION");
  try {
    for (const row of rows) {
      database.run(
        "INSERT INTO messages (text, source, timestamp, app_id, quote_message_id) VALUES (?, ?, ?, ?, NULL)",
        [row.text, row.source, row.timestamp, row.app_id],
      );
    }
    database.run("COMMIT");
    return rows.length;
  } catch (error) {
    database.run("ROLLBACK");
    throw new Error(`[DB] Restore failed while writing hot messages: ${error.message}`);
  }
}

module.exports = { createMessageRestoreService };
