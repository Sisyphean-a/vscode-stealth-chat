const fs = require("fs");
const path = require("path");

function parsePositiveInt(input, fallback) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDbConfig(options = {}, defaults = {}) {
  return {
    dbPath: options.dbPath || process.env.DB_PATH || defaults.defaultDbPath,
    retentionDays: parsePositiveInt(
      options.retentionDays ?? process.env.MESSAGE_RETENTION_DAYS,
      defaults.defaultRetentionDays,
    ),
    maxCount: parsePositiveInt(
      options.maxCount ?? process.env.MESSAGE_MAX_COUNT,
      defaults.defaultMaxCount,
    ),
    archiveDbPath: options.archiveDbPath || process.env.ARCHIVE_DB_PATH || undefined,
  };
}

async function ensureDataDir(dbPath) {
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
}

async function loadDatabaseBuffer(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  return fs.promises.readFile(dbPath);
}

function buildPlaceholders(count) {
  return new Array(count).fill("?").join(", ");
}

function clearTimers(state) {
  if (state.cleanupTimer) {
    clearInterval(state.cleanupTimer);
    state.cleanupTimer = null;
  }
  if (state.saveTimer) {
    clearInterval(state.saveTimer);
    state.saveTimer = null;
  }
}

function resetDbState(state) {
  state.db = null;
  state.isInitialized = false;
  state.config = null;
  state.pendingSave = false;
  state.isSaving = false;
  state.repository = null;
  state.messageSearchService = null;
  state.archiveCleanupService = null;
  state.messageRestoreService = null;
  state.archiveViewService = null;
}

function startCleanupTask(state, intervalMs, task) {
  state.cleanupTimer = setInterval(() => {
    void task();
  }, intervalMs);
}

function startSaveTask(state, intervalMs, task) {
  state.saveTimer = setInterval(() => {
    void task();
  }, intervalMs);
}

module.exports = {
  parsePositiveInt,
  resolveDbConfig,
  ensureDataDir,
  loadDatabaseBuffer,
  buildPlaceholders,
  clearTimers,
  resetDbState,
  startCleanupTask,
  startSaveTask,
};
