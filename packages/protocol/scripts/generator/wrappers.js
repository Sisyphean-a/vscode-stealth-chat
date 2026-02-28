function emitHostWebviewJs(generatedNote) {
  return `${generatedNote}export {
  KNOWN_WEBVIEW_TYPES,
  KNOWN_HOST_TYPES,
  isMessageEnvelope,
  parseWebviewMessage,
  parseHostMessage,
  isWebviewMessage,
  isHostMessage,
  buildWebviewMessage,
  buildHostMessage,
} from "./protocol-runtime.js";
`;
}

function emitSocketEventsJs(generatedNote) {
  return `${generatedNote}export {
  SOCKET_EVENTS,
  SOCKET_CLIENT_PAYLOAD_SCHEMAS,
  SOCKET_SERVER_PAYLOAD_SCHEMAS,
  SOCKET_ACK_DATA_SCHEMAS,
  parseSocketClientPayload,
  parseSocketServerPayload,
  parseSocketAck,
  buildSocketClientEnvelope,
  buildSocketServerEnvelope,
  buildAckOk,
  buildAckError,
  isAckOk,
  getAckData,
  getAckErrorMessage,
} from "./protocol-runtime.js";
`;
}

function emitSocketEventsCjs(generatedNote) {
  return `${generatedNote}const runtime = require("./protocol-runtime.cjs");

module.exports = {
  SOCKET_EVENTS: runtime.SOCKET_EVENTS,
  SOCKET_CLIENT_PAYLOAD_SCHEMAS: runtime.SOCKET_CLIENT_PAYLOAD_SCHEMAS,
  SOCKET_SERVER_PAYLOAD_SCHEMAS: runtime.SOCKET_SERVER_PAYLOAD_SCHEMAS,
  SOCKET_ACK_DATA_SCHEMAS: runtime.SOCKET_ACK_DATA_SCHEMAS,
  parseSocketClientPayload: runtime.parseSocketClientPayload,
  parseSocketServerPayload: runtime.parseSocketServerPayload,
  parseSocketAck: runtime.parseSocketAck,
  buildSocketClientEnvelope: runtime.buildSocketClientEnvelope,
  buildSocketServerEnvelope: runtime.buildSocketServerEnvelope,
  buildAckOk: runtime.buildAckOk,
  buildAckError: runtime.buildAckError,
  isAckOk: runtime.isAckOk,
  getAckData: runtime.getAckData,
  getAckErrorMessage: runtime.getAckErrorMessage,
};
`;
}

module.exports = {
  emitHostWebviewJs,
  emitSocketEventsJs,
  emitSocketEventsCjs,
};
