// AUTO-GENERATED FILE. DO NOT EDIT.
export type Unknown = unknown;
export type NonEmptyString = string;
export type Source = "mobile" | "vscode";
export type ClientType = "mobile" | "vscode" | "unknown";
export type DisplayMode = "bubble" | "log";
export type TargetType = "hot" | "archive";
export type NullableNumber = number | null;
export type NullableString = string | null;
export type Cursor = { timestamp: number; id: number; };
export type NullableCursor = Cursor | null;
export type Attachment = { type: string; data?: string; url?: string; filename?: string; size?: number; mimeType?: string; };
export type MessageQuote = { messageId: number; textSnippet: string; source: Source; timestamp: number; };
export type ChatMessage = { id?: number; serverMessageId: NullableNumber; cursor: NullableCursor; clientMessageId?: NullableString; archiveId?: NullableNumber; archived?: boolean; text: string; source: Source; timestamp: number; attachments?: Array<Attachment>; quote?: MessageQuote; };
export type Connection = { name: string; serverUrl?: string; token: string; backgroundSync?: boolean; };
export type GlobalSettings = { serverUrl: string; forceWebsocket: boolean; autoReveal: boolean; displayMode: DisplayMode; };
export type SearchResult = { targetType: TargetType; messageId: NullableNumber; archiveId: NullableNumber; source: Source; timestamp: number; preview: string; };
export type AroundMessagesPayload = { messages: Array<ChatMessage>; targetMessageId: NullableNumber; error?: string | null; };
export type AroundArchivedPayload = { messages: Array<ChatMessage>; targetArchiveId: NullableNumber; error?: string | null; };
export type PresencePayload = { appId: string; total: number; mobile: number; vscode: number; };
export type ReadReceiptPayload = { appId: string; clientType: ClientType; lastReadTimestamp: number; lastReadMessageId: NullableNumber; };
export type PrependHistoryPayload = { messages: Array<ChatMessage>; hasMore: boolean; };
export type SendFailedPayload = { clientMessageId: NullableString; error: string; };
export type SearchResultsPayload = { keyword: string; results: Array<SearchResult>; error: string | null; };
export type SetDisplayModePayload = { mode: DisplayMode; serverUrl: string; token: string; };
export type ConfigLoadedPayload = { globalSettings: GlobalSettings; connections: Array<Connection>; activeConnection: string; };
export type OperationResultPayload = { success: boolean; message: string; };
export type TestResultPayload = { name: string; success: boolean; message: string; latency?: number; };
export type WebviewSendMessagePayload = { text: string; attachments?: Array<Attachment>; quote?: MessageQuote; clientMessageId?: string; };
export type SocketChatMessagePayload = { text: string; source: Source; clickUrl?: string; attachments?: Array<Attachment>; quote?: MessageQuote; clientMessageId: string; };
export type SocketLoadMoreHistoryPayload = { limit: number; beforeTimestamp: number; };
export type SocketLoadAroundMessagePayload = { targetMessageId: number; windowSize?: number; };
export type SocketLoadAroundArchivedPayload = { targetArchiveId: number; windowSize?: number; };
export type SocketSearchPayload = { keyword: string; limit?: number; };
export type SocketMarkReadPayload = { clientType: ClientType; lastReadTimestamp: number; lastReadMessageId?: number; };
export type ChatMessageAckData = { clientMessageId: NullableString; message: ChatMessage; };
export type SearchAckData = { results: Array<SearchResult>; keyword: string; limit: number; };

export const SOCKET_EVENTS: Readonly<{
  CHAT_MESSAGE: "chat message";
  LOAD_HISTORY: "load history";
  HISTORY_LOADED: "history loaded";
  LOAD_MORE_HISTORY: "load more history";
  MORE_HISTORY_LOADED: "more history loaded";
  LOAD_AROUND_MESSAGE: "load around message";
  AROUND_MESSAGE_LOADED: "around message loaded";
  LOAD_AROUND_ARCHIVED_MESSAGE: "load around archived message";
  AROUND_ARCHIVED_MESSAGE_LOADED: "around archived message loaded";
  SEARCH_MESSAGES: "search messages";
  MARK_READ: "mark read";
  PRESENCE_UPDATE: "presence update";
  READ_RECEIPT: "read receipt";
}>;

