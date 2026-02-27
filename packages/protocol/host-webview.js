export const KNOWN_WEBVIEW_TYPES = Object.freeze([
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
  "testConnection",
]);

export const KNOWN_HOST_TYPES = Object.freeze([
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
  "testResult",
]);

export function isMessageEnvelope(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof value.type === "string";
}
