export const KNOWN_WEBVIEW_TYPES: readonly [
  "ready",
  "sendMessage",
  "loadMoreHistory",
  "loadAroundMessage",
  "loadAroundArchivedMessage",
  "searchMessages",
  "markRead",
  "openImage",
  "getConfig",
  "saveGlobalSettings",
  "saveConnection",
  "deleteConnection",
  "setActiveConnection",
  "testConnection"
];

export const KNOWN_HOST_TYPES: readonly [
  "addMessage",
  "loadHistory",
  "prependHistory",
  "aroundMessagesLoaded",
  "aroundArchivedMessagesLoaded",
  "updateStatus",
  "presenceUpdate",
  "readReceipt",
  "sendFailed",
  "searchResults",
  "setDisplayMode",
  "clearMessages",
  "configLoaded",
  "operationResult",
  "testResult"
];

export function isMessageEnvelope(value: unknown): value is { type: string; payload?: unknown };
