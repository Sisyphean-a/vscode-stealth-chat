const { createMessageSearchService } = require("../../application/services/messageSearchService");
const { createArchiveCleanupService } = require("../../application/services/archiveCleanupService");
const { createMessageRepository } = require("./messageRepository");
const { createMessageRestoreService } = require("./messageRestoreService");
const { createArchiveViewService } = require("./archiveViewService");

function buildDbServices(options) {
  const repository = createMessageRepository({
    ensureInitialized: options.ensureInitialized,
    getDatabase: options.getDatabase,
    parsePositiveInt: options.parsePositiveInt,
    parsePositiveMessageId: options.parsePositiveMessageId,
    normalizeCursor: options.normalizeCursor,
    mapMessageRow: options.mapMessageRow,
  });
  return {
    repository,
    messageRestoreService: createMessageRestoreService({
      ensureInitialized: options.ensureInitialized,
      getDatabase: options.getDatabase,
      saveToFile: options.saveToFile,
      archiveDb: options.archiveDb,
    }),
    messageSearchService: createMessageSearchService({
      ensureInitialized: options.ensureInitialized,
      getDatabase: options.getDatabase,
      parsePositiveInt: options.parsePositiveInt,
      mapMessageRow: options.mapMessageRow,
      mapArchivedRow: options.mapArchivedRow,
      archiveDb: options.archiveDb,
    }),
    archiveCleanupService: createArchiveCleanupService({
      ensureInitialized: options.ensureInitialized,
      getDatabase: options.getDatabase,
      getConfig: options.getRuntimeConfig,
      getMessageCount: (appId) => repository.getMessageCount(appId),
      buildPlaceholders: options.buildPlaceholders,
      archiveDb: options.archiveDb,
      saveToFile: options.saveToFile,
    }),
    archiveViewService: createArchiveViewService({
      ensureInitialized: options.ensureInitialized,
      archiveDb: options.archiveDb,
      mapArchivedRow: options.mapArchivedRow,
      mapArchivedRowToChatMessage: options.mapArchivedRowToChatMessage,
    }),
  };
}

module.exports = { buildDbServices };
