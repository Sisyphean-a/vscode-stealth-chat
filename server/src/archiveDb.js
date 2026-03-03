const fs = require("fs");
const path = require("path");
const {
  DEFAULT_ARCHIVE_DB_PATH,
  DEFAULT_ARCHIVE_LIST_LIMIT,
  DEFAULT_AROUND_LIMIT,
  ARCHIVE_REASON_RETENTION,
  ARCHIVE_REASON_MAX_COUNT,
  ARCHIVE_REASON_MANUAL,
  VALID_ARCHIVE_REASONS,
} = require("./infrastructure/persistence/archive/constants");
const {
  parsePositiveInt,
  normalizeArchiveReason,
  normalizeArchiveIds,
  normalizeTimestamp,
  normalizeAppId,
  buildPlaceholders,
  validateMessageRow,
} = require("./infrastructure/persistence/archive/normalizers");
const { createArchiveSchema } = require("./infrastructure/persistence/archive/schema");
const { createArchiveRepository } = require("./infrastructure/persistence/archive/repository");

const state = {
  db: null,
  isInitialized: false,
  config: null,
  isSaving: false,
  pendingSave: false,
  repository: null,
};

function getDatabase() {
  return state.db;
}

function resolveConfig(options = {}) {
  const fallbackPath = path.join(__dirname, "../data", DEFAULT_ARCHIVE_DB_PATH);
  return {
    dbPath: options.archiveDbPath || process.env.ARCHIVE_DB_PATH || fallbackPath,
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

function ensureInitialized() {
  return state.isInitialized && state.db && state.config && state.repository;
}

function assertInitialized() {
  if (!ensureInitialized()) {
    throw new Error("[ArchiveDB] Database is not initialized");
  }
}

function resetState() {
  state.db = null;
  state.isInitialized = false;
  state.config = null;
  state.pendingSave = false;
  state.isSaving = false;
  state.repository = null;
}

function buildRepository() {
  return createArchiveRepository({
    getDatabase,
    assertInitialized,
    parsePositiveInt,
    normalizeArchiveReason,
    normalizeArchiveIds,
    normalizeTimestamp,
    normalizeAppId,
    buildPlaceholders,
    validateMessageRow,
    validArchiveReasons: VALID_ARCHIVE_REASONS,
    defaultListLimit: DEFAULT_ARCHIVE_LIST_LIMIT,
    defaultAroundLimit: DEFAULT_AROUND_LIMIT,
  });
}

async function init(SQL, options = {}) {
  if (!SQL || typeof SQL.Database !== "function") {
    throw new Error("[ArchiveDB] Invalid SQL.js instance");
  }
  if (state.isInitialized) {
    await close();
  }

  state.config = resolveConfig(options);
  await ensureDataDir(state.config.dbPath);

  const buffer = await loadDatabaseBuffer(state.config.dbPath);
  state.db = buffer ? new SQL.Database(buffer) : new SQL.Database();
  createArchiveSchema(state.db);
  state.repository = buildRepository();
  state.isInitialized = true;

  const saved = await saveToFile();
  if (!saved) {
    throw new Error(`[ArchiveDB] Unable to persist snapshot at ${state.config.dbPath}`);
  }
  console.log(`[ArchiveDB] Initialized at ${state.config.dbPath}`);
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
    } while (state.pendingSave);
    return true;
  } catch (error) {
    console.error(`[ArchiveDB] Failed to save to file: ${error.message}`);
    return false;
  } finally {
    state.isSaving = false;
  }
}

function archiveMessages(messages, reason) {
  assertInitialized();
  return state.repository.archiveMessages(messages, reason);
}

function getArchivedMessages(options = {}) {
  assertInitialized();
  return state.repository.getArchivedMessages(options);
}

function getArchivedRowsByIds(archiveIds, includeRestored = false) {
  assertInitialized();
  return state.repository.getArchivedRowsByIds(archiveIds, includeRestored);
}

function markRestored(archiveIds) {
  assertInitialized();
  return state.repository.markRestored(archiveIds);
}

function getArchiveMessageCount(appId, includeRestored = false) {
  assertInitialized();
  return state.repository.getArchiveMessageCount(appId, includeRestored);
}

function getArchiveMessageById(archiveId, appId, includeRestored = false) {
  assertInitialized();
  return state.repository.getArchiveMessageById(archiveId, appId, includeRestored);
}

function getMessagesAroundArchiveId(
  archiveId,
  appId,
  beforeLimit = DEFAULT_AROUND_LIMIT,
  afterLimit = DEFAULT_AROUND_LIMIT,
) {
  assertInitialized();
  return state.repository.getMessagesAroundArchiveId(archiveId, appId, beforeLimit, afterLimit);
}

function searchArchivedMessages(options = {}) {
  assertInitialized();
  return state.repository.searchArchivedMessages(options);
}

async function close() {
  if (!state.db) {
    resetState();
    return;
  }

  await saveToFile();
  state.db.close();
  console.log("[ArchiveDB] Connection closed");
  resetState();
}

module.exports = {
  init,
  saveToFile,
  archiveMessages,
  getArchivedMessages,
  getArchivedRowsByIds,
  markRestored,
  getArchiveMessageCount,
  getArchiveMessageById,
  getMessagesAroundArchiveId,
  searchArchivedMessages,
  close,
  ARCHIVE_REASON_RETENTION,
  ARCHIVE_REASON_MAX_COUNT,
  ARCHIVE_REASON_MANUAL,
};
