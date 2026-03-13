# Log Read And Image Preview Implementation Plan

For Claude: required sub skill is executing plans.

Goal: make read state accurate in log mode and replace inline image hover preview with a stable overlay in both clients.

Architecture: use shared pure helpers for read state, then render one inline Read marker and one weak header summary. Replace inline preview blocks with a fixed overlay rendered at the app root.

Tech Stack: TypeScript, Svelte, browser Vue code, shared chat core helpers, smoke verification.

---

### Task 1: Shared read state helpers

Files:

- Modify packages/chat-core/index.js
- Create packages/chat-core/scripts/read-status-smoke.js

Step 1: write failing smoke cases for read marker selection and header summary.
Step 2: run node packages/chat-core/scripts/read-status-smoke.js and confirm failure.
Step 3: add minimal pure helper implementation.
Step 4: run node packages/chat-core/scripts/read-status-smoke.js and confirm pass.

### Task 2: Extension read marker and overlay preview

Files:

- Modify extension/src/webview-svelte/App.svelte
- Modify extension/src/webview-svelte/components/layout/StatusBar.svelte
- Modify extension/src/webview-svelte/components/layout/MessageList.svelte
- Modify extension/src/webview-svelte/components/features/MessageItem.svelte
- Modify extension/src/webview-svelte/controllers/hostMessageDispatcher.ts
- Modify extension/src/webview-svelte/styles/log.css
- Modify extension/src/webview-svelte/styles/shell.css

Step 1: keep the full read receipt object and derive header summary plus acknowledged message id.
Step 2: render one inline Read marker on the matched outbound row.
Step 3: replace inline hover tooltip with a root overlay.
Step 4: run npm run -w extension check-types.

### Task 3: Page client read marker and overlay preview

Files:

- Modify server/src/public/js/views/Chat.js
- Modify server/src/public/js/composables/useChatConnection.js
- Modify server/src/public/js/composables/useMessages.js
- Modify server/src/public/css/messages.css
- Modify server/src/public/css/chat.css

Step 1: reuse shared read state helpers in page client.
Step 2: render one inline Read marker.
Step 3: replace inline hover tooltip with a root overlay.
Step 4: run node packages/chat-core/scripts/read-status-smoke.js and npm run lint.

### Task 4: Final verification

Run:

- node packages/chat-core/scripts/read-status-smoke.js
- npm run -w extension check-types
- npm run lint
- npm run test
