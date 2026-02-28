import { io, Socket } from "socket.io-client";
import { ChatMessage, SocketCallbacks } from "../types";
import * as statusBar from "../ui/statusBar";
import { getActiveConnection } from "../utils/helpers";
import {
  DEFAULT_AROUND_WINDOW_SIZE,
  HISTORY_PAGE_SIZE,
  SEARCH_RESULT_LIMIT,
  buildClientMessageId,
} from "../../../packages/chat-core/index.js";
import { SOCKET_EVENTS } from "../../../packages/protocol/socket-events.js";
import { HistoryLogger } from "./socket/historyLogger";
import { OutboxService, SendMessageInput } from "./socket/outboxService";
import {
  parseAroundArchivedPayload,
  parseAroundMessagePayload,
  parsePresencePayload,
  parseReadReceiptPayload,
  parseSearchAck,
} from "./socket/payloadParser";

const TEST_CONNECTION_TIMEOUT_MS = 10000;

let socket: Socket | undefined;
let historyLoaded = false;
let activeCallbacks: SocketCallbacks = {};

const historyLogger = new HistoryLogger();
const outboxService = new OutboxService();

function emitWithAck(event: string, payload: unknown, handler: (ack: unknown) => void): void {
  if (!socket?.connected) {
    throw new Error("当前未连接");
  }
  socket.emit(event, payload, handler);
}

function ensureClientMessageId(input?: string): string {
  return buildClientMessageId("vscode", input);
}

function bindSocketEvents(callbacks: SocketCallbacks): void {
  if (!socket) {
    return;
  }
  socket.on("connect", () => {
    historyLogger.logInfo("TS-Lint Service connected");
    statusBar.setTooltip("TS-Lint Service 已连接");
    statusBar.updateStatusBar();
    outboxService.bindEmitter(emitWithAck);
    if (!historyLoaded) {
      loadHistory();
    }
    void outboxService.flush();
    callbacks.onConnect?.();
  });

  socket.on("disconnect", () => {
    historyLogger.logInfo("TS-Lint Service disconnected");
    statusBar.setTooltip("TS-Lint Service 已断开");
    outboxService.bindEmitter(undefined);
    callbacks.onDisconnect?.();
  });

  socket.on("connect_error", (error: Error) => {
    historyLogger.logError(`Connection failed: ${error.message}`);
    statusBar.setTooltip(`连接失败: ${error.message}`);
    callbacks.onConnectError?.(error);
  });

  socket.on(SOCKET_EVENTS.HISTORY_LOADED, (messages: ChatMessage[]) => {
    historyLoaded = true;
    const safeMessages = Array.isArray(messages) ? messages : [];
    historyLogger.logHistoryLoaded(safeMessages);
    callbacks.onHistoryLoaded?.(safeMessages);
  });

  socket.on(SOCKET_EVENTS.MORE_HISTORY_LOADED, (data: { messages: ChatMessage[]; hasMore: boolean }) => {
    callbacks.onMoreHistoryLoaded?.(data.messages, data.hasMore);
  });

  socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (data: ChatMessage) => {
    callbacks.onMessage?.(data);
  });

  socket.on(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, (payload) => {
    callbacks.onAroundMessageLoaded?.(parseAroundMessagePayload(payload));
  });

  socket.on(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, (payload) => {
    callbacks.onAroundArchivedMessageLoaded?.(parseAroundArchivedPayload(payload));
  });

  socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (payload) => {
    callbacks.onPresenceUpdate?.(parsePresencePayload(payload));
  });

  socket.on(SOCKET_EVENTS.READ_RECEIPT, (payload) => {
    callbacks.onReadReceipt?.(parseReadReceiptPayload(payload));
  });
}

export function setOutputChannel(channel: import("vscode").OutputChannel): void {
  historyLogger.setOutputChannel(channel);
}