export type SocketClientPayloadMap = {
  "chat message": SocketChatMessagePayload;
  "load history": number;
  "load more history": SocketLoadMoreHistoryPayload;
  "load around message": SocketLoadAroundMessagePayload;
  "load around archived message": SocketLoadAroundArchivedPayload;
  "search messages": SocketSearchPayload;
  "mark read": SocketMarkReadPayload;
};

export type SocketServerPayloadMap = {
  "chat message": ChatMessage;
  "history loaded": Array<ChatMessage>;
  "more history loaded": PrependHistoryPayload;
  "around message loaded": AroundMessagesPayload;
  "around archived message loaded": AroundArchivedPayload;
  "presence update": PresencePayload;
  "read receipt": ReadReceiptPayload;
};

export type SocketEnvelope<E extends string, P> = {
  v: 2;
  event: E;
  traceId: string;
  sentAt: number;
  sessionId?: string;
  payload: P;
};

export type SocketClientEnvelopeMap = {
  "chat message": SocketEnvelope<"chat message", SocketChatMessagePayload>;
  "load history": SocketEnvelope<"load history", number>;
  "load more history": SocketEnvelope<"load more history", SocketLoadMoreHistoryPayload>;
  "load around message": SocketEnvelope<"load around message", SocketLoadAroundMessagePayload>;
  "load around archived message": SocketEnvelope<"load around archived message", SocketLoadAroundArchivedPayload>;
  "search messages": SocketEnvelope<"search messages", SocketSearchPayload>;
  "mark read": SocketEnvelope<"mark read", SocketMarkReadPayload>;
};

export type SocketServerEnvelopeMap = {
  "chat message": SocketEnvelope<"chat message", ChatMessage>;
  "history loaded": SocketEnvelope<"history loaded", Array<ChatMessage>>;
  "more history loaded": SocketEnvelope<"more history loaded", PrependHistoryPayload>;
  "around message loaded": SocketEnvelope<"around message loaded", AroundMessagesPayload>;
  "around archived message loaded": SocketEnvelope<"around archived message loaded", AroundArchivedPayload>;
  "presence update": SocketEnvelope<"presence update", PresencePayload>;
  "read receipt": SocketEnvelope<"read receipt", ReadReceiptPayload>;
};

export type SocketAckDataMap = {
  "chat message": ChatMessageAckData;
  "search messages": SearchAckData;
};

export type SocketAckMeta = {
  code: string;
  message: string;
  traceId: string;
  serverTime: number;
};
export type SocketAckOk<T> = SocketAckMeta & { ok: true; data: T };
export type SocketAckError = SocketAckMeta & { ok: false; data?: unknown };
export type SocketAck<T> = SocketAckOk<T> | SocketAckError;

export function parseSocketClientPayload<E extends keyof SocketClientPayloadMap>(
  event: E,
  payload: unknown
): SocketClientEnvelopeMap[E];

export function parseSocketServerPayload<E extends keyof SocketServerPayloadMap>(
  event: E,
  payload: unknown
): SocketServerEnvelopeMap[E];

export function parseSocketAck<E extends keyof SocketAckDataMap>(
  event: E,
  ack: unknown
): SocketAck<SocketAckDataMap[E]>;

export function buildSocketClientEnvelope<E extends keyof SocketClientPayloadMap>(
  event: E,
  payload: SocketClientPayloadMap[E],
  options?: { traceId?: string; sentAt?: number; sessionId?: string }
): SocketClientEnvelopeMap[E];

export function buildSocketServerEnvelope<E extends keyof SocketServerPayloadMap>(
  event: E,
  payload: SocketServerPayloadMap[E],
  options?: { traceId?: string; sentAt?: number; sessionId?: string }
): SocketServerEnvelopeMap[E];

export function buildAckOk<T>(options: {
  traceId: string;
  data: T;
  message?: string;
  serverTime?: number;
}): SocketAckOk<T>;
export function buildAckError(options: {
  traceId: string;
  code: string;
  message: string;
  data?: unknown;
  serverTime?: number;
}): SocketAckError;
export function isAckOk<T = unknown>(ack: unknown): ack is SocketAckOk<T>;
export function getAckData<T = unknown>(ack: unknown): T | null;
export function getAckErrorMessage(ack: unknown, fallback?: string): string;
