import {
  SOCKET_EVENTS,
  getAckData,
  getAckErrorMessage,
  isAckOk,
  parseSocketAck,
  parseSocketServerPayload,
  type AroundArchivedPayload,
  type AroundMessagesPayload,
  type ChatMessage,
  type ChatMessageAckData,
  type PresencePayload,
  type ReadReceiptPayload,
  type SearchAckData,
  type SearchResult,
} from "../../../../packages/protocol/socket-events.js";

export function parsePresencePayload(payload: unknown): PresencePayload {
  return parseSocketServerPayload(SOCKET_EVENTS.PRESENCE_UPDATE, payload).payload;
}

export function parseReadReceiptPayload(payload: unknown): ReadReceiptPayload {
  return parseSocketServerPayload(SOCKET_EVENTS.READ_RECEIPT, payload).payload;
}

export function parseAroundMessagePayload(payload: unknown): AroundMessagesPayload {
  return parseSocketServerPayload(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, payload).payload;
}

export function parseAroundArchivedPayload(payload: unknown): AroundArchivedPayload {
  return parseSocketServerPayload(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, payload).payload;
}

export function parseSearchAck(ack: unknown): SearchResult[] {
  const parsedAck = parseSocketAck(SOCKET_EVENTS.SEARCH_MESSAGES, ack);
  if (!isAckOk(parsedAck)) {
    throw new Error(getAckErrorMessage(parsedAck, "搜索失败"));
  }
  const data = getAckData<SearchAckData>(parsedAck);
  if (!data) {
    throw new Error("搜索响应缺少 data 字段");
  }
  return data.results;
}

export function parseChatMessageAck(ack: unknown): ChatMessage {
  const parsedAck = parseSocketAck(SOCKET_EVENTS.CHAT_MESSAGE, ack);
  if (!isAckOk(parsedAck)) {
    throw new Error(getAckErrorMessage(parsedAck, "发送失败"));
  }
  const data = getAckData<ChatMessageAckData>(parsedAck);
  if (!data || !data.message) {
    throw new Error("发送响应缺少 message 字段");
  }
  return data.message;
}
