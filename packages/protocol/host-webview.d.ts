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
export type SocketSearchPayload = { keyword: string; limit?: number; includeArchived?: boolean; };
export type SocketMarkReadPayload = { clientType: ClientType; lastReadTimestamp: number; lastReadMessageId?: number; };
export type ChatMessageAckData = { clientMessageId: NullableString; message: ChatMessage; };
export type SearchAckData = { results: Array<SearchResult>; keyword: string; limit: number; };

export const KNOWN_WEBVIEW_TYPES: readonly ["ready", "sendMessage", "loadMoreHistory", "loadAroundMessage", "loadAroundArchivedMessage", "searchMessages", "markRead", "openImage", "getConfig", "saveGlobalSettings", "saveConnection", "deleteConnection", "setActiveConnection", "testConnection", "importConfig"];
export const KNOWN_HOST_TYPES: readonly ["addMessage", "loadHistory", "prependHistory", "aroundMessagesLoaded", "aroundArchivedMessagesLoaded", "updateStatus", "presenceUpdate", "readReceipt", "sendFailed", "searchResults", "setDisplayMode", "clearMessages", "configLoaded", "operationResult", "testResult"];

export type WebviewMessageBody =
  | { type: "ready" }
  | { type: "sendMessage"; payload: WebviewSendMessagePayload }
  | { type: "loadMoreHistory"; payload: { beforeTimestamp: number; } }
  | { type: "loadAroundMessage"; payload: { targetMessageId: number; } }
  | { type: "loadAroundArchivedMessage"; payload: { targetArchiveId: number; } }
  | { type: "searchMessages"; payload: { keyword: string; limit?: number; includeArchived?: boolean; } }
  | { type: "markRead"; payload: { lastReadTimestamp: number; lastReadMessageId?: number; } }
  | { type: "openImage"; payload: { url: string; } }
  | { type: "getConfig" }
  | { type: "saveGlobalSettings"; payload: GlobalSettings }
  | { type: "saveConnection"; payload: { connection: Connection; originalName?: string; } }
  | { type: "deleteConnection"; payload: { name: string; } }
  | { type: "setActiveConnection"; payload: { name: string; } }
  | { type: "testConnection"; payload: { name: string; serverUrl: string; token: string; } }
  | { type: "importConfig"; payload: ConfigLoadedPayload };

export type HostMessageBody =
  | { type: "addMessage"; payload: ChatMessage }
  | { type: "loadHistory"; payload: Array<ChatMessage> }
  | { type: "prependHistory"; payload: PrependHistoryPayload }
  | { type: "aroundMessagesLoaded"; payload: AroundMessagesPayload }
  | { type: "aroundArchivedMessagesLoaded"; payload: AroundArchivedPayload }
  | { type: "updateStatus"; payload: { connected: boolean; } }
  | { type: "presenceUpdate"; payload: PresencePayload }
  | { type: "readReceipt"; payload: ReadReceiptPayload }
  | { type: "sendFailed"; payload: SendFailedPayload }
  | { type: "searchResults"; payload: SearchResultsPayload }
  | { type: "setDisplayMode"; payload: SetDisplayModePayload }
  | { type: "clearMessages" }
  | { type: "configLoaded"; payload: ConfigLoadedPayload }
  | { type: "operationResult"; payload: OperationResultPayload }
  | { type: "testResult"; payload: TestResultPayload };

export type WebviewMessage =
  | { v: 2; traceId: string; sentAt: number; type: "ready" }
  | { v: 2; traceId: string; sentAt: number; type: "sendMessage"; payload: WebviewSendMessagePayload }
  | { v: 2; traceId: string; sentAt: number; type: "loadMoreHistory"; payload: { beforeTimestamp: number; } }
  | { v: 2; traceId: string; sentAt: number; type: "loadAroundMessage"; payload: { targetMessageId: number; } }
  | { v: 2; traceId: string; sentAt: number; type: "loadAroundArchivedMessage"; payload: { targetArchiveId: number; } }
  | { v: 2; traceId: string; sentAt: number; type: "searchMessages"; payload: { keyword: string; limit?: number; includeArchived?: boolean; } }
  | { v: 2; traceId: string; sentAt: number; type: "markRead"; payload: { lastReadTimestamp: number; lastReadMessageId?: number; } }
  | { v: 2; traceId: string; sentAt: number; type: "openImage"; payload: { url: string; } }
  | { v: 2; traceId: string; sentAt: number; type: "getConfig" }
  | { v: 2; traceId: string; sentAt: number; type: "saveGlobalSettings"; payload: GlobalSettings }
  | { v: 2; traceId: string; sentAt: number; type: "saveConnection"; payload: { connection: Connection; originalName?: string; } }
  | { v: 2; traceId: string; sentAt: number; type: "deleteConnection"; payload: { name: string; } }
  | { v: 2; traceId: string; sentAt: number; type: "setActiveConnection"; payload: { name: string; } }
  | { v: 2; traceId: string; sentAt: number; type: "testConnection"; payload: { name: string; serverUrl: string; token: string; } }
  | { v: 2; traceId: string; sentAt: number; type: "importConfig"; payload: ConfigLoadedPayload };

export type HostMessage =
  | { v: 2; traceId: string; sentAt: number; type: "addMessage"; payload: ChatMessage }
  | { v: 2; traceId: string; sentAt: number; type: "loadHistory"; payload: Array<ChatMessage> }
  | { v: 2; traceId: string; sentAt: number; type: "prependHistory"; payload: PrependHistoryPayload }
  | { v: 2; traceId: string; sentAt: number; type: "aroundMessagesLoaded"; payload: AroundMessagesPayload }
  | { v: 2; traceId: string; sentAt: number; type: "aroundArchivedMessagesLoaded"; payload: AroundArchivedPayload }
  | { v: 2; traceId: string; sentAt: number; type: "updateStatus"; payload: { connected: boolean; } }
  | { v: 2; traceId: string; sentAt: number; type: "presenceUpdate"; payload: PresencePayload }
  | { v: 2; traceId: string; sentAt: number; type: "readReceipt"; payload: ReadReceiptPayload }
  | { v: 2; traceId: string; sentAt: number; type: "sendFailed"; payload: SendFailedPayload }
  | { v: 2; traceId: string; sentAt: number; type: "searchResults"; payload: SearchResultsPayload }
  | { v: 2; traceId: string; sentAt: number; type: "setDisplayMode"; payload: SetDisplayModePayload }
  | { v: 2; traceId: string; sentAt: number; type: "clearMessages" }
  | { v: 2; traceId: string; sentAt: number; type: "configLoaded"; payload: ConfigLoadedPayload }
  | { v: 2; traceId: string; sentAt: number; type: "operationResult"; payload: OperationResultPayload }
  | { v: 2; traceId: string; sentAt: number; type: "testResult"; payload: TestResultPayload };

export function isMessageEnvelope(value: unknown): value is {
  v: 2;
  type: string;
  traceId: string;
  sentAt: number;
  payload?: unknown;
};
export function parseWebviewMessage(raw: unknown): WebviewMessage;
export function parseHostMessage(raw: unknown): HostMessage;
export function isWebviewMessage(raw: unknown): raw is WebviewMessage;
export function isHostMessage(raw: unknown): raw is HostMessage;
export function buildWebviewMessage(
  message: WebviewMessageBody,
  options?: { traceId?: string; sentAt?: number }
): WebviewMessage;
export function buildHostMessage(
  message: HostMessageBody,
  options?: { traceId?: string; sentAt?: number }
): HostMessage;
