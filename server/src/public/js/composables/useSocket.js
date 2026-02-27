/**
 * Socket.io 连接 Composable
 * 管理 Socket.io 连接生命周期、消息 ACK 与重试
 */
import {
  ACK_TIMEOUT_MS,
  DEFAULT_AROUND_WINDOW_SIZE,
  HISTORY_PAGE_SIZE,
  MAX_SEND_RETRIES,
  RETRY_DELAY_MS,
  SEARCH_RESULT_LIMIT,
  parsePositiveInt,
} from "/packages/chat-core/index.js";
import {
  SOCKET_EVENTS,
  getAckData,
  getAckErrorMessage,
  isAckOk,
} from "/packages/protocol/socket-events.js";

const { ref } = Vue;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSocket() {
  const connected = ref(false);
  const socketConnected = ref(false);
  const isConnecting = ref(false);
  const isLoadingMore = ref(false);
  const hasMoreHistory = ref(true);
  const errorMsg = ref("");

  let socket = null;
  let moreHistoryCallback = null;
  let aroundMessageCallback = null;
  let aroundArchivedMessageCallback = null;

  const connect = (token, callbacks = {}) => {
    if (!token) {
      errorMsg.value = "请输入密钥";
      return null;
    }

    isConnecting.value = true;
    errorMsg.value = "";
    socket = io({
      auth: { token, clientType: "mobile" },
    });

    socket.on("connect", () => {
      connected.value = true;
      socketConnected.value = true;
      isConnecting.value = false;
      errorMsg.value = "";
      socket.emit(SOCKET_EVENTS.LOAD_HISTORY, HISTORY_PAGE_SIZE);
      callbacks.onConnect?.();
    });

    socket.on("connect_error", (err) => {
      isConnecting.value = false;
      errorMsg.value = `连接失败: ${err.message}`;
      connected.value = false;
      socketConnected.value = false;
      callbacks.onConnectError?.(err);
    });

    socket.on("disconnect", () => {
      connected.value = false;
      socketConnected.value = false;
      callbacks.onDisconnect?.();
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (msg) => {
      callbacks.onMessage?.(msg);
    });

    socket.on(SOCKET_EVENTS.HISTORY_LOADED, (history) => {
      hasMoreHistory.value = history && history.length >= HISTORY_PAGE_SIZE;
      callbacks.onHistoryLoaded?.(history);
    });

    socket.on(SOCKET_EVENTS.MORE_HISTORY_LOADED, ({ messages, hasMore }) => {
      isLoadingMore.value = false;
      hasMoreHistory.value = hasMore;
      moreHistoryCallback?.(messages);
    });

    socket.on(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, (payload) => {
      const callback = aroundMessageCallback;
      aroundMessageCallback = null;
      callback?.(payload || { messages: [], targetMessageId: null, error: "Invalid payload" });
    });

    socket.on(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, (payload) => {
      const callback = aroundArchivedMessageCallback;
      aroundArchivedMessageCallback = null;
      callback?.(payload || { messages: [], targetArchiveId: null, error: "Invalid payload" });
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
        clientType:
          payload?.clientType === "mobile" || payload?.clientType === "vscode"
            ? payload.clientType
            : "unknown",
        lastReadTimestamp: Number.isFinite(payload?.lastReadTimestamp)
          ? payload.lastReadTimestamp
          : Date.now(),
        lastReadMessageId: Number.isFinite(payload?.lastReadMessageId)
          ? payload.lastReadMessageId
          : null,
      });
    });

    return socket;
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    moreHistoryCallback = null;
    aroundMessageCallback = null;
    aroundArchivedMessageCallback = null;
    connected.value = false;
    socketConnected.value = false;
  };

  const emit = (event, data) => {
    if (socket?.connected) {
      socket.emit(event, data);
      return true;
    }
    return false;
  };

  const emitWithAck = (event, data, timeoutMs = ACK_TIMEOUT_MS) => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error("当前未连接"));
        return;
      }
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) {
          return;
        }
        finished = true;
        reject(new Error("确认超时"));
      }, timeoutMs);

      socket.emit(event, data, (ack) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        resolve(ack);
      });
    });
  };

  const sendChatMessage = async (payload) => {
    let lastError = new Error("发送失败");
    let retriesLeft = MAX_SEND_RETRIES;
    while (retriesLeft >= 0) {
      try {
        const ack = await emitWithAck(SOCKET_EVENTS.CHAT_MESSAGE, payload, ACK_TIMEOUT_MS);
        if (isAckOk(ack)) {
          return getAckData(ack);
        }
        throw new Error(getAckErrorMessage(ack, "发送失败"));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (retriesLeft === 0) {
          throw lastError;
        }
        retriesLeft -= 1;
        await wait(RETRY_DELAY_MS);
      }
    }
    throw lastError;
  };

  const searchMessages = async (keyword, limit = SEARCH_RESULT_LIMIT) => {
    const ack = await emitWithAck(SOCKET_EVENTS.SEARCH_MESSAGES, { keyword, limit }, 6000);
    if (!isAckOk(ack)) {
      throw new Error(getAckErrorMessage(ack, "搜索失败"));
    }
    const data = getAckData(ack);
    return Array.isArray(data?.results) ? data.results : [];
  };

  const markRead = (lastReadTimestamp, lastReadMessageId) => {
    if (!socket?.connected) {
      return;
    }
    socket.emit(SOCKET_EVENTS.MARK_READ, {
      clientType: "mobile",
      lastReadTimestamp,
      lastReadMessageId,
    });
  };

  const getSocket = () => socket;

  const loadMoreHistory = (beforeTimestamp, callback) => {
    if (!socket?.connected || isLoadingMore.value || !hasMoreHistory.value) {
      return false;
    }
    isLoadingMore.value = true;
    moreHistoryCallback = callback;
    socket.emit(SOCKET_EVENTS.LOAD_MORE_HISTORY, {
      limit: HISTORY_PAGE_SIZE,
      beforeTimestamp,
    });
    return true;
  };

  const loadAroundMessage = (targetMessageId, callback) => {
    if (!socket?.connected) {
      return false;
    }
    const parsed = parsePositiveInt(targetMessageId);
    if (!parsed) {
      return false;
    }
    aroundMessageCallback = callback;
    socket.emit(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, {
      targetMessageId: parsed,
      windowSize: DEFAULT_AROUND_WINDOW_SIZE,
    });
    return true;
  };

  const loadAroundArchivedMessage = (targetArchiveId, callback) => {
    if (!socket?.connected) {
      return false;
    }
    const parsed = parsePositiveInt(targetArchiveId);
    if (!parsed) {
      return false;
    }
    aroundArchivedMessageCallback = callback;
    socket.emit(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, {
      targetArchiveId: parsed,
      windowSize: DEFAULT_AROUND_WINDOW_SIZE,
    });
    return true;
  };

  const resetLoadMoreState = () => {
    hasMoreHistory.value = true;
    isLoadingMore.value = false;
  };

  return {
    connected,
    socketConnected,
    isConnecting,
    isLoadingMore,
    hasMoreHistory,
    errorMsg,
    connect,
    disconnect,
    emit,
    emitWithAck,
    sendChatMessage,
    searchMessages,
    markRead,
    getSocket,
    loadMoreHistory,
    loadAroundMessage,
    loadAroundArchivedMessage,
    resetLoadMoreState,
  };
}
