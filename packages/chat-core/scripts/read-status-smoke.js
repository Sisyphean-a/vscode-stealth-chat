#!/usr/bin/env node
const chatCore = require('../index.cjs');

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

runTest('marks only the last acknowledged outbound message', () => {
  const state = chatCore.derivePeerReadState({
    ownSource: 'vscode',
    messages: [
      { id: 1, source: 'vscode', timestamp: 1, text: 'first' },
      { id: 2, source: 'mobile', timestamp: 2, text: 'reply' },
      { id: 3, source: 'vscode', timestamp: 3, text: 'latest' },
    ],
    receipt: { lastReadTimestamp: 3, lastReadMessageId: 1 },
  });

  expectEqual(state.anchorMessageId, 1, 'anchor should stay on earlier outbound message');
  expectEqual(state.summaryKind, 'earlier', 'summary should say an earlier message is read');
});

runTest('marks latest when the last outbound message is acknowledged', () => {
  const state = chatCore.derivePeerReadState({
    ownSource: 'vscode',
    messages: [
      { id: 10, source: 'vscode', timestamp: 10, text: 'one' },
      { id: 11, source: 'mobile', timestamp: 11, text: 'two' },
      { id: 12, source: 'vscode', timestamp: 12, text: 'three' },
    ],
    receipt: { lastReadTimestamp: 12, lastReadMessageId: 12 },
  });

  expectEqual(state.anchorMessageId, 12, 'anchor should point at latest outbound message');
  expectEqual(state.summaryKind, 'latest', 'summary should say latest outbound message is read');
});

runTest('keeps only a weak summary when receipt has no message id', () => {
  const state = chatCore.derivePeerReadState({
    ownSource: 'vscode',
    messages: [
      { id: 20, source: 'vscode', timestamp: 20, text: 'one' },
      { id: 21, source: 'vscode', timestamp: 21, text: 'two' },
    ],
    receipt: { lastReadTimestamp: 21 },
  });

  expectEqual(state.anchorMessageId, null, 'anchor should be empty without message id');
  expectEqual(state.summaryKind, 'summaryOnly', 'summary should stay weak without anchor id');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('All read state smoke tests passed');
