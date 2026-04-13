const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const chatViewPath = path.join(__dirname, "../src/public/js/views/Chat.js");
const chatViewSource = fs.readFileSync(chatViewPath, "utf8");

function readPendingImagesBlock(source) {
  const match = source.match(
    /<div v-if="pendingImages\.length > 0" class="pending-images">([\s\S]*?)<\/div>\s*<div v-if="sendProgressText"/,
  );
  assert.ok(match, "should find pending images template block");
  return match[1];
}

function readSendButtonBlock(source) {
  const match = source.match(
    /<button type="submit" class="send-btn"[\s\S]*?<\/button>/,
  );
  assert.ok(match, "should find send button template block");
  return match[0];
}

function run() {
  const pendingImagesBlock = readPendingImagesBlock(chatViewSource);
  assert.equal(
    pendingImagesBlock.includes("msg."),
    false,
    "pending image preview must not depend on message-loop variables",
  );

  const sendButtonBlock = readSendButtonBlock(chatViewSource);
  assert.equal(
    sendButtonBlock.includes("<svg"),
    true,
    "send button should render a stable svg icon in idle state",
  );
  assert.equal(
    sendButtonBlock.includes("{{ sendButtonLabel }}"),
    false,
    "send button should not rely on a bare arrow character label",
  );

  assert.equal(
    chatViewSource.includes('<div v-if="errorMsg" class="send-error">{{ errorMsg }}</div>'),
    true,
    "chat view should display send/upload errors in the composer area",
  );
}

run();
console.log("mobile chat ui regression tests passed");
