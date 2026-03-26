const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { cleanupOldImages } = require("./utils/imageStorage");
const {
  createStoragePairPersistence,
} = require("./infrastructure/persistence/storagePairPersistence");

const TEST_DB_PATH = path.join(__dirname, "../data/test.db");
const TEST_ARCHIVE_DB_PATH = path.join(__dirname, "../data/test.archive.db");
const TEST_IMAGES_DIR = path.join(__dirname, "../data/test-images");
const TEST_PAIR_DIR = path.join(__dirname, "../data/test-pair");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

process.env.DB_PATH = TEST_DB_PATH;
process.env.ARCHIVE_DB_PATH = TEST_ARCHIVE_DB_PATH;
process.env.MESSAGE_RETENTION_DAYS = "1";
process.env.MESSAGE_MAX_COUNT = "10";

const db = require("./db");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testsPassed += 1;
    return;
  }
  console.error(`❌ FAIL: ${message}`);
  testsFailed += 1;
}

function cleanup() {
  const paths = [TEST_DB_PATH, TEST_ARCHIVE_DB_PATH, TEST_IMAGES_DIR, TEST_PAIR_DIR];
  for (const target of paths) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function assertUsingTestDatabasePath() {
  assert(fs.existsSync(TEST_DB_PATH), `Test DB should exist at ${TEST_DB_PATH}`);
  assert(fs.existsSync(TEST_ARCHIVE_DB_PATH), `Archive DB should exist at ${TEST_ARCHIVE_DB_PATH}`);
}

function buildPayload(text, attachmentUrl) {
  const payload = { text };
  if (attachmentUrl) {
    payload.attachments = [{ type: "image", url: attachmentUrl, filename: "image.png", size: 1 }];
  }
  return JSON.stringify(payload);
}

function writeTestImage(filename) {
  fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_IMAGES_DIR, filename), Buffer.from("image"));
}

async function querySingleRowFromFile(dbPath, sql, params = []) {
  const SQL = await initSqlJs();
  const database = new SQL.Database(fs.readFileSync(dbPath));
  const stmt = database.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  database.close();
  return row;
}

async function testMetadataRestore() {
  console.log("\nTest 9: Restore Archived Metadata");
  const quoted = db.saveMessageRecord({
    text: buildPayload("Quoted root"),
    source: "mobile",
    timestamp: Date.now() + 1000,
    appId: "default",
  });
  const clientMessageId = "restore-client-id";
  db.saveMessageRecord({
    text: buildPayload("Restore metadata target"),
    source: "vscode",
    timestamp: Date.now() - 3 * DAY_IN_MS,
    appId: "default",
    quoteMessageId: quoted.id,
    clientMessageId,
  });
  await db.cleanupOldMessages();
  const archivedMessage = db
    .getArchivedMessages(20, null)
    .find((item) => item.text === "Restore metadata target");
  assert(Boolean(archivedMessage?.archiveId), "Target message should be archived before restore");
  await db.restoreArchivedMessages([archivedMessage.archiveId]);
  await db.saveToFile();
  const restoredRow = await querySingleRowFromFile(
    TEST_DB_PATH,
    "SELECT client_message_id, quote_message_id FROM messages WHERE client_message_id = ? ORDER BY id DESC LIMIT 1",
    [clientMessageId],
  );
  assert(
    restoredRow?.client_message_id === clientMessageId,
    "Restored row should keep client_message_id",
  );
  assert(
    Number(restoredRow?.quote_message_id) === quoted.id,
    "Restored row should keep quote_message_id",
  );
}

