/**
 * Socket.io 连接服务
 */
import { io, Socket } from "socket.io-client";
import { ChatMessage, MessageQuote, SocketCallbacks } from "../types";
import * as statusBar from "../ui/statusBar";
import { getActiveConnection, getCurrentTimestamp, formatTimestamp, getDateKey } from "../utils/helpers";
import {
  ACK_TIMEOUT_MS,
  DEFAULT_AROUND_WINDOW_SIZE,
  HISTORY_PAGE_SIZE,
  MAX_SEND_RETRIES,
  RETRY_DELAY_MS,
  SEARCH_RESULT_LIMIT,
  buildClientMessageId,
} from "../../../packages/chat-core/index.js";
import {
  SOCKET_EVENTS,
  getAckData,
  getAckErrorMessage,
  isAckOk,
} from "../../../packages/protocol/socket-events.js";

let socket: Socket | undefined;
let outputChannel: import("vscode").OutputChannel | undefined;
let historyLoaded = false;
let lastDisplayedDate = "";
let activeCallbacks: SocketCallbacks = {};

type SendMessageInput = {
  text: string;
  source: "mobile" | "vscode";
  clickUrl?: string;
  attachments?: Array<{
    type: string;
    data?: string;
    url?: string;
    filename?: string;
    size?: number;
  }>;
  quote?: MessageQuote;
  clientMessageId?: string;
};

type SendTask = {
  payload: SendMessageInput;
  retriesLeft: number;
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
};

const pendingOutbox: SendTask[] = [];
let flushTimer: NodeJS.Timeout | undefined;
let isSending = false;

function logInfo(message: string): void {
  outputChannel?.appendLine(`[Info - ${getCurrentTimestamp()}] ${message}`);
}

function logError(message: string): void {
  outputChannel?.appendLine(`[Error - ${getCurrentTimestamp()}] ${message}`);
}

function ensureClientMessageId(input?: string): string {
  return buildClientMessageId("vscode", input);
}

function scheduleFlush(delayMs = 0): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    void flushOutbox();
  }, delayMs);
}

function parseAckChatMessage(payload: unknown): ChatMessage | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const maybeData = getAckData<{ message?: ChatMessage }>(payload);
  if (maybeData && typeof maybeData === "object" && maybeData.message) {
    return maybeData.message;
  }
  const legacy = payload as { message?: ChatMessage };
  if (legacy.message) {
    return legacy.message;
  }
  return null;
}

function emitChatMessageWithAck(payload: SendMessageInput): Promise<ChatMessage> {
  if (!socket?.connected) {
    return Promise.reject(new Error("当前未连接"));
  }

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("消息确认超时"));
    }, ACK_TIMEOUT_MS);

    socket?.emit(SOCKET_EVENTS.CHAT_MESSAGE, payload, (ack: unknown) => {
      if (timedOut) {
        return;
      }
      clearTimeout(timer);
      if (isAckOk(ack)) {
        const message = parseAckChatMessage(ack);
        if (message) {
          resolve(message);
          return;
        }
        reject(new Error("发送响应缺少消息内容"));
        return;
      }
      reject(new Error(getAckErrorMessage(ack, "发送失败")));
    });
  });
}

async function flushOutbox(): Promise<void> {
  if (isSending || !socket?.connected || pendingOutbox.length === 0) {
    return;
  }

  isSending = true;
  try {
    while (socket?.connected && pendingOutbox.length > 0) {
      const task = pendingOutbox[0];
      try {
        const savedMessage = await emitChatMessageWithAck(task.payload);
        pendingOutbox.shift();
        task.resolve(savedMessage);
      } catch (error) {
        if (task.retriesLeft <= 0) {
          pendingOutbox.shift();
          task.reject(error instanceof Error ? error : new Error(String(error)));
          continue;
        }
        task.retriesLeft -= 1;
        scheduleFlush(RETRY_DELAY_MS);
        return;
      }
    }
  } finally {
    isSending = false;
  }
}

/**
 * 设置输出通道
 */
export function setOutputChannel(channel: import("vscode").OutputChannel): void {
  outputChannel = channel;
}

