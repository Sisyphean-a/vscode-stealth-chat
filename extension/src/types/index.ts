/**
 * 共享类型定义
 */

export interface Connection {
  name: string;
  serverUrl?: string;
  token: string;
}

export interface Attachment {
  type: string;
  data?: string;
  url?: string;
  filename?: string;
  size?: number;
}

export interface ChatMessage {
  id?: number;
  clientMessageId?: string | null;
  archiveId?: number | null;
  archived?: boolean;
  text: string;
  source: "mobile" | "vscode";
  timestamp: number;
  attachments?: Attachment[];
  quote?: MessageQuote;
}

export interface MessageQuote {
  messageId: number;
  textSnippet: string;
  source: "mobile" | "vscode";
  timestamp: number;
}

export interface SocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onMessage?: (msg: ChatMessage) => void;
  onHistoryLoaded?: (messages: ChatMessage[]) => void;
  onMoreHistoryLoaded?: (messages: ChatMessage[], hasMore: boolean) => void;
  onAroundMessageLoaded?: (payload: {
    messages: ChatMessage[];
    targetMessageId: number | null;
    error?: string | null;
  }) => void;
  onAroundArchivedMessageLoaded?: (payload: {
    messages: ChatMessage[];
    targetArchiveId: number | null;
    error?: string | null;
  }) => void;
  onPresenceUpdate?: (payload: {
    appId: string;
    total: number;
    mobile: number;
    vscode: number;
  }) => void;
  onReadReceipt?: (payload: {
    appId: string;
    clientType: "mobile" | "vscode" | "unknown";
    lastReadTimestamp: number;
    lastReadMessageId: number | null;
  }) => void;
}

export interface GlobalSettings {
  serverUrl: string;
  forceWebsocket: boolean;
  autoReveal: boolean;
  displayMode: 'bubble' | 'log';
}

export interface SettingsMessage {
  type: string;
  payload?: unknown;
}

export type WebviewMessage =
  | { type: "ready" }
  | { type: "sendMessage"; payload: { text: string; attachments?: Attachment[]; quote?: MessageQuote; clientMessageId?: string } }
  | { type: "loadMoreHistory"; payload: { beforeTimestamp: number } }
  | { type: "loadAroundMessage"; payload: { targetMessageId: number } }
  | { type: "loadAroundArchivedMessage"; payload: { targetArchiveId: number } }
  | { type: "searchMessages"; payload: { keyword: string; limit?: number } }
  | { type: "markRead"; payload: { lastReadTimestamp: number; lastReadMessageId?: number } }
  | { type: "openImage"; payload: { url: string } }
  | { type: "getConfig" }
  | { type: "saveGlobalSettings"; payload: GlobalSettings }
  | { type: "saveConnection"; payload: { connection: Connection; originalName?: string } }
  | { type: "deleteConnection"; payload: { name: string } }
  | { type: "setActiveConnection"; payload: { name: string } }
  | { type: "testConnection"; payload: { name: string; serverUrl: string; token: string } };
