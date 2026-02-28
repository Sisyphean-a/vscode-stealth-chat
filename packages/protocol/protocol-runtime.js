// AUTO-GENERATED FILE. DO NOT EDIT.
const PROTOCOL_SCHEMA = {"defs":{"Unknown":{"kind":"unknown"},"NonEmptyString":{"kind":"string","minLength":1},"Source":{"kind":"enum","values":["mobile","vscode"]},"ClientType":{"kind":"enum","values":["mobile","vscode","unknown"]},"DisplayMode":{"kind":"enum","values":["bubble","log"]},"TargetType":{"kind":"enum","values":["hot","archive"]},"NullableNumber":{"kind":"union","anyOf":[{"kind":"number","finite":true},{"kind":"literal","value":null}]},"NullableString":{"kind":"union","anyOf":[{"kind":"string"},{"kind":"literal","value":null}]},"Attachment":{"kind":"object","required":["type"],"properties":{"type":{"kind":"string","minLength":1},"data":{"kind":"string"},"url":{"kind":"string"},"filename":{"kind":"string"},"size":{"kind":"number","finite":true},"mimeType":{"kind":"string"}}},"MessageQuote":{"kind":"object","required":["messageId","textSnippet","source","timestamp"],"properties":{"messageId":{"kind":"number","finite":true},"textSnippet":{"kind":"string"},"source":{"kind":"ref","name":"Source"},"timestamp":{"kind":"number","finite":true}}},"ChatMessage":{"kind":"object","required":["text","source","timestamp"],"properties":{"id":{"kind":"number","finite":true},"clientMessageId":{"kind":"ref","name":"NullableString"},"archiveId":{"kind":"ref","name":"NullableNumber"},"archived":{"kind":"boolean"},"text":{"kind":"string"},"source":{"kind":"ref","name":"Source"},"timestamp":{"kind":"number","finite":true},"attachments":{"kind":"union","anyOf":[{"kind":"array","items":{"kind":"ref","name":"Attachment"}},{"kind":"literal","value":null}]},"quote":{"kind":"union","anyOf":[{"kind":"ref","name":"MessageQuote"},{"kind":"literal","value":null}]}}},"Connection":{"kind":"object","required":["name","token"],"properties":{"name":{"kind":"string","minLength":1},"serverUrl":{"kind":"string"},"token":{"kind":"string","minLength":1},"backgroundSync":{"kind":"boolean"}}},"GlobalSettings":{"kind":"object","required":["serverUrl","forceWebsocket","autoReveal","displayMode"],"properties":{"serverUrl":{"kind":"string","minLength":1},"forceWebsocket":{"kind":"boolean"},"autoReveal":{"kind":"boolean"},"displayMode":{"kind":"ref","name":"DisplayMode"}}},"SearchResult":{"kind":"object","required":["targetType","messageId","archiveId","source","timestamp","preview"],"properties":{"targetType":{"kind":"ref","name":"TargetType"},"messageId":{"kind":"ref","name":"NullableNumber"},"archiveId":{"kind":"ref","name":"NullableNumber"},"source":{"kind":"ref","name":"Source"},"timestamp":{"kind":"number","finite":true},"preview":{"kind":"string"}}},"AroundMessagesPayload":{"kind":"object","required":["messages","targetMessageId"],"properties":{"messages":{"kind":"array","items":{"kind":"ref","name":"ChatMessage"}},"targetMessageId":{"kind":"ref","name":"NullableNumber"},"error":{"kind":"union","anyOf":[{"kind":"string"},{"kind":"literal","value":null}]}}},"AroundArchivedPayload":{"kind":"object","required":["messages","targetArchiveId"],"properties":{"messages":{"kind":"array","items":{"kind":"ref","name":"ChatMessage"}},"targetArchiveId":{"kind":"ref","name":"NullableNumber"},"error":{"kind":"union","anyOf":[{"kind":"string"},{"kind":"literal","value":null}]}}},"PresencePayload":{"kind":"object","required":["appId","total","mobile","vscode"],"properties":{"appId":{"kind":"string","minLength":1},"total":{"kind":"number","finite":true},"mobile":{"kind":"number","finite":true},"vscode":{"kind":"number","finite":true}}},"ReadReceiptPayload":{"kind":"object","required":["appId","clientType","lastReadTimestamp","lastReadMessageId"],"properties":{"appId":{"kind":"string","minLength":1},"clientType":{"kind":"ref","name":"ClientType"},"lastReadTimestamp":{"kind":"number","finite":true},"lastReadMessageId":{"kind":"ref","name":"NullableNumber"}}},"PrependHistoryPayload":{"kind":"object","required":["messages","hasMore"],"properties":{"messages":{"kind":"array","items":{"kind":"ref","name":"ChatMessage"}},"hasMore":{"kind":"boolean"}}},"SendFailedPayload":{"kind":"object","required":["clientMessageId","error"],"properties":{"clientMessageId":{"kind":"ref","name":"NullableString"},"error":{"kind":"string","minLength":1}}},"SearchResultsPayload":{"kind":"object","required":["keyword","results","error"],"properties":{"keyword":{"kind":"string"},"results":{"kind":"array","items":{"kind":"ref","name":"SearchResult"}},"error":{"kind":"union","anyOf":[{"kind":"string"},{"kind":"literal","value":null}]}}},"SetDisplayModePayload":{"kind":"object","required":["mode","serverUrl","token"],"properties":{"mode":{"kind":"ref","name":"DisplayMode"},"serverUrl":{"kind":"string","minLength":1},"token":{"kind":"string"}}},"ConfigLoadedPayload":{"kind":"object","required":["globalSettings","connections","activeConnection"],"properties":{"globalSettings":{"kind":"ref","name":"GlobalSettings"},"connections":{"kind":"array","items":{"kind":"ref","name":"Connection"}},"activeConnection":{"kind":"string"}}},"OperationResultPayload":{"kind":"object","required":["success","message"],"properties":{"success":{"kind":"boolean"},"message":{"kind":"string","minLength":1}}},"TestResultPayload":{"kind":"object","required":["name","success","message"],"properties":{"name":{"kind":"string","minLength":1},"success":{"kind":"boolean"},"message":{"kind":"string","minLength":1},"latency":{"kind":"number","finite":true}}},"WebviewSendMessagePayload":{"kind":"object","required":["text"],"properties":{"text":{"kind":"string"},"attachments":{"kind":"array","items":{"kind":"ref","name":"Attachment"}},"quote":{"kind":"ref","name":"MessageQuote"},"clientMessageId":{"kind":"string","minLength":1}}},"SocketChatMessagePayload":{"kind":"object","required":["text","source"],"properties":{"text":{"kind":"string"},"source":{"kind":"ref","name":"Source"},"clickUrl":{"kind":"string"},"attachments":{"kind":"array","items":{"kind":"ref","name":"Attachment"}},"quote":{"kind":"ref","name":"MessageQuote"},"clientMessageId":{"kind":"string","minLength":1}}},"SocketLoadMoreHistoryPayload":{"kind":"object","required":["limit","beforeTimestamp"],"properties":{"limit":{"kind":"number","finite":true},"beforeTimestamp":{"kind":"number","finite":true}}},"SocketLoadAroundMessagePayload":{"kind":"object","required":["targetMessageId"],"properties":{"targetMessageId":{"kind":"number","finite":true},"windowSize":{"kind":"number","finite":true}}},"SocketLoadAroundArchivedPayload":{"kind":"object","required":["targetArchiveId"],"properties":{"targetArchiveId":{"kind":"number","finite":true},"windowSize":{"kind":"number","finite":true}}},"SocketSearchPayload":{"kind":"object","required":["keyword"],"properties":{"keyword":{"kind":"string","minLength":1},"limit":{"kind":"number","finite":true}}},"SocketMarkReadPayload":{"kind":"object","required":["clientType","lastReadTimestamp"],"properties":{"clientType":{"kind":"ref","name":"ClientType"},"lastReadTimestamp":{"kind":"number","finite":true},"lastReadMessageId":{"kind":"number","finite":true}}},"ChatMessageAckData":{"kind":"object","required":["clientMessageId","message"],"properties":{"clientMessageId":{"kind":"ref","name":"NullableString"},"message":{"kind":"ref","name":"ChatMessage"}}},"SearchAckData":{"kind":"object","required":["results","keyword","limit"],"properties":{"results":{"kind":"array","items":{"kind":"ref","name":"SearchResult"}},"keyword":{"kind":"string"},"limit":{"kind":"number","finite":true}}}},"webviewMap":{"ready":{},"sendMessage":{"payload":{"kind":"ref","name":"WebviewSendMessagePayload"}},"loadMoreHistory":{"payload":{"kind":"object","required":["beforeTimestamp"],"properties":{"beforeTimestamp":{"kind":"number","finite":true}}}},"loadAroundMessage":{"payload":{"kind":"object","required":["targetMessageId"],"properties":{"targetMessageId":{"kind":"number","finite":true}}}},"loadAroundArchivedMessage":{"payload":{"kind":"object","required":["targetArchiveId"],"properties":{"targetArchiveId":{"kind":"number","finite":true}}}},"searchMessages":{"payload":{"kind":"object","required":["keyword"],"properties":{"keyword":{"kind":"string","minLength":1},"limit":{"kind":"number","finite":true}}}},"markRead":{"payload":{"kind":"object","required":["lastReadTimestamp"],"properties":{"lastReadTimestamp":{"kind":"number","finite":true},"lastReadMessageId":{"kind":"number","finite":true}}}},"openImage":{"payload":{"kind":"object","required":["url"],"properties":{"url":{"kind":"string","minLength":1}}}},"getConfig":{},"saveGlobalSettings":{"payload":{"kind":"ref","name":"GlobalSettings"}},"saveConnection":{"payload":{"kind":"object","required":["connection"],"properties":{"connection":{"kind":"ref","name":"Connection"},"originalName":{"kind":"string"}}}},"deleteConnection":{"payload":{"kind":"object","required":["name"],"properties":{"name":{"kind":"string","minLength":1}}}},"setActiveConnection":{"payload":{"kind":"object","required":["name"],"properties":{"name":{"kind":"string","minLength":1}}}},"testConnection":{"payload":{"kind":"object","required":["name","serverUrl","token"],"properties":{"name":{"kind":"string","minLength":1},"serverUrl":{"kind":"string","minLength":1},"token":{"kind":"string","minLength":1}}}}},"hostMap":{"addMessage":{"payload":{"kind":"ref","name":"ChatMessage"}},"loadHistory":{"payload":{"kind":"array","items":{"kind":"ref","name":"ChatMessage"}}},"prependHistory":{"payload":{"kind":"ref","name":"PrependHistoryPayload"}},"aroundMessagesLoaded":{"payload":{"kind":"ref","name":"AroundMessagesPayload"}},"aroundArchivedMessagesLoaded":{"payload":{"kind":"ref","name":"AroundArchivedPayload"}},"updateStatus":{"payload":{"kind":"object","required":["connected"],"properties":{"connected":{"kind":"boolean"}}}},"presenceUpdate":{"payload":{"kind":"ref","name":"PresencePayload"}},"readReceipt":{"payload":{"kind":"ref","name":"ReadReceiptPayload"}},"sendFailed":{"payload":{"kind":"ref","name":"SendFailedPayload"}},"searchResults":{"payload":{"kind":"ref","name":"SearchResultsPayload"}},"setDisplayMode":{"payload":{"kind":"ref","name":"SetDisplayModePayload"}},"clearMessages":{},"configLoaded":{"payload":{"kind":"ref","name":"ConfigLoadedPayload"}},"operationResult":{"payload":{"kind":"ref","name":"OperationResultPayload"}},"testResult":{"payload":{"kind":"ref","name":"TestResultPayload"}}},"socketEvents":{"CHAT_MESSAGE":"chat message","LOAD_HISTORY":"load history","HISTORY_LOADED":"history loaded","LOAD_MORE_HISTORY":"load more history","MORE_HISTORY_LOADED":"more history loaded","LOAD_AROUND_MESSAGE":"load around message","AROUND_MESSAGE_LOADED":"around message loaded","LOAD_AROUND_ARCHIVED_MESSAGE":"load around archived message","AROUND_ARCHIVED_MESSAGE_LOADED":"around archived message loaded","SEARCH_MESSAGES":"search messages","MARK_READ":"mark read","PRESENCE_UPDATE":"presence update","READ_RECEIPT":"read receipt"},"socketClientPayloads":{"chat message":{"kind":"ref","name":"SocketChatMessagePayload"},"load history":{"kind":"number","finite":true},"load more history":{"kind":"ref","name":"SocketLoadMoreHistoryPayload"},"load around message":{"kind":"ref","name":"SocketLoadAroundMessagePayload"},"load around archived message":{"kind":"ref","name":"SocketLoadAroundArchivedPayload"},"search messages":{"kind":"ref","name":"SocketSearchPayload"},"mark read":{"kind":"ref","name":"SocketMarkReadPayload"}},"socketServerPayloads":{"chat message":{"kind":"ref","name":"ChatMessage"},"history loaded":{"kind":"array","items":{"kind":"ref","name":"ChatMessage"}},"more history loaded":{"kind":"ref","name":"PrependHistoryPayload"},"around message loaded":{"kind":"ref","name":"AroundMessagesPayload"},"around archived message loaded":{"kind":"ref","name":"AroundArchivedPayload"},"presence update":{"kind":"ref","name":"PresencePayload"},"read receipt":{"kind":"ref","name":"ReadReceiptPayload"}},"socketAckData":{"chat message":{"kind":"ref","name":"ChatMessageAckData"},"search messages":{"kind":"ref","name":"SearchAckData"}}};
const DEFINITIONS = Object.freeze(PROTOCOL_SCHEMA.defs);
const WEBVIEW_MESSAGE_MAP = Object.freeze(PROTOCOL_SCHEMA.webviewMap);
const HOST_MESSAGE_MAP = Object.freeze(PROTOCOL_SCHEMA.hostMap);
const SOCKET_EVENTS = Object.freeze(PROTOCOL_SCHEMA.socketEvents);
const SOCKET_CLIENT_PAYLOAD_SCHEMAS = Object.freeze(PROTOCOL_SCHEMA.socketClientPayloads);
const SOCKET_SERVER_PAYLOAD_SCHEMAS = Object.freeze(PROTOCOL_SCHEMA.socketServerPayloads);
const SOCKET_ACK_DATA_SCHEMAS = Object.freeze(PROTOCOL_SCHEMA.socketAckData);
const KNOWN_WEBVIEW_TYPES = Object.freeze(Object.keys(WEBVIEW_MESSAGE_MAP));
const KNOWN_HOST_TYPES = Object.freeze(Object.keys(HOST_MESSAGE_MAP));
const NON_EMPTY_STRING = Object.freeze({ kind: "string", minLength: 1 });
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}
function appendPath(path, key) {
  if (!path) {
    return key;
  }
  return path + "." + key;
}
function throwValidationError(path, message) {
  throw new Error("[Protocol] " + path + ": " + message);
}
function resolveSchema(schema, defs, path) {
  if (!schema || typeof schema !== "object") {
    throwValidationError(path, "Invalid schema node");
  }
  if (schema.kind !== "ref") {
    return schema;
  }
  const target = defs[schema.name];
  if (!target) {
    throwValidationError(path, "Unknown schema ref: " + schema.name);
  }
  return target;
}
function validateString(schema, value, path) {
  if (typeof value !== "string") {
    throwValidationError(path, "Expected string");
  }
  if (Number.isFinite(schema.minLength) && value.length < schema.minLength) {
    throwValidationError(path, "Expected string length >= " + schema.minLength);
  }
}
function validateNumber(schema, value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwValidationError(path, "Expected finite number");
  }
  if (schema.integer && !Number.isInteger(value)) {
    throwValidationError(path, "Expected integer");
  }
  if (Number.isFinite(schema.minimum) && value < schema.minimum) {
    throwValidationError(path, "Expected number >= " + schema.minimum);
  }
  if (Number.isFinite(schema.maximum) && value > schema.maximum) {
    throwValidationError(path, "Expected number <= " + schema.maximum);
  }
}
function validateLiteral(schema, value, path) {
  if (value !== schema.value) {
    throwValidationError(path, "Expected literal " + JSON.stringify(schema.value));
  }
}
function validateEnum(schema, value, path) {
  if (!schema.values.includes(value)) {
    throwValidationError(path, "Expected one of: " + schema.values.join(", "));
  }
}
function validateArray(schema, value, defs, path) {
  if (!Array.isArray(value)) {
    throwValidationError(path, "Expected array");
  }
  for (let i = 0; i < value.length; i += 1) {
    validateValue(schema.items, value[i], defs, path + "[" + i + "]");
  }
}
function validateObject(schema, value, defs, path) {
  if (!isRecord(value)) {
    throwValidationError(path, "Expected object");
  }
  const required = new Set(schema.required || []);
  const properties = schema.properties || {};
  for (const field of required) {
    if (!hasOwn(value, field) || value[field] === undefined) {
      throwValidationError(appendPath(path, field), "Missing required field");
    }
  }
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (!hasOwn(value, field) || value[field] === undefined) {
      continue;
    }
    validateValue(fieldSchema, value[field], defs, appendPath(path, field));
  }
  if (schema.allowUnknown === false) {
    for (const key of Object.keys(value)) {
      if (!hasOwn(properties, key)) {
        throwValidationError(appendPath(path, key), "Unknown field");
      }
    }
  }
}
function validateUnion(schema, value, defs, path) {
  const errors = [];
  for (const option of schema.anyOf || []) {
    try {
      validateValue(option, value, defs, path);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throwValidationError(path, "No union branch matched (" + errors.length + ")");
}
function validateValue(schema, value, defs, path) {
  const resolved = resolveSchema(schema, defs, path);
  if (resolved.kind === "unknown") {
    return;
  }
  if (resolved.kind === "string") {
    validateString(resolved, value, path);
    return;
  }
  if (resolved.kind === "number") {
    validateNumber(resolved, value, path);
    return;
  }
  if (resolved.kind === "boolean") {
    if (typeof value !== "boolean") {
      throwValidationError(path, "Expected boolean");
    }
    return;
  }
  if (resolved.kind === "literal") {
    validateLiteral(resolved, value, path);
    return;
  }
  if (resolved.kind === "enum") {
    validateEnum(resolved, value, path);
    return;
  }
  if (resolved.kind === "array") {
    validateArray(resolved, value, defs, path);
    return;
  }
  if (resolved.kind === "object") {
    validateObject(resolved, value, defs, path);
    return;
  }
  if (resolved.kind === "union") {
    validateUnion(resolved, value, defs, path);
    return;
  }
  throwValidationError(path, "Unsupported schema kind: " + resolved.kind);
}
function isMessageEnvelope(value) {
  return isRecord(value) && typeof value.type === "string";
}
function parseMessage(raw, schemaMap, label) {
  if (!isMessageEnvelope(raw)) {
    throw new Error("[Protocol] Invalid " + label + " message envelope");
  }
  const schema = schemaMap[raw.type];
  if (!schema) {
    throw new Error("[Protocol] Unknown " + label + " message type: " + raw.type);
  }
  if (hasOwn(schema, "payload")) {
    validateValue(schema.payload, raw.payload, DEFINITIONS, label + "." + raw.type + ".payload");
  } else if (hasOwn(raw, "payload") && raw.payload !== undefined) {
    throw new Error("[Protocol] " + label + "." + raw.type + " should not contain payload");
  }
  return raw;
}
function parseWebviewMessage(raw) {
  return parseMessage(raw, WEBVIEW_MESSAGE_MAP, "webview");
}
function parseHostMessage(raw) {
  return parseMessage(raw, HOST_MESSAGE_MAP, "host");
}
function isWebviewMessage(raw) {
  try {
    parseWebviewMessage(raw);
    return true;
  } catch {
    return false;
  }
}
function isHostMessage(raw) {
  try {
    parseHostMessage(raw);
    return true;
  } catch {
    return false;
  }
}
function validateSocketPayload(event, payload, schemaMap, direction) {
  const schema = schemaMap[event];
  if (!schema) {
    throw new Error("[Protocol] Unknown " + direction + " socket event: " + event);
  }
  validateValue(schema, payload, DEFINITIONS, direction + "." + event);
  return payload;
}
function parseSocketClientPayload(event, payload) {
  return validateSocketPayload(event, payload, SOCKET_CLIENT_PAYLOAD_SCHEMAS, "socket.client");
}
function parseSocketServerPayload(event, payload) {
  return validateSocketPayload(event, payload, SOCKET_SERVER_PAYLOAD_SCHEMAS, "socket.server");
}
function parseSocketAck(event, ack) {
  const dataSchema = SOCKET_ACK_DATA_SCHEMAS[event];
  if (!dataSchema) {
    throw new Error("[Protocol] Socket event does not support ACK schema: " + event);
  }
  if (!isRecord(ack) || typeof ack.ok !== "boolean") {
    throw new Error("[Protocol] Invalid socket ack envelope for event: " + event);
  }
  if (ack.ok === true) {
    if (!hasOwn(ack, "data")) {
      throw new Error("[Protocol] Missing ack.data for event: " + event);
    }
    validateValue(dataSchema, ack.data, DEFINITIONS, "socket.ack." + event + ".data");
    return ack;
  }
  if (!isRecord(ack.error)) {
    throw new Error("[Protocol] Missing ack.error for event: " + event);
  }
  validateValue(NON_EMPTY_STRING, ack.error.code, DEFINITIONS, "socket.ack." + event + ".error.code");
  validateValue(NON_EMPTY_STRING, ack.error.message, DEFINITIONS, "socket.ack." + event + ".error.message");
  return ack;
}
function buildAckOk(data) {
  return { ok: true, data };
}
function buildAckError(code, message, data = null) {
  return {
    ok: false,
    error: {
      code: typeof code === "string" && code.trim() ? code.trim() : "UNKNOWN_ERROR",
      message: typeof message === "string" && message.trim() ? message.trim() : "请求失败",
    },
    data,
  };
}
function isAckOk(ack) {
  return isRecord(ack) && ack.ok === true && hasOwn(ack, "data");
}
function getAckData(ack) {
  if (!isAckOk(ack)) {
    return null;
  }
  return ack.data;
}
function getAckErrorMessage(ack, fallback = "请求失败") {
  if (!isRecord(ack)) {
    return fallback;
  }
  if (isRecord(ack.error) && typeof ack.error.message === "string" && ack.error.message.trim()) {
    return ack.error.message;
  }
  if (typeof ack.error === "string" && ack.error.trim()) {
    return ack.error;
  }
  if (typeof ack.message === "string" && ack.message.trim()) {
    return ack.message;
  }
  return fallback;
}
export {
  KNOWN_WEBVIEW_TYPES,
  KNOWN_HOST_TYPES,
  WEBVIEW_MESSAGE_MAP,
  HOST_MESSAGE_MAP,
  SOCKET_EVENTS,
  SOCKET_CLIENT_PAYLOAD_SCHEMAS,
  SOCKET_SERVER_PAYLOAD_SCHEMAS,
  SOCKET_ACK_DATA_SCHEMAS,
  isMessageEnvelope,
  parseWebviewMessage,
  parseHostMessage,
  isWebviewMessage,
  isHostMessage,
  parseSocketClientPayload,
  parseSocketServerPayload,
  parseSocketAck,
  buildAckOk,
  buildAckError,
  isAckOk,
  getAckData,
  getAckErrorMessage,
};