/**
 * 连接到服务器
 */
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

    socket.on("connect", () => {
      logInfo("TS-Lint Service connected");
      statusBar.setTooltip("TS-Lint Service 已连接");
      statusBar.updateStatusBar();
      if (!historyLoaded) {
        socket?.emit(SOCKET_EVENTS.LOAD_HISTORY, HISTORY_PAGE_SIZE);
      }
      scheduleFlush(0);
      callbacks.onConnect?.();
    });

    socket.on("disconnect", () => {
      logInfo("TS-Lint Service disconnected");
      statusBar.setTooltip("TS-Lint Service 已断开");
      callbacks.onDisconnect?.();
    });

    socket.on("connect_error", (error: Error) => {
      logError(`Connection failed: ${error.message}`);
      statusBar.setTooltip(`连接失败: ${error.message}`);
      callbacks.onConnectError?.(error);
    });

    socket.on(SOCKET_EVENTS.HISTORY_LOADED, (messages: ChatMessage[]) => {
      historyLoaded = true;
      const safeMessages = Array.isArray(messages) ? messages : [];

      if (safeMessages.length === 0) {
        logInfo("No historical messages found");
        callbacks.onHistoryLoaded?.([]);
        return;
      }

      logInfo(`Loading ${safeMessages.length} historical messages...`);

      lastDisplayedDate = "";
      safeMessages.forEach((msg) => {
        const msgTime = new Date(msg.timestamp);
        const msgDate = getDateKey(msg.timestamp);
        if (msgDate !== lastDisplayedDate) {
          outputChannel?.appendLine(`[Info - 00:00:00] ═══════════ ${msgDate} ═══════════`);
          lastDisplayedDate = msgDate;
        }

        const formattedTime = formatTimestamp(msgTime);
        const prefix = msg.source === "mobile" ? "Process" : "Sent";
        outputChannel?.appendLine(`[Info - ${formattedTime}] ${prefix}: ${msg.text}`);
      });

      logInfo("History loaded successfully");
      callbacks.onHistoryLoaded?.(safeMessages);
    });

    socket.on(SOCKET_EVENTS.MORE_HISTORY_LOADED, (data: { messages: ChatMessage[]; hasMore: boolean }) => {
      callbacks.onMoreHistoryLoaded?.(data.messages, data.hasMore);
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (data: ChatMessage) => {
      callbacks.onMessage?.(data);
    });

    socket.on(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, (payload: {
      messages?: ChatMessage[];
      targetMessageId?: number | null;
      error?: string | null;
    }) => {
      callbacks.onAroundMessageLoaded?.({
        messages: Array.isArray(payload?.messages) ? payload.messages : [],
        targetMessageId: typeof payload?.targetMessageId === "number" ? payload.targetMessageId : null,
        error: payload?.error ?? null,
      });
    });

    socket.on(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, (payload: {
      messages?: ChatMessage[];
      targetArchiveId?: number | null;
      error?: string | null;
    }) => {
      callbacks.onAroundArchivedMessageLoaded?.({
        messages: Array.isArray(payload?.messages) ? payload.messages : [],
        targetArchiveId: typeof payload?.targetArchiveId === "number" ? payload.targetArchiveId : null,
        error: payload?.error ?? null,
      });
    });

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (payload) => {
      callbacks.onPresenceUpdate?.({
        appId: typeof payload?.appId === "string" ? payload.appId : "default",
        total: Number.isFinite(payload?.total) ? payload.total : 0,
        mobile: Number.isFinite(payload?.mobile) ? payload.mobile : 0,
        vscode: Number.isFinite(payload?.vscode) ? payload.vscode : 0,
      });
    });

    socket.on(SOCKET_EVENTS.READ_RECEIPT, (payload) => {
      callbacks.onReadReceipt?.({
        appId: typeof payload?.appId === "string" ? payload.appId : "default",
        clientType: payload?.clientType === "mobile" || payload?.clientType === "vscode" ? payload.clientType : "unknown",
        lastReadTimestamp: Number.isFinite(payload?.lastReadTimestamp) ? payload.lastReadTimestamp : Date.now(),
        lastReadMessageId: Number.isFinite(payload?.lastReadMessageId) ? payload.lastReadMessageId : null,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to initialize connection: ${message}`);
    statusBar.setTooltip(`初始化失败: ${message}`);
    callbacks.onConnectError?.(error instanceof Error ? error : new Error(message));
  }
}

/**
 * 发送消息（带 ACK + 重试）
 */
export function sendChatMessage(input: SendMessageInput): Promise<ChatMessage> {
  const payload: SendMessageInput = {
    ...input,
    clientMessageId: ensureClientMessageId(input.clientMessageId),
  };

  return new Promise((resolve, reject) => {
    pendingOutbox.push({
      payload,
      retriesLeft: MAX_SEND_RETRIES,
      resolve,
      reject,
    });
    scheduleFlush(0);
  });
}

/**
 * 搜索消息（热库 + 归档）
 */
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
      if (!isAckOk(ack)) {
        reject(new Error(getAckErrorMessage(ack, "搜索失败")));
        return;
      }
      const data = getAckData<{ results?: Array<{
        targetType: "hot" | "archive";
        messageId: number | null;
        archiveId: number | null;
        source: "mobile" | "vscode";
        timestamp: number;
        preview: string;
      }> }>(ack);
      const legacy = ack as { results?: unknown };
      const results = data?.results ?? legacy.results;
      resolve(Array.isArray(results) ? results : []);
    });
  });
}

/**
 * 上报已读
 */
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

/**
 * 断开连接
 */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}

/**
 * 获取 socket 实例
 */
export function getSocket(): Socket | undefined {
  return socket;
}

/**
 * 检查是否已连接
 */
export function isConnected(): boolean {
  return socket?.connected || false;
}

/**
 * 重置历史加载状态
 */
export function resetHistoryLoaded(): void {
  historyLoaded = false;
}

/**
 * 获取历史加载状态
 */
export function isHistoryLoaded(): boolean {
  return historyLoaded;
}

/**
 * 检查并显示日期分隔符（如果日期变化）
 */
export function checkAndShowDateSeparator(timestamp: number): void {
  const msgDate = getDateKey(timestamp);
  if (msgDate !== lastDisplayedDate) {
    outputChannel?.appendLine(`[Info - 00:00:00] ═══════════ ${msgDate} ═══════════`);
    lastDisplayedDate = msgDate;
  }
}

/**
 * 重置日期显示状态
 */
export function resetLastDisplayedDate(): void {
  lastDisplayedDate = "";
}

/**
 * 加载历史消息
 */
export function loadHistory(): void {
  socket?.emit(SOCKET_EVENTS.LOAD_HISTORY, HISTORY_PAGE_SIZE);
}

/**
 * 加载更多历史消息
 */
export function loadMoreHistory(beforeTimestamp: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_MORE_HISTORY, { limit: HISTORY_PAGE_SIZE, beforeTimestamp });
}

/**
 * 按目标消息加载上下文窗口
 */
export function loadAroundMessage(targetMessageId: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, {
    targetMessageId,
    windowSize: DEFAULT_AROUND_WINDOW_SIZE,
  });
}

/**
 * 按归档消息加载上下文窗口
 */
export function loadAroundArchivedMessage(targetArchiveId: number): void {
  socket?.emit(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, {
    targetArchiveId,
    windowSize: DEFAULT_AROUND_WINDOW_SIZE,
  });
}

/**
 * 测试连接
 */
export function testConnection(
  serverUrl: string,
  token: string
): Promise<{ success: boolean; message: string; latency?: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const testSocket = io(serverUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 10000,
    });

    const cleanup = () => {
      testSocket.disconnect();
    };

    testSocket.on("connect", () => {
      const latency = Date.now() - startTime;
      cleanup();
      resolve({ success: true, message: "连接成功", latency });
    });

    testSocket.on("connect_error", (error: Error) => {
      cleanup();
      resolve({ success: false, message: `连接失败: ${error.message}` });
    });

    setTimeout(() => {
      cleanup();
      resolve({ success: false, message: "连接超时" });
    }, 10000);
  });
}

export function getActiveSocketCallbacks(): SocketCallbacks {
  return activeCallbacks;
}
