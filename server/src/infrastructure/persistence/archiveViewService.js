function createArchiveViewService(options) {
  const { ensureInitialized, archiveDb, mapArchivedRow, mapArchivedRowToChatMessage } = options;
  return {
    getArchivedMessages: (limit, appId, beforeTimestamp, includeRestored) =>
      getArchivedMessages(
        ensureInitialized,
        archiveDb,
        mapArchivedRow,
        limit,
        appId,
        beforeTimestamp,
        includeRestored,
      ),
    getArchivedMessagesAround: (archiveId, appId, beforeLimit, afterLimit) =>
      getArchivedMessagesAround(
        ensureInitialized,
        archiveDb,
        mapArchivedRowToChatMessage,
        archiveId,
        appId,
        beforeLimit,
        afterLimit,
      ),
    getArchiveMessageCount: (appId, includeRestored) =>
      getArchiveMessageCount(ensureInitialized, archiveDb, appId, includeRestored),
  };
}

function getArchivedMessages(
  ensureInitialized,
  archiveDb,
  mapArchivedRow,
  limit = 50,
  appId = null,
  beforeTimestamp = null,
  includeRestored = false,
) {
  if (!ensureInitialized()) {
    return [];
  }
  const rows = archiveDb.getArchivedMessages({ limit, appId, beforeTimestamp, includeRestored });
  return rows.map(mapArchivedRow);
}

function getArchivedMessagesAround(
  ensureInitialized,
  archiveDb,
  mapArchivedRowToChatMessage,
  archiveId,
  appId = "default",
  beforeLimit = 25,
  afterLimit = 25,
) {
  if (!ensureInitialized()) {
    return [];
  }
  const rows = archiveDb.getMessagesAroundArchiveId(archiveId, appId, beforeLimit, afterLimit);
  return rows.map(mapArchivedRowToChatMessage);
}

function getArchiveMessageCount(ensureInitialized, archiveDb, appId, includeRestored = false) {
  if (!ensureInitialized()) {
    return 0;
  }
  return archiveDb.getArchiveMessageCount(appId, includeRestored);
}

module.exports = { createArchiveViewService };
