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
      v: 2,
      traceId: "trace-1",
      sentAt: 1,
      type: "addMessage",
      payload: {
        id: 1,
        serverMessageId: 1,
        cursor: { timestamp: 1, id: 1 },
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
      v: 2,
      traceId: "trace-2",
      sentAt: 1,
      type: "addMessage",
      payload: {
        serverMessageId: 1,
        cursor: { timestamp: 1, id: 1 },
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
    protocol.parseHostMessage({ v: 2, traceId: "trace-3", sentAt: 1, type: "unknown", payload: {} });
  }, "unknown host type should be rejected");
});

runTest("webview/searchMessages rejects empty keyword", () => {
  expectThrows(() => {
    protocol.parseWebviewMessage({
      v: 2,
      traceId: "trace-4",
      sentAt: 1,
      type: "searchMessages",
      payload: { keyword: "" },
    });
  }, "empty keyword should be rejected");
});

runTest("socket client mark-read payload validates", () => {
  const built = protocol.buildSocketClientEnvelope(protocol.SOCKET_EVENTS.MARK_READ, {
    clientType: "mobile",
    lastReadTimestamp: 123,
    lastReadMessageId: 1,
  });
  protocol.parseSocketClientPayload(protocol.SOCKET_EVENTS.MARK_READ, built);
});

runTest("socket client mark-read rejects string timestamp", () => {
  expectThrows(() => {
    protocol.parseSocketClientPayload(protocol.SOCKET_EVENTS.MARK_READ, {
      v: 2,
      event: protocol.SOCKET_EVENTS.MARK_READ,
      traceId: "trace-5",
      sentAt: 1,
      payload: {
        clientType: "mobile",
        lastReadTimestamp: "123",
      },
    });
  }, "string timestamp should be rejected");
});

runTest("socket server history payload rejects legacy-null fields", () => {
  expectThrows(() => {
    protocol.parseSocketServerPayload(protocol.SOCKET_EVENTS.HISTORY_LOADED, {
      v: 2,
      event: protocol.SOCKET_EVENTS.HISTORY_LOADED,
      traceId: "trace-history",
      sentAt: 1,
      payload: [
        {
          id: 1,
          serverMessageId: 1,
          cursor: { timestamp: 1, id: 1 },
          text: "hello",
          source: "mobile",
          timestamp: 1,
          attachments: null,
          quote: null,
        },
      ],
    });
  }, "history payload with null fields should be rejected");
});

runTest("socket chat ack validates", () => {
  protocol.parseSocketAck(protocol.SOCKET_EVENTS.CHAT_MESSAGE, {
    ok: true,
    code: "OK",
    message: "OK",
    traceId: "trace-6",
    serverTime: Date.now(),
    data: {
      clientMessageId: null,
      message: {
        id: 1,
        serverMessageId: 1,
        cursor: { timestamp: 1, id: 1 },
        text: "ack",
        source: "mobile",
        timestamp: 1,
      },
    },
  });
});

runTest("socket chat ack rejects missing data", () => {
  expectThrows(() => {
    protocol.parseSocketAck(protocol.SOCKET_EVENTS.CHAT_MESSAGE, {
      ok: true,
      code: "OK",
      message: "OK",
      traceId: "trace-7",
      serverTime: Date.now(),
    });
  }, "ack without data should be rejected");
});

runTest("socket search ack rejects legacy format without data", () => {
  expectThrows(() => {
    protocol.parseSocketAck(protocol.SOCKET_EVENTS.SEARCH_MESSAGES, {
      ok: true,
      code: "OK",
      message: "OK",
      traceId: "trace-8",
      serverTime: Date.now(),
      results: [],
    });
  }, "legacy ack without data should be rejected");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("All protocol boundary smoke tests passed");
