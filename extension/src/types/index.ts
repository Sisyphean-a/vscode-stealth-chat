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
}
