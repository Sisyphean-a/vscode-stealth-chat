const fs = require("fs");

const PENDING_SUFFIX = ".pending";
const COMMIT_MARKER_SUFFIX = ".commit.json";

function createStoragePairPersistence(options) {
  const paths = resolvePaths(options);
  return {
    getPendingPaths: () => buildPendingPaths(paths),
    recoverPendingCommit: () => recoverPendingCommit(paths),
    savePair: (hotBuffer, archiveBuffer) => savePair(paths, hotBuffer, archiveBuffer),
  };
}

function resolvePaths(options = {}) {
  const dbPath = typeof options.dbPath === "string" ? options.dbPath.trim() : "";
  const archiveDbPath =
    typeof options.archiveDbPath === "string" ? options.archiveDbPath.trim() : "";
  if (!dbPath || !archiveDbPath) {
    throw new Error("[DB] Coordinated persistence requires dbPath and archiveDbPath");
  }
  return { dbPath, archiveDbPath };
}

function buildPendingPaths(paths) {
  return {
    hotPendingPath: `${paths.dbPath}${PENDING_SUFFIX}`,
    archivePendingPath: `${paths.archiveDbPath}${PENDING_SUFFIX}`,
    commitMarkerPath: `${paths.dbPath}${COMMIT_MARKER_SUFFIX}`,
  };
}

async function recoverPendingCommit(paths) {
  const pendingPaths = buildPendingPaths(paths);
  if (!fs.existsSync(pendingPaths.commitMarkerPath)) {
    await cleanupPendingFiles(pendingPaths);
    return;
  }
  await promotePendingFile(pendingPaths.hotPendingPath, paths.dbPath);
  await promotePendingFile(pendingPaths.archivePendingPath, paths.archiveDbPath);
  await removeIfExists(pendingPaths.commitMarkerPath);
}

async function savePair(paths, hotBuffer, archiveBuffer) {
  const pendingPaths = buildPendingPaths(paths);
  let markerWritten = false;
  await cleanupPendingFiles(pendingPaths);
  try {
    await writeSnapshotBuffer(pendingPaths.hotPendingPath, hotBuffer);
    await writeSnapshotBuffer(pendingPaths.archivePendingPath, archiveBuffer);
    await fs.promises.writeFile(
      pendingPaths.commitMarkerPath,
      JSON.stringify({ archiveDbPath: paths.archiveDbPath }),
    );
    markerWritten = true;
    await promotePendingFile(pendingPaths.hotPendingPath, paths.dbPath);
    await promotePendingFile(pendingPaths.archivePendingPath, paths.archiveDbPath);
    await removeIfExists(pendingPaths.commitMarkerPath);
  } catch (error) {
    if (!markerWritten) {
      await cleanupPendingFiles(pendingPaths);
    }
    throw new Error(`[DB] Failed to persist coordinated snapshots: ${error.message}`);
  }
}

async function writeSnapshotBuffer(filePath, buffer) {
  const nextBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  await fs.promises.mkdir(require("path").dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, nextBuffer);
}

async function promotePendingFile(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  try {
    await fs.promises.rename(sourcePath, targetPath);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") {
      throw error;
    }
    await removeIfExists(targetPath);
    await fs.promises.rename(sourcePath, targetPath);
  }
}

async function cleanupPendingFiles(pendingPaths) {
  await removeIfExists(pendingPaths.hotPendingPath);
  await removeIfExists(pendingPaths.archivePendingPath);
}

async function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  await fs.promises.rm(targetPath, { force: true });
}

module.exports = { createStoragePairPersistence };