async function testImageCleanup() {
  console.log("\nTest 10: Image Cleanup Keeps Referenced Files");
  const oldTimestamp = Date.now() - 40 * DAY_IN_MS;
  const hotFile = `${oldTimestamp}-aaaaaaaaaaaaaaaa.png`;
  const archiveFile = `${oldTimestamp}-bbbbbbbbbbbbbbbb.png`;
  const orphanFile = `${oldTimestamp}-cccccccccccccccc.png`;
  writeTestImage(hotFile);
  writeTestImage(archiveFile);
  writeTestImage(orphanFile);
  db.saveMessageRecord({
    text: buildPayload("Hot image ref", `/uploads/${hotFile}`),
    source: "mobile",
    timestamp: Date.now() + 2000,
    appId: "default",
  });
  db.saveMessageRecord({
    text: buildPayload("Archive image ref", `/uploads/${archiveFile}`),
    source: "mobile",
    timestamp: Date.now() - 3 * DAY_IN_MS,
    appId: "default",
  });
  await db.cleanupOldMessages();
  await db.saveToFile();
  const cleanupResult = await cleanupOldImages({
    imagesDir: TEST_IMAGES_DIR,
    hotDbPath: TEST_DB_PATH,
    archiveDbPath: TEST_ARCHIVE_DB_PATH,
    retentionDays: 30,
    now: Date.now(),
  });
  assert(
    fs.existsSync(path.join(TEST_IMAGES_DIR, hotFile)),
    "Hot-message image should be preserved",
  );
  assert(
    fs.existsSync(path.join(TEST_IMAGES_DIR, archiveFile)),
    "Archived-message image should be preserved",
  );
  assert(
    !fs.existsSync(path.join(TEST_IMAGES_DIR, orphanFile)),
    "Unreferenced old image should be deleted",
  );
  assert(
    cleanupResult.deleted === 1,
    `Cleanup should delete exactly 1 orphan image, got ${cleanupResult.deleted}`,
  );
}

async function testPairPersistenceRecovery() {
  console.log("\nTest 11: Pair Persistence Recovery");
  fs.mkdirSync(TEST_PAIR_DIR, { recursive: true });
  const hotPath = path.join(TEST_PAIR_DIR, "messages.db");
  const archivePath = path.join(TEST_PAIR_DIR, "messages.archive.db");
  const persistence = createStoragePairPersistence({ dbPath: hotPath, archiveDbPath: archivePath });
  const paths = persistence.getPendingPaths();
  fs.writeFileSync(hotPath, Buffer.from("old-hot"));
  fs.writeFileSync(archivePath, Buffer.from("old-archive"));
  fs.writeFileSync(paths.hotPendingPath, Buffer.from("new-hot"));
  fs.writeFileSync(paths.archivePendingPath, Buffer.from("new-archive"));
  fs.writeFileSync(paths.commitMarkerPath, JSON.stringify({ archiveDbPath: archivePath }));
  fs.renameSync(paths.hotPendingPath, hotPath);
  await persistence.recoverPendingCommit();
  assert(
    fs.readFileSync(hotPath, "utf8") === "new-hot",
    "Recovery should keep promoted hot snapshot",
  );
  assert(
    fs.readFileSync(archivePath, "utf8") === "new-archive",
    "Recovery should promote archive snapshot",
  );
  assert(!fs.existsSync(paths.archivePendingPath), "Recovery should remove archive pending file");
  assert(!fs.existsSync(paths.commitMarkerPath), "Recovery should remove commit marker");
}

async function testSearchIncludesArchivedResults() {
  console.log("\nTest 12: Search Includes Archived Results");
  const baseTimestamp = Date.now() + 5000;
  db.saveMessage("arch-keyword archived target", "mobile", baseTimestamp - 3 * DAY_IN_MS);
  await db.cleanupOldMessages();
  for (let i = 0; i < 8; i += 1) {
    db.saveMessage(`arch-keyword hot ${i}`, "vscode", baseTimestamp + i);
  }

  const mixedResults = db.searchMessages({
    appId: "default",
    keyword: "arch-keyword",
    limit: 5,
    includeArchived: true,
  });
  const hasArchiveHit = mixedResults.some((item) => item.targetType === "archive");
  assert(hasArchiveHit, "Search should contain archived results when includeArchived=true");

  const hotOnlyResults = db.searchMessages({
    appId: "default",
    keyword: "arch-keyword",
    limit: 5,
    includeArchived: false,
  });
  const hasArchiveInHotOnly = hotOnlyResults.some((item) => item.targetType === "archive");
  assert(!hasArchiveInHotOnly, "Search should exclude archived results when includeArchived=false");
}

