export const SOCKET_EVENTS = Object.freeze({
  CHAT_MESSAGE: "chat message",
  LOAD_HISTORY: "load history",
  HISTORY_LOADED: "history loaded",
  LOAD_MORE_HISTORY: "load more history",
  MORE_HISTORY_LOADED: "more history loaded",
  LOAD_AROUND_MESSAGE: "load around message",
  AROUND_MESSAGE_LOADED: "around message loaded",
  LOAD_AROUND_ARCHIVED_MESSAGE: "load around archived message",
  AROUND_ARCHIVED_MESSAGE_LOADED: "around archived message loaded",
  SEARCH_MESSAGES: "search messages",
  MARK_READ: "mark read",
  PRESENCE_UPDATE: "presence update",
  READ_RECEIPT: "read receipt",
});

export function buildAckOk(data) {
  return { ok: true, data };
}

export function buildAckError(code, message, data = null) {
  return {
    ok: false,
    error: {
      code: typeof code === "string" && code.trim() ? code.trim() : "UNKNOWN_ERROR",
      message: typeof message === "string" && message.trim() ? message.trim() : "请求失败",
    },
    data,
  };
}

export function isAckOk(ack) {
  return typeof ack === "object" && ack !== null && ack.ok === true;
}

export function getAckData(ack) {
  if (typeof ack !== "object" || ack === null) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(ack, "data")) {
    return ack.data;
  }
  return ack;
}

export function getAckErrorMessage(ack, fallback = "请求失败") {
  if (typeof ack !== "object" || ack === null) {
    return fallback;
  }
  if (typeof ack.error === "string" && ack.error.trim().length > 0) {
    return ack.error;
  }
  if (typeof ack.error === "object" && ack.error !== null) {
    if (typeof ack.error.message === "string" && ack.error.message.trim().length > 0) {
      return ack.error.message;
    }
  }
  if (typeof ack.message === "string" && ack.message.trim().length > 0) {
    return ack.message;
  }
  return fallback;
}
