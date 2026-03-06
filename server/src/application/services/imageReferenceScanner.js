const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const UPLOAD_PREFIX = "/uploads/";
const HOT_QUERY = "SELECT text FROM messages WHERE text LIKE '%/uploads/%'";
const ARCHIVE_QUERY = "SELECT text FROM archived_messages WHERE text LIKE '%/uploads/%'";

async function scanReferencedImageFiles(options = {}) {
  const SQL = await initSqlJs();
  const references = new Set();
  await collectReferencesFromDatabase(SQL, options.hotDbPath, HOT_QUERY, references);
  await collectReferencesFromDatabase(SQL, options.archiveDbPath, ARCHIVE_QUERY, references);
  return references;
}

async function collectReferencesFromDatabase(SQL, dbPath, sql, references) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return;
  }
  const database = new SQL.Database(fs.readFileSync(dbPath));
  try {
    const stmt = database.prepare(sql);
    while (stmt.step()) {
      collectReferencesFromPayload(stmt.getAsObject().text, references);
    }
    stmt.free();
  } finally {
    database.close();
  }
}

function collectReferencesFromPayload(rawPayload, references) {
  if (typeof rawPayload !== "string") {
    throw new Error("[ImageStorage] Invalid message payload while scanning image references");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("[ImageStorage] Invalid message payload JSON while scanning image references");
  }
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  for (const attachment of attachments) {
    const filename = extractUploadFilename(attachment?.url);
    if (filename) {
      references.add(filename);
    }
  }
}

function extractUploadFilename(url) {
  if (typeof url !== "string" || !url.startsWith(UPLOAD_PREFIX)) {
    return null;
  }
  const candidate = url.slice(UPLOAD_PREFIX.length).trim();
  return candidate ? path.basename(candidate) : null;
}

module.exports = { scanReferencedImageFiles };
