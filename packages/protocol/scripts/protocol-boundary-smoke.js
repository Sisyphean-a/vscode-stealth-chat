#!/usr/bin/env node
const protocol = require("../protocol-runtime.cjs");

function expectThrows(fn, message) {
  let thrown = false;
  try {
    fn();
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error(message);
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

runTest("host/addMessage rejects null attachments and quote", () => {
  expectThrows(() => {
    protocol.parseHostMessage({
      type: "addMessage",
      payload: {
        id: 1,
        text: "legacy",
        source: "mobile",
        timestamp: 1,
        attachments: null,
        quote: null,
      },
    });
  }, "null attachments/quote should be rejected");
});

runTest("host/addMessage rejects invalid attachments object", () => {
  expectThrows(() => {
    protocol.parseHostMessage({
      type: "addMessage",
      payload: {
        text: "x",
        source: "mobile",
        timestamp: 1,
        attachments: {},
      },
    });
  }, "attachments object should be rejected");
});

runTest("host rejects unknown message type", () => {
  expectThrows(() => {
    protocol.parseHostMessage({ type: "unknown", payload: {} });
  }, "unknown host type should be rejected");
});

runTest("webview/searchMessages rejects empty keyword", () => {
  expectThrows(() => {
    protocol.parseWebviewMessage({
      type: "searchMessages",
      payload: { keyword: "" },
    });
  }, "empty keyword should be rejected");
});

runTest("socket client mark-read payload validates", () => {
  protocol.parseSocketClientPayload(protocol.SOCKET_EVENTS.MARK_READ, {
    clientType: "mobile",
    lastReadTimestamp: 123,
    lastReadMessageId: 1,
  });
});

runTest("socket client mark-read rejects string timestamp", () => {
  expectThrows(() => {
    protocol.parseSocketClientPayload(protocol.SOCKET_EVENTS.MARK_READ, {
      clientType: "mobile",
      lastReadTimestamp: "123",
    });
  }, "string timestamp should be rejected");
});

runTest("socket server history payload rejects legacy-null fields", () => {
  expectThrows(() => {
    protocol.parseSocketServerPayload(protocol.SOCKET_EVENTS.HISTORY_LOADED, [
      {
        id: 1,
        text: "hello",
        source: "mobile",
        timestamp: 1,
        attachments: null,
        quote: null,
      },
    ]);
  }, "history payload with null fields should be rejected");
});

runTest("socket chat ack validates", () => {
  protocol.parseSocketAck(protocol.SOCKET_EVENTS.CHAT_MESSAGE, {
    ok: true,
    data: {
      clientMessageId: null,
      message: {
        id: 1,
        text: "ack",
        source: "mobile",
        timestamp: 1,
      },
    },
  });
});

runTest("socket chat ack rejects missing data", () => {
  expectThrows(() => {
    protocol.parseSocketAck(protocol.SOCKET_EVENTS.CHAT_MESSAGE, { ok: true });
  }, "ack without data should be rejected");
});

runTest("socket search ack rejects legacy format without data", () => {
  expectThrows(() => {
    protocol.parseSocketAck(protocol.SOCKET_EVENTS.SEARCH_MESSAGES, {
      ok: true,
      results: [],
    });
  }, "legacy ack without data should be rejected");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("All protocol boundary smoke tests passed");