export function connectToServer(
  serverUrl: string,
  token: string,
  forceWebsocket: boolean,
  callbacks: SocketCallbacks
): void {
  activeCallbacks = callbacks;
  try {
    const conn = getActiveConnection();
    statusBar.setConnecting(conn.name);

    socket = io(serverUrl, {
      auth: { token, clientType: "vscode" },
      transports: forceWebsocket ? ["websocket"] : ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });
    outboxService.bindEmitter(undefined);
    bindSocketEvents(callbacks);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    historyLogger.logError(`Failed to initialize connection: ${message}`);
    statusBar.setTooltip(`初始化失败: ${message}`);
    callbacks.onConnectError?.(error instanceof Error ? error : new Error(message));
  }
}

export function sendChatMessage(input: SendMessageInput): Promise<ChatMessage> {
  const payload: SendMessageInput = {
    ...input,
    clientMessageId: ensureClientMessageId(input.clientMessageId),
  };
  const pending = outboxService.enqueue(payload);
  if (socket?.connected) {
    void outboxService.flush();
  }
  return pending;
}

export function searchMessages(
  keyword: string,
  limit = SEARCH_RESULT_LIMIT
): Promise<Array<{
  targetType: "hot" | "archive";
  messageId: number | null;
  archiveId: number | null;
  source: "mobile" | "vscode";
  timestamp: number;
  preview: string;
}>> {
  if (!socket?.connected) {
    return Promise.reject(new Error("当前未连接"));
  }
  const safeKeyword = keyword.trim();
  if (!safeKeyword) {
    return Promise.resolve([]);
  }
  return new Promise((resolve, reject) => {
    socket?.emit(SOCKET_EVENTS.SEARCH_MESSAGES, { keyword: safeKeyword, limit }, (ack: unknown) => {
      try {
        resolve(parseSearchAck(ack));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export function markRead(lastReadTimestamp: number, lastReadMessageId?: number): void {
  if (!socket?.connected) {
    return;
  }
  socket.emit(SOCKET_EVENTS.MARK_READ, {
    clientType: "vscode",
    lastReadTimestamp,
    lastReadMessageId,
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
  outboxService.bindEmitter(undefined);
}

export function getSocket(): Socket | undefined {
  return socket;
}

export function isConnected(): boolean {
  return socket?.connected || false;
}

export function resetHistoryLoaded(): void {
  historyLoaded = false;
}

export function isHistoryLoaded(): boolean {
  return historyLoaded;
}

export function checkAndShowDateSeparator(timestamp: number): void {
  historyLogger.showDateSeparator(timestamp);
}

export function resetLastDisplayedDate(): void {
  historyLogger.resetDateSeparator();
}

export function loadHistory(): void {
  socket?.emit(SOCKET_EVENTS.LOAD_HISTORY, HISTORY_PAGE_SIZE);
}

export function loadMoreHistory(beforeTimestamp: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_MORE_HISTORY, { limit: HISTORY_PAGE_SIZE, beforeTimestamp });
}

export function loadAroundMessage(targetMessageId: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, {
    targetMessageId,
    windowSize: DEFAULT_AROUND_WINDOW_SIZE,
  });
}

export function loadAroundArchivedMessage(targetArchiveId: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, {
    targetArchiveId,
    windowSize: DEFAULT_AROUND_WINDOW_SIZE,
  });
}

export function testConnection(
  serverUrl: string,
  token: string
): Promise<{ success: boolean; message: string; latency?: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const testSocket = io(serverUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: TEST_CONNECTION_TIMEOUT_MS,
    });
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      testSocket.disconnect();
      resolve({ success: false, message: "连接超时" });
    }, TEST_CONNECTION_TIMEOUT_MS);

    testSocket.on("connect", () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      const latency = Date.now() - startedAt;
      testSocket.disconnect();
      resolve({ success: true, message: "连接成功", latency });
    });

    testSocket.on("connect_error", (error: Error) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      testSocket.disconnect();
      resolve({ success: false, message: `连接失败: ${error.message}` });
    });
  });
}

export function getActiveSocketCallbacks(): SocketCallbacks {
  return activeCallbacks;
}
