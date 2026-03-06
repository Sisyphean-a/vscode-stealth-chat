const initSqlJs = require("sql.js");
const path = require("path");
const archiveDb = require("./archiveDb");
const { createSchema } = require("./infrastructure/persistence/messageSchema");
const {
  parsePositiveMessageId,
  normalizeCursor,
  mapMessageRow,
  mapArchivedRow,
  mapArchivedRowToChatMessage,
} = require("./infrastructure/persistence/messageMapper");
const { buildDbServices } = require("./infrastructure/persistence/dbServices");
const {
  createStoragePairPersistence,
} = require("./infrastructure/persistence/storagePairPersistence");
const {
  parsePositiveInt,
  resolveDbConfig,
  ensureDataDir,
  loadDatabaseBuffer,
  buildPlaceholders,
  clearTimers,
  resetDbState,
  startCleanupTask,
  startSaveTask,
} = require("./infrastructure/persistence/dbRuntime");

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
  repository: null,
  messageSearchService: null,
  archiveCleanupService: null,
  messageRestoreService: null,
  archiveViewService: null,
};

function getDatabase() {
  return state.db;
}

function getRuntimeConfig() {
  return state.config;
}

function ensureInitialized() {
  return Boolean(state.isInitialized && state.db && state.config && state.repository);
}

function assignServices(services) {
  state.repository = services.repository;
  state.messageRestoreService = services.messageRestoreService;
  state.messageSearchService = services.messageSearchService;
  state.archiveCleanupService = services.archiveCleanupService;
  state.archiveViewService = services.archiveViewService;
}

function getPairPersistence() {
  return createStoragePairPersistence({
    dbPath: state.config.dbPath,
    archiveDbPath: state.config.archiveDbPath,
  });
}

async function init(options = {}) {
  if (state.isInitialized) {
    await close();
  }
  try {
    state.config = resolveDbConfig(options, {
      defaultDbPath: DEFAULT_DB_PATH,
      defaultRetentionDays: DEFAULT_RETENTION_DAYS,
      defaultMaxCount: DEFAULT_MAX_COUNT,
    });
    await ensureDataDir(state.config.dbPath);
    await getPairPersistence().recoverPendingCommit();
    const SQL = await initSqlJs();
    const buffer = await loadDatabaseBuffer(state.config.dbPath);
    state.db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    createSchema(state.db);
    await archiveDb.init(SQL, { archiveDbPath: state.config.archiveDbPath });
    state.isInitialized = true;
    assignServices(
      buildDbServices({
        ensureInitialized,
        getDatabase,
        parsePositiveInt,
        parsePositiveMessageId,
        normalizeCursor,
        mapMessageRow,
        mapArchivedRow,
        mapArchivedRowToChatMessage,
        getRuntimeConfig,
        buildPlaceholders,
        archiveDb,
        saveToFile,
      }),
    );
    const saved = await saveToFile();
    if (!saved) {
      throw new Error(`Unable to persist database snapshot at ${state.config.dbPath}`);
    }
    clearTimers(state);
    startCleanupTask(state, CLEANUP_INTERVAL_MS, cleanupOldMessages);
    startSaveTask(state, SAVE_INTERVAL_MS, saveToFile);
    console.log("[DB] Cleanup task started (runs every hour)");
    console.log("[DB] Auto-save task started (runs every 5 minutes)");
    console.log(`[DB] Initialized at ${state.config.dbPath}`);
  } catch (error) {
    await handleInitFailure(error);
  }
}

async function handleInitFailure(error) {
  clearTimers(state);
  if (state.db) {
    state.db.close();
  }
  resetDbState(state);
  await archiveDb.close();
  throw new Error(`[DB] Initialization failed: ${error.message}`);
}

async function persistSnapshotPair() {
  await getPairPersistence().savePair(Buffer.from(state.db.export()), archiveDb.exportToBuffer());
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
      await persistSnapshotPair();
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
  return state.repository.saveMessage(text, source, timestamp, appId);
}

function saveMessageRecord(options) {
  return state.repository.saveMessageRecord(options);
}

function getRecentMessages(limit = 50, appId = "default", beforeTimestamp = null) {
  return state.repository.getRecentMessages(limit, appId, beforeTimestamp);
}

function getMessagesAfterCursor(appId = "default", cursor = {}, limit = 50) {
  return state.repository.getMessagesAfterCursor(appId, cursor, limit);
}

function getMessageById(messageId, appId = "default") {
  return state.repository.getMessageById(messageId, appId);
}

function getMessageByClientMessageId(clientMessageId, source, appId = "default") {
  return state.repository.getMessageByClientMessageId(clientMessageId, source, appId);
}

function getMessagesAroundMessage(
  targetMessageId,
  appId = "default",
  beforeLimit = 25,
  afterLimit = 25,
) {
  return state.repository.getMessagesAroundMessage(targetMessageId, appId, beforeLimit, afterLimit);
}

function searchMessages(options = {}) {
  return state.messageSearchService.searchMessages(options);
}

function getMessageCount(appId) {
  return state.repository.getMessageCount(appId);
}

async function cleanupOldMessages() {
  await state.archiveCleanupService.cleanupOldMessages();
}

function getArchivedMessages(
  limit = 50,
  appId = null,
  beforeTimestamp = null,
  includeRestored = false,
) {
  return state.archiveViewService.getArchivedMessages(
    limit,
    appId,
    beforeTimestamp,
    includeRestored,
  );
}

function getArchivedMessagesAround(
  archiveId,
  appId = "default",
  beforeLimit = 25,
  afterLimit = 25,
) {
  return state.archiveViewService.getArchivedMessagesAround(
    archiveId,
    appId,
    beforeLimit,
    afterLimit,
  );
}

function getArchiveMessageCount(appId, includeRestored = false) {
  return state.archiveViewService.getArchiveMessageCount(appId, includeRestored);
}

async function restoreArchivedMessages(archiveIds) {
  return state.messageRestoreService.restoreArchivedMessages(archiveIds);
}

async function close() {
  clearTimers(state);
  if (!state.db) {
    resetDbState(state);
    await archiveDb.close();
    return;
  }
  await saveToFile();
  state.db.close();
  console.log("[DB] Connection closed");
  resetDbState(state);
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
  getMessagesAfterCursor,
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
