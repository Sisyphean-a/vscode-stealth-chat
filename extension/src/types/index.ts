/**
 * 共享类型定义
 */

export interface Connection {
  name: string;
  serverUrl?: string;
  token: string;
  backgroundSync?: boolean;
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
  serverMessageId: number | null;
  cursor: { timestamp: number; id: number } | null;
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
