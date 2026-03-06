#!/usr/bin/env node
const chatCore = require("../index.cjs");

function expectEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

runTest("mobile message increments unread when active view is hidden", () => {
  expectEqual(chatCore.shouldIncrementUnreadCount({
    messageSource: "mobile",
    isActiveConversation: true,
    isViewVisible: false,
  }), true, "hidden active conversation should increment unread");
});

runTest("mobile message does not increment unread when active view is visible", () => {
  expectEqual(chatCore.shouldIncrementUnreadCount({
    messageSource: "mobile",
    isActiveConversation: true,
    isViewVisible: true,
  }), false, "visible active conversation should not increment unread");
});

runTest("vscode read receipt clears unread across windows", () => {
  expectEqual(chatCore.shouldApplyReadReceiptToUnread({ clientType: "vscode" }), true, "vscode receipt should clear unread");
});

runTest("mobile read receipt does not clear local unread", () => {
  expectEqual(chatCore.shouldApplyReadReceiptToUnread({ clientType: "mobile" }), false, "mobile receipt should not clear unread");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("All unread sync smoke tests passed");
