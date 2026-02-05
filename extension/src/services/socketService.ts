/**
 * Socket.io 连接服务
 */
import { io, Socket } from "socket.io-client";
import { ChatMessage, SocketCallbacks } from "../types";
import * as messageCache from "./messageCache";
import * as statusBar from "../ui/statusBar";
import { getActiveConnection, getCurrentTimestamp, formatTimestamp, getDateKey } from "../utils/helpers";

let socket: Socket | undefined;
let outputChannel: import("vscode").OutputChannel | undefined;
let historyLoaded = false;
let lastDisplayedDate: string = "";

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
  try {
    const conn = getActiveConnection();
    statusBar.setConnecting(conn.name);

    socket = io(serverUrl, {
      auth: { token },
      transports: forceWebsocket ? ["websocket"] : ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel?.appendLine(`[Info - ${timestamp}] TS-Lint Service connected`);
      statusBar.setTooltip("TS-Lint Service 已连接");
      statusBar.updateStatusBar();
      socket?.emit("load history", 50);
      callbacks.onConnect?.();
    });

    socket.on("disconnect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel?.appendLine(`[Info - ${timestamp}] TS-Lint Service disconnected`);
      statusBar.setTooltip("TS-Lint Service 已断开");
      callbacks.onDisconnect?.();
    });

    socket.on("connect_error", (error: Error) => {
      const timestamp = getCurrentTimestamp();
      outputChannel?.appendLine(`[Error - ${timestamp}] Connection failed: ${error.message}`);
      statusBar.setTooltip(`连接失败: ${error.message}`);
      callbacks.onConnectError?.(error);
    });

    socket.on("history loaded", (messages: ChatMessage[]) => {
      if (messages.length > 0) {
        messageCache.mergeHistory(messages);
        const timestamp = getCurrentTimestamp();
        outputChannel?.appendLine(`[Info - ${timestamp}] Loading ${messages.length} historical messages...`);

        lastDisplayedDate = "";
        messages.forEach((msg) => {
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
        outputChannel?.appendLine(`[Info - ${timestamp}] History loaded successfully`);
        callbacks.onHistoryLoaded?.(messageCache.getCachedMessages());
      }
    });

    socket.on("more history loaded", (data: { messages: ChatMessage[]; hasMore: boolean }) => {
      if (data.messages.length > 0) {
        messageCache.prependHistory(data.messages);
      }
      callbacks.onMoreHistoryLoaded?.(data.messages, data.hasMore);
    });

    socket.on("chat message", (data: ChatMessage) => {
      if (data.source === "mobile") {
        callbacks.onMessage?.(data);
      }
    });
  } catch (error) {
    // Silent error handling
  }
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
 * 设置历史已加载
 */
export function setHistoryLoaded(): void {
  historyLoaded = true;
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
 * 加载更多历史消息
 */
export function loadMoreHistory(beforeTimestamp: number): void {
  socket?.emit("load more history", { limit: 50, beforeTimestamp });
}