async function runTests() {
  console.log("🧪 Running Database Tests...\n");

  console.log("Test 1: Database Initialization");
  cleanup();
  await db.init();
  assertUsingTestDatabasePath();

  console.log("\nTest 2: Save Message");
  const saveResult = db.saveMessage("Test message 1", "vscode", Date.now());
  assert(saveResult === true, "Should save message successfully");

  console.log("\nTest 3: Get Message Count");
  const count1 = db.getMessageCount();
  assert(count1 === 1, `Message count should be 1, got ${count1}`);

  console.log("\nTest 4: Save Multiple Messages");
  for (let i = 2; i <= 5; i += 1) {
    db.saveMessage(`Test message ${i}`, i % 2 === 0 ? "mobile" : "vscode", Date.now() + i);
  }
  const count2 = db.getMessageCount();
  assert(count2 === 5, `Message count should be 5, got ${count2}`);

  console.log("\nTest 5: Get Recent Messages");
  const messages = db.getRecentMessages(3);
  assert(messages.length === 3, `Should return 3 messages, got ${messages.length}`);
  assert(messages[0].text === "Test message 3", "First message should be oldest requested");
  assert(messages[2].text === "Test message 5", "Last message should be newest");

  console.log("\nTest 6: Get All Messages");
  const allMessages = db.getRecentMessages(100);
  assert(allMessages.length === 5, `Should return all 5 messages, got ${allMessages.length}`);

  console.log("\nTest 7: Message Limit Enforcement (max 10)");
  for (let i = 6; i <= 15; i += 1) {
    db.saveMessage(`Test message ${i}`, "mobile", Date.now() + i * 1000);
  }
  await db.cleanupOldMessages();
  const count3 = db.getMessageCount();
  assert(count3 <= 10, `Message count should be <= 10 after cleanup, got ${count3}`);
  const archivedCountAfterLimitCleanup = db.getArchiveMessageCount();
  assert(
    archivedCountAfterLimitCleanup === 5,
    `Archive count should be 5 after max-count archive, got ${archivedCountAfterLimitCleanup}`,
  );

  console.log("\nTest 8: Old Message Archive (retention: 1 day)");
  db.saveMessage("Old message", "vscode", Date.now() - 2 * DAY_IN_MS);
  const beforeCleanup = db.getMessageCount();
  const beforeArchiveCleanup = db.getArchiveMessageCount();
  await db.cleanupOldMessages();
  const afterCleanup = db.getMessageCount();
  const afterArchiveCleanup = db.getArchiveMessageCount();
  assert(afterCleanup < beforeCleanup, "Old messages should be removed from hot storage");
  assert(
    afterArchiveCleanup === beforeArchiveCleanup + 1,
    "Old message should be archived instead of deleted",
  );

  await testMetadataRestore();
  await testImageCleanup();
  await testPairPersistenceRecovery();

  await testSearchIncludesArchivedResults();

  console.log("\nTest 13: Close Database");
  await db.close();
  assert(true, "Database should close without errors");
  cleanup();

  console.log("\n" + "=".repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log("=".repeat(50));

  if (testsFailed > 0) {
    process.exit(1);
  }
  console.log("\n✅ All tests passed!");
  process.exit(0);
}

runTests().catch(async (error) => {
  console.error("❌ Test execution failed:", error);
  try {
    await db.close();
  } catch (closeError) {
    console.error("❌ Failed to close database:", closeError);
  }
  cleanup();
  process.exit(1);
});
