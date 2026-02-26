const fs = require("fs");
const path = require("path");

const TEST_DB_PATH = path.join(__dirname, "../data/test.db");
const TEST_ARCHIVE_DB_PATH = path.join(__dirname, "../data/test.archive.db");
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
    testsPassed++;
    return;
  }

  console.error(`❌ FAIL: ${message}`);
  testsFailed++;
}

function cleanup() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_ARCHIVE_DB_PATH)) {
      fs.unlinkSync(TEST_ARCHIVE_DB_PATH);
    }

    const testDir = path.dirname(TEST_DB_PATH);
    if (fs.existsSync(testDir) && fs.readdirSync(testDir).length === 0) {
      fs.rmdirSync(testDir);
    }
  } catch (error) {
    // ignore cleanup errors
  }
}

function assertUsingTestDatabasePath() {
  assert(fs.existsSync(TEST_DB_PATH), `Test DB should exist at ${TEST_DB_PATH}`);
  assert(fs.existsSync(TEST_ARCHIVE_DB_PATH), `Archive DB should exist at ${TEST_ARCHIVE_DB_PATH}`);
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
  for (let i = 2; i <= 5; i++) {
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
  for (let i = 6; i <= 15; i++) {
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
  const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;
  db.saveMessage("Old message", "vscode", oldTimestamp);
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

  console.log("\nTest 9: Restore Archived Message");
  const restorableBefore = db.getArchiveMessageCount();
  const totalArchivedBefore = db.getArchiveMessageCount(undefined, true);
  const hotBeforeRestore = db.getMessageCount();
  const archivedMessages = db.getArchivedMessages(1, null);
  assert(archivedMessages.length === 1, "Should fetch one restorable archived message");
  const restoreResult = await db.restoreArchivedMessages([archivedMessages[0].archiveId]);
  assert(restoreResult.restored === 1, `Should restore 1 message, got ${restoreResult.restored}`);
  const hotAfterRestore = db.getMessageCount();
  const restorableAfter = db.getArchiveMessageCount();
  const totalArchivedAfter = db.getArchiveMessageCount(undefined, true);
  assert(hotAfterRestore === hotBeforeRestore + 1, "Hot message count should increase after restore");
  assert(restorableAfter === restorableBefore - 1, "Restorable archive count should decrease after restore");
  assert(
    totalArchivedAfter === totalArchivedBefore,
    "Total archived rows (including restored) should remain unchanged",
  );

  console.log("\nTest 10: Close Database");
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
  process.exit(1);
});
