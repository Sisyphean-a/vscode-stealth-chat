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
  text: string;
  source: "mobile" | "vscode";
  timestamp: number;
  attachments?: Attachment[];
}

export interface SocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onMessage?: (msg: ChatMessage) => void;
  onHistoryLoaded?: (messages: ChatMessage[]) => void;
  onMoreHistoryLoaded?: (messages: ChatMessage[], hasMore: boolean) => void;
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
  | { type: "sendMessage"; payload: { text: string; attachments?: Attachment[] } }
  | { type: "loadMoreHistory"; payload: { beforeTimestamp: number } }
  | { type: "openImage"; payload: { url: string } }
  | { type: "getConfig" }
  | { type: "saveGlobalSettings"; payload: GlobalSettings }
  | { type: "saveConnection"; payload: { connection: Connection; originalName?: string } }
  | { type: "deleteConnection"; payload: { name: string } }
  | { type: "setActiveConnection"; payload: { name: string } }
  | { type: "testConnection"; payload: { name: string; serverUrl: string; token: string } };
