/**
 * Socket.io 连接服务
 */
import { io, Socket } from "socket.io-client";
import { ChatMessage, MessageQuote, SocketCallbacks } from "../types";
import * as messageCache from "./messageCache";
import * as statusBar from "../ui/statusBar";
import { getActiveConnection, getCurrentTimestamp, formatTimestamp, getDateKey } from "../utils/helpers";

let socket: Socket | undefined;
let outputChannel: import("vscode").OutputChannel | undefined;
let historyLoaded = false;
let lastDisplayedDate = "";
let activeCallbacks: SocketCallbacks = {};

const HISTORY_LOAD_LIMIT = 50;
const AROUND_WINDOW_SIZE = 25;
const SEARCH_RESULT_LIMIT = 50;
const ACK_TIMEOUT_MS = 4000;
const MAX_SEND_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

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
  if (typeof input === "string" && input.trim().length > 0) {
    return input.trim();
  }
  return `vscode-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function scheduleFlush(delayMs = 0): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    void flushOutbox();
  }, delayMs);
}

function normalizeAckError(payload: unknown): Error {
  if (!payload || typeof payload !== "object") {
    return new Error("发送失败");
  }
  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim().length > 0) {
    return new Error(maybeError);
  }
  return new Error("发送失败");
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

    socket?.emit("chat message", payload, (ack: unknown) => {
      if (timedOut) {
        return;
      }
      clearTimeout(timer);
      const response = ack as {
        ok?: boolean;
        message?: ChatMessage;
      };
      if (response?.ok && response.message) {
        resolve(response.message);
        return;
      }
      reject(normalizeAckError(ack));
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
        socket?.emit("load history", HISTORY_LOAD_LIMIT);
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

    socket.on("history loaded", (messages: ChatMessage[]) => {
      historyLoaded = true;
      const safeMessages = Array.isArray(messages) ? messages : [];

      if (safeMessages.length === 0) {
        logInfo("No historical messages found");
        callbacks.onHistoryLoaded?.([]);
        return;
      }

      messageCache.mergeHistory(safeMessages);
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
      callbacks.onHistoryLoaded?.(messageCache.getCachedMessages());
    });

    socket.on("more history loaded", (data: { messages: ChatMessage[]; hasMore: boolean }) => {
      if (data.messages.length > 0) {
        messageCache.prependHistory(data.messages);
      }
      callbacks.onMoreHistoryLoaded?.(data.messages, data.hasMore);
    });

    socket.on("chat message", (data: ChatMessage) => {
      callbacks.onMessage?.(data);
    });

    socket.on("around message loaded", (payload: {
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

    socket.on("around archived message loaded", (payload: {
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

    socket.on("presence update", (payload) => {
      callbacks.onPresenceUpdate?.({
        appId: typeof payload?.appId === "string" ? payload.appId : "default",
        total: Number.isFinite(payload?.total) ? payload.total : 0,
        mobile: Number.isFinite(payload?.mobile) ? payload.mobile : 0,
        vscode: Number.isFinite(payload?.vscode) ? payload.vscode : 0,
      });
    });

    socket.on("read receipt", (payload) => {
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
    socket?.emit("search messages", { keyword: safeKeyword, limit }, (ack: unknown) => {
      const response = ack as {
        ok?: boolean;
        error?: string;
        results?: Array<{
          targetType: "hot" | "archive";
          messageId: number | null;
          archiveId: number | null;
          source: "mobile" | "vscode";
          timestamp: number;
          preview: string;
        }>;
      };
      if (!response?.ok) {
        reject(new Error(response?.error || "搜索失败"));
        return;
      }
      resolve(Array.isArray(response.results) ? response.results : []);
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
  socket.emit("mark read", {
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
  socket?.emit("load history", HISTORY_LOAD_LIMIT);
}

/**
 * 加载更多历史消息
 */
export function loadMoreHistory(beforeTimestamp: number): void {
  socket?.emit("load more history", { limit: HISTORY_LOAD_LIMIT, beforeTimestamp });
}

/**
 * 按目标消息加载上下文窗口
 */
export function loadAroundMessage(targetMessageId: number): void {
  socket?.emit("load around message", { targetMessageId, windowSize: AROUND_WINDOW_SIZE });
}

/**
 * 按归档消息加载上下文窗口
 */
export function loadAroundArchivedMessage(targetArchiveId: number): void {
  socket?.emit("load around archived message", { targetArchiveId, windowSize: AROUND_WINDOW_SIZE });
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
