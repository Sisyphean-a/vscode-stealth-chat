// 数据库模块单元测试 (异步版本)
const db = require("./db");
const fs = require("fs");
const path = require("path");

// 测试配置
const TEST_DB_PATH = path.join(__dirname, "../data/test.db");
process.env.DB_PATH = TEST_DB_PATH;
process.env.MESSAGE_RETENTION_DAYS = "1";
process.env.MESSAGE_MAX_COUNT = "10";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

function cleanup() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const testDir = path.dirname(TEST_DB_PATH);
    if (fs.existsSync(testDir) && fs.readdirSync(testDir).length === 0) {
      fs.rmdirSync(testDir);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function runTests() {
  console.log("🧪 Running Database Tests...\n");

  // Test 1: Database Initialization
  console.log("Test 1: Database Initialization");
  cleanup();
  const initResult = await db.init();
  assert(initResult === true, "Database should initialize successfully");

  // Test 2: Save Message
  console.log("\nTest 2: Save Message");
  const saveResult = db.saveMessage("Test message 1", "vscode", Date.now());
  assert(saveResult === true, "Should save message successfully");

  // Test 3: Get Message Count
  console.log("\nTest 3: Get Message Count");
  const count1 = db.getMessageCount();
  assert(count1 === 1, `Message count should be 1, got ${count1}`);

  // Test 4: Save Multiple Messages
  console.log("\nTest 4: Save Multiple Messages");
  for (let i = 2; i <= 5; i++) {
    db.saveMessage(
      `Test message ${i}`,
      i % 2 === 0 ? "mobile" : "vscode",
      Date.now() + i,
    );
  }
  const count2 = db.getMessageCount();
  assert(count2 === 5, `Message count should be 5, got ${count2}`);

  // Test 5: Get Recent Messages
  console.log("\nTest 5: Get Recent Messages");
  const messages = db.getRecentMessages(3);
  assert(
    messages.length === 3,
    `Should return 3 messages, got ${messages.length}`,
  );
  assert(
    messages[0].text === "Test message 3",
    "First message should be oldest requested",
  );
  assert(
    messages[2].text === "Test message 5",
    "Last message should be newest",
  );

  // Test 6: Get All Messages
  console.log("\nTest 6: Get All Messages");
  const allMessages = db.getRecentMessages(100);
  assert(
    allMessages.length === 5,
    `Should return all 5 messages, got ${allMessages.length}`,
  );

  // Test 7: Message Limit Enforcement
  console.log("\nTest 7: Message Limit Enforcement (max 10)");
  for (let i = 6; i <= 15; i++) {
    db.saveMessage(`Test message ${i}`, "mobile", Date.now() + i * 1000);
  }
  db.cleanupOldMessages();
  const count3 = db.getMessageCount();
  assert(
    count3 <= 10,
    `Message count should be <= 10 after cleanup, got ${count3}`,
  );

  // Test 8: Old Message Cleanup
  console.log("\nTest 8: Old Message Cleanup (retention: 1 day)");
  const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
  db.saveMessage("Old message", "vscode", oldTimestamp);
  const beforeCleanup = db.getMessageCount();
  db.cleanupOldMessages();
  const afterCleanup = db.getMessageCount();
  assert(afterCleanup < beforeCleanup, "Old messages should be cleaned up");

  // Test 9: Close Database
  console.log("\nTest 9: Close Database");
  db.close();
  assert(true, "Database should close without errors");

  // Cleanup
  cleanup();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log("=".repeat(50));

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("❌ Test execution failed:", error);
  process.exit(1);
});
