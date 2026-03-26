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
  buildClientMessageId,
  parsePositiveInt,
} from "/packages/chat-core/index.js";
import {
  SOCKET_EVENTS,
  buildSocketClientEnvelope,
  parseSocketAck,
  parseSocketClientPayload,
  parseSocketServerPayload,
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

  const readErrorText = (error, fallback) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    return fallback;
  };

  const parseServerPayloadOrThrow = (event, payload) => {
    try {
      return parseSocketServerPayload(event, payload).payload;
    } catch (error) {
      const message = readErrorText(error, "服务端消息格式错误");
      errorMsg.value = `协议错误: ${message}`;
      throw error;
    }
  };

  const validateClientPayloadOrThrow = (event, payload, options = {}) => {
    try {
      const envelope = buildSocketClientEnvelope(event, payload, options);
      return parseSocketClientPayload(event, envelope);
    } catch (error) {
      const message = readErrorText(error, "客户端消息格式错误");
      errorMsg.value = `协议错误: ${message}`;
      throw error;
    }
  };

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
      const historyPayload = validateClientPayloadOrThrow(SOCKET_EVENTS.LOAD_HISTORY, HISTORY_PAGE_SIZE, {
        traceId: buildClientMessageId("trace"),
      });
      socket.emit(SOCKET_EVENTS.LOAD_HISTORY, historyPayload);
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
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.CHAT_MESSAGE, msg);
        callbacks.onMessage?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid chat message payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.HISTORY_LOADED, (history) => {
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.HISTORY_LOADED, history);
        hasMoreHistory.value = validated.length >= HISTORY_PAGE_SIZE;
        callbacks.onHistoryLoaded?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid history payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.MORE_HISTORY_LOADED, (payload) => {
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.MORE_HISTORY_LOADED, payload);
        isLoadingMore.value = false;
        hasMoreHistory.value = validated.hasMore;
        moreHistoryCallback?.(validated.messages);
      } catch (error) {
        isLoadingMore.value = false;
        console.error("[Mobile] Invalid more history payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, (payload) => {
      const callback = aroundMessageCallback;
      aroundMessageCallback = null;
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.AROUND_MESSAGE_LOADED, payload);
        callback?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid around message payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, (payload) => {
      const callback = aroundArchivedMessageCallback;
      aroundArchivedMessageCallback = null;
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.AROUND_ARCHIVED_MESSAGE_LOADED, payload);
        callback?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid around archived payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (payload) => {
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.PRESENCE_UPDATE, payload);
        callbacks.onPresenceUpdate?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid presence payload:", error);
      }
    });

    socket.on(SOCKET_EVENTS.READ_RECEIPT, (payload) => {
      try {
        const validated = parseServerPayloadOrThrow(SOCKET_EVENTS.READ_RECEIPT, payload);
        callbacks.onReadReceipt?.(validated);
      } catch (error) {
        console.error("[Mobile] Invalid read receipt payload:", error);
      }
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

  const emit = (event, data, options = {}) => {
    if (socket?.connected) {
      try {
        const validated = validateClientPayloadOrThrow(event, data, options);
        socket.emit(event, validated);
        return true;
      } catch (error) {
        console.error("[Mobile] Invalid outbound payload:", error);
      }
    }
    return false;
  };

  const emitWithAck = (event, data, timeoutMs = ACK_TIMEOUT_MS, options = {}) => {
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

      let validatedData;
      try {
        validatedData = validateClientPayloadOrThrow(event, data, options);
      } catch (error) {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      socket.emit(event, validatedData, (ack) => {
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
    const clientMessageId = typeof payload?.clientMessageId === "string" && payload.clientMessageId.trim()
      ? payload.clientMessageId.trim()
      : buildClientMessageId("mobile");
    const requestPayload = { ...payload, clientMessageId };
    let lastError = new Error("发送失败");
    let retriesLeft = MAX_SEND_RETRIES;
    while (retriesLeft >= 0) {
      try {
        const ack = await emitWithAck(
          SOCKET_EVENTS.CHAT_MESSAGE,
          requestPayload,
          ACK_TIMEOUT_MS,
          { traceId: clientMessageId }
        );
        const parsedAck = parseSocketAck(SOCKET_EVENTS.CHAT_MESSAGE, ack);
        if (isAckOk(parsedAck)) {
          const data = getAckData(parsedAck);
          if (!data || !data.message) {
            throw new Error("发送响应缺少 message 字段");
          }
          return data.message;
        }
        throw new Error(getAckErrorMessage(parsedAck, "发送失败"));
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

  const searchMessages = async (keyword, limit = SEARCH_RESULT_LIMIT, includeArchived = true) => {
    const ack = await emitWithAck(
      SOCKET_EVENTS.SEARCH_MESSAGES,
      { keyword, limit, includeArchived },
      6000,
      { traceId: buildClientMessageId("trace") }
    );
    const parsedAck = parseSocketAck(SOCKET_EVENTS.SEARCH_MESSAGES, ack);
    if (!isAckOk(parsedAck)) {
      throw new Error(getAckErrorMessage(parsedAck, "搜索失败"));
    }
    const data = getAckData(parsedAck);
    if (!data) {
      throw new Error("搜索响应缺少 data 字段");
    }
    return data.results;
  };

  const markRead = (lastReadTimestamp, lastReadMessageId) => {
    if (!socket?.connected) {
      return;
    }
    const payload = validateClientPayloadOrThrow(SOCKET_EVENTS.MARK_READ, {
      clientType: "mobile",
      lastReadTimestamp,
      lastReadMessageId,
    }, {
      traceId: buildClientMessageId("trace"),
    });
    socket.emit(SOCKET_EVENTS.MARK_READ, payload);
  };

  const getSocket = () => socket;

  const loadMoreHistory = (beforeTimestamp, callback) => {
    if (!socket?.connected || isLoadingMore.value || !hasMoreHistory.value) {
      return false;
    }
    isLoadingMore.value = true;
    moreHistoryCallback = callback;
    const payload = validateClientPayloadOrThrow(SOCKET_EVENTS.LOAD_MORE_HISTORY, {
      limit: HISTORY_PAGE_SIZE,
      beforeTimestamp,
    }, {
      traceId: buildClientMessageId("trace"),
    });
    socket.emit(SOCKET_EVENTS.LOAD_MORE_HISTORY, payload);
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
    const payload = validateClientPayloadOrThrow(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, {
      targetMessageId: parsed,
      windowSize: DEFAULT_AROUND_WINDOW_SIZE,
    }, {
      traceId: buildClientMessageId("trace"),
    });
    socket.emit(SOCKET_EVENTS.LOAD_AROUND_MESSAGE, payload);
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
    const payload = validateClientPayloadOrThrow(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, {
      targetArchiveId: parsed,
      windowSize: DEFAULT_AROUND_WINDOW_SIZE,
    }, {
      traceId: buildClientMessageId("trace"),
    });
    socket.emit(SOCKET_EVENTS.LOAD_AROUND_ARCHIVED_MESSAGE, payload);
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
