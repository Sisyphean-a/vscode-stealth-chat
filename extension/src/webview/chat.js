(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // Dependencies
  const { bindImageLinkEvents } = window.ChatUtils;
  const { createTimeDivider, createTimeGapDivider, createMessageElement } = window.ChatRenderer;
  const { createManager: createAttachmentManager } = window.ChatAttachments;

  // Constants
  const TIME_GAP_THRESHOLD = 10 * 60 * 1000;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const HISTORY_PAGE_SIZE = 50;
  const QUOTE_SNIPPET_MAX_LENGTH = 120;

  function normalizeServerUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function parsePositiveInt(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function buildMessageKey(msg) {
    const messageId = parsePositiveInt(msg?.id);
    if (messageId) {
      return `id:${messageId}`;
    }
    return `ts:${msg?.timestamp || 0}-src:${msg?.source || "unknown"}-txt:${msg?.text || ""}`;
  }

  function compareMessages(a, b) {
    if (a.timestamp === b.timestamp) {
      const aId = parsePositiveInt(a.id) || 0;
      const bId = parsePositiveInt(b.id) || 0;
      return aId - bId;
    }
    return a.timestamp - b.timestamp;
  }

  function buildQuoteSnippet(msg) {
    const hasAttachments = Array.isArray(msg?.attachments) && msg.attachments.length > 0;
    const text = typeof msg?.text === "string" ? msg.text.trim() : "";
    const raw = hasAttachments ? `[图片] ${text}`.trim() : text;
    if (!raw) {
      return "(空消息)";
    }
    if (raw.length <= QUOTE_SNIPPET_MAX_LENGTH) {
      return raw;
    }
    return `${raw.slice(0, QUOTE_SNIPPET_MAX_LENGTH - 3)}...`;
  }

  function buildComposerQuoteLabel(quote) {
    const snippet = quote.textSnippet || "(空消息)";
    return snippet;
  }

  function generateClientMessageId() {
    return `vscode-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function formatShortTime(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  /**
   * Merge messages into store by key and keep order.
   * @param {any[]} store
   * @param {any[]} incoming
   * @returns {any[]}
   */
  function mergeMessageStore(store, incoming) {
    const keyToMessage = new Map();
    store.forEach((msg) => keyToMessage.set(buildMessageKey(msg), msg));
    incoming.forEach((msg) => keyToMessage.set(buildMessageKey(msg), msg));
    return Array.from(keyToMessage.values()).sort(compareMessages);
  }

  function normalizeIncomingMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }
    return messages
      .filter((msg) => msg && typeof msg === "object" && Number.isFinite(Number(msg.timestamp)))
      .map((msg) => ({
        ...msg,
        text: typeof msg.text === "string" ? msg.text : "",
      }))
      .sort(compareMessages);
  }

  // Initialize settings module
  window.ChatSettings.init(vscode);

  // DOM elements
  /** @type {HTMLElement | null} */
  const statusIndicator = document.getElementById("status-indicator");
  /** @type {HTMLElement | null} */
  const statusText = document.getElementById("status-text");
  /** @type {HTMLElement | null} */
  const presenceText = document.getElementById("presence-text");
  /** @type {HTMLElement | null} */
  const readText = document.getElementById("read-text");
  /** @type {HTMLButtonElement | null} */
  const searchBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("search-btn"));
  /** @type {HTMLElement | null} */
  const messagesContainer = document.getElementById("messages-container");
  /** @type {HTMLTextAreaElement | null} */
  const messageInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("message-input"));
  /** @type {HTMLButtonElement | null} */
  const sendButton = /** @type {HTMLButtonElement | null} */ (document.getElementById("send-button"));
  /** @type {HTMLButtonElement | null} */
  const scrollToBottomBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("scroll-to-bottom"));
  /** @type {HTMLButtonElement | null} */
  const settingsBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("settings-btn"));
  /** @type {HTMLButtonElement | null} */
  const settingsBackBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("settings-back-btn"));
  /** @type {HTMLElement | null} */
  const searchPanel = document.getElementById("search-panel");
  /** @type {HTMLInputElement | null} */
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById("search-input"));
  /** @type {HTMLButtonElement | null} */
  const searchRunBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("search-run-btn"));
  /** @type {HTMLButtonElement | null} */
  const searchCloseBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("search-close-btn"));
  /** @type {HTMLElement | null} */
  const searchResults = document.getElementById("search-results");
  /** @type {HTMLElement | null} */
  const searchResultMeta = document.getElementById("search-result-meta");
  /** @type {HTMLElement | null} */
  const composerQuote = document.getElementById("composer-quote");
  /** @type {HTMLElement | null} */
  const composerQuoteText = document.getElementById("composer-quote-text");
  /** @type {HTMLButtonElement | null} */
  const composerQuoteClear = /** @type {HTMLButtonElement | null} */ (document.getElementById("composer-quote-clear"));

  // State
  let autoScrollEnabled = true;
  let lastMessageTimestamp = 0;
  /** @type {'bubble' | 'log'} */
  let displayMode = "bubble";
  /** @type {string} */
  let serverUrl = normalizeServerUrl("http://localhost:3000");
  /** @type {string} */
  let authToken = "";
  /** @type {any[]} */
  let messageStore = [];
  const messageElementIndex = new Map();
  const archiveElementIndex = new Map();

  // IME state
  let isComposing = false;
  /** @type {any[]} */
  let pendingMessages = [];

  // History state
  let isLoadingMore = false;
  let hasMoreHistory = true;
  /** @type {number | null} */
  let oldestTimestamp = null;
  let isFirstLoad = true;

  // Quote composer state
  /** @type {any | null} */
  let selectedQuote = null;
  let lastReadTimestamp = 0;

  const attachmentManager = createAttachmentManager({
    maxImageSize: MAX_IMAGE_SIZE,
    getInputContainer: () => document.getElementById("input-container"),
  });

  function setComposerQuote(quote) {
    selectedQuote = quote;
    if (!composerQuote || !composerQuoteText) {
      return;
    }
    if (!quote) {
      composerQuote.classList.add("hidden");
      composerQuoteText.textContent = "";
      return;
    }
    composerQuoteText.textContent = buildComposerQuoteLabel(quote);
    composerQuote.classList.remove("hidden");
  }

  function clearComposerQuote() {
    setComposerQuote(null);
  }

  function selectQuoteFromMessage(messageId) {
    const numericId = parsePositiveInt(messageId);
    if (!numericId) {
      console.error("[WebView] Cannot quote message without a valid id");
      return;
    }
    const target = messageStore.find((msg) => parsePositiveInt(msg.id) === numericId);
    if (!target) {
      console.error(`[WebView] Cannot find message #${numericId} for quote`);
      return;
    }
    setComposerQuote({
      messageId: numericId,
      textSnippet: buildQuoteSnippet(target),
      source: target.source,
      timestamp: target.timestamp,
    });
    if (messageInput) {
      messageInput.focus();
      const end = messageInput.value.length;
      messageInput.setSelectionRange(end, end);
    }
  }

  function setOldestTimestampFromStore() {
    oldestTimestamp = messageStore.length > 0 ? messageStore[0].timestamp : null;
  }

  function resetRenderState() {
    lastMessageTimestamp = 0;
    messageElementIndex.clear();
    archiveElementIndex.clear();
  }

  function renderMessage(msg) {
    if (!messagesContainer) {
      return;
    }

    if (msg.timestamp) {
      const lastDateStr = lastMessageTimestamp > 0
        ? new Date(lastMessageTimestamp).toLocaleDateString()
        : "";
      const currentDate = new Date(msg.timestamp).toLocaleDateString();

      if (currentDate !== lastDateStr) {
        messagesContainer.appendChild(createTimeDivider(msg.timestamp, displayMode));
      } else if (lastMessageTimestamp > 0 && (msg.timestamp - lastMessageTimestamp > TIME_GAP_THRESHOLD)) {
        messagesContainer.appendChild(createTimeGapDivider(msg.timestamp, displayMode));
      }
      lastMessageTimestamp = msg.timestamp;
    }

    const messageEl = createMessageElement(msg, displayMode, serverUrl);
    messagesContainer.appendChild(messageEl);
    bindImageLinkEvents(messageEl);

    const messageId = parsePositiveInt(msg.id);
    if (messageId) {
      messageElementIndex.set(messageId, messageEl);
    }
    const archiveId = parsePositiveInt(msg.archiveId);
    if (archiveId) {
      archiveElementIndex.set(archiveId, messageEl);
    }
  }

  function rebuildMessages(options = {}) {
    if (!messagesContainer) {
      return;
    }
    const { preserveScrollTop = null } = options;

    messagesContainer.innerHTML = "";
    resetRenderState();
    hideLoadMoreButton();

    if (hasMoreHistory) {
      showLoadMoreButton();
    }

    messageStore.forEach((msg) => renderMessage(msg));
    updateEmptyState();

    if (typeof preserveScrollTop === "number") {
      messagesContainer.scrollTop = preserveScrollTop;
    }
  }

  function appendMessageToView(msg) {
    if (!messagesContainer) {
      return;
    }

    const oldLength = messageStore.length;
    messageStore = mergeMessageStore(messageStore, [msg]);
    const added = messageStore.length > oldLength;
    if (!added) {
      return;
    }

    const isLatest = messageStore[messageStore.length - 1] === msg || compareMessages(msg, messageStore[messageStore.length - 1]) >= 0;
    if (!isLatest) {
      rebuildMessages();
      if (autoScrollEnabled) {
        scrollToBottom(true);
      }
      return;
    }

    renderMessage(msg);
    updateEmptyState();
    if (autoScrollEnabled) {
      scrollToBottom();
      reportReadStatus();
    } else if (scrollToBottomBtn) {
      scrollToBottomBtn.style.display = "flex";
    }
  }

  function focusMessage(messageId) {
    const target = messageElementIndex.get(messageId);
    if (!target) {
      return false;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("message-highlight");
    void target.offsetWidth;
    target.classList.add("message-highlight");
    setTimeout(() => target.classList.remove("message-highlight"), 1200);
    return true;
  }

  function focusArchivedMessage(archiveId) {
    const target = archiveElementIndex.get(archiveId);
    if (!target) {
      return false;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("message-highlight");
    void target.offsetWidth;
    target.classList.add("message-highlight");
    setTimeout(() => target.classList.remove("message-highlight"), 1200);
    return true;
  }

  function jumpToQuotedMessage(messageId) {
    const numericId = parsePositiveInt(messageId);
    if (!numericId) {
      return;
    }
    if (focusMessage(numericId)) {
      return;
    }
    vscode.postMessage({
      type: "loadAroundMessage",
      payload: { targetMessageId: numericId },
    });
  }

  function jumpToArchivedMessage(archiveId) {
    const numericId = parsePositiveInt(archiveId);
    if (!numericId) {
      return;
    }
    if (focusArchivedMessage(numericId)) {
      return;
    }
    vscode.postMessage({
      type: "loadAroundArchivedMessage",
      payload: { targetArchiveId: numericId },
    });
  }

  function renderSearchResults(keyword, results) {
    if (!searchResults || !searchResultMeta) {
      return;
    }
    searchResultMeta.textContent = keyword
      ? `关键词 "${keyword}"，共 ${results.length} 条`
      : "";
    searchResults.innerHTML = "";
    results.forEach((item) => {
      const row = document.createElement("div");
      row.className = "search-item";
      row.innerHTML = `
        <div>${item.preview || "(空消息)"}</div>
        <div class="search-item-meta">${item.targetType === "archive" ? "归档" : "热库"} · ${item.source} · ${formatShortTime(item.timestamp)}</div>
      `;
      row.addEventListener("click", () => {
        if (item.targetType === "hot" && parsePositiveInt(item.messageId)) {
          jumpToQuotedMessage(item.messageId);
          return;
        }
        if (item.targetType === "archive" && parsePositiveInt(item.archiveId)) {
          jumpToArchivedMessage(item.archiveId);
        }
      });
      searchResults.appendChild(row);
    });
  }

  function runSearch() {
    const keyword = searchInput?.value?.trim() || "";
    if (!keyword) {
      if (searchResultMeta) {
        searchResultMeta.textContent = "请输入关键词";
      }
      if (searchResults) {
        searchResults.innerHTML = "";
      }
      return;
    }
    vscode.postMessage({
      type: "searchMessages",
      payload: { keyword, limit: 50 },
    });
  }

  function updateReadHint(payload) {
    if (!readText) {
      return;
    }
    if (!payload || payload.clientType !== "mobile") {
      return;
    }
    readText.textContent = `对端已读 ${formatShortTime(payload.lastReadTimestamp)}`;
  }

  function reportReadStatus() {
    if (messageStore.length === 0) {
      return;
    }
    const last = messageStore[messageStore.length - 1];
    if (!last || !Number.isFinite(last.timestamp) || last.timestamp <= lastReadTimestamp) {
      return;
    }
    lastReadTimestamp = last.timestamp;
    vscode.postMessage({
      type: "markRead",
      payload: {
        lastReadTimestamp: last.timestamp,
        lastReadMessageId: parsePositiveInt(last.id) || undefined,
      },
    });
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  if (sendButton) {
    sendButton.addEventListener("click", sendMessage);
  }

  if (composerQuoteClear) {
    composerQuoteClear.addEventListener("click", clearComposerQuote);
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener("input", () => {
      messageInput.style.height = "auto";
      messageInput.style.height = `${messageInput.scrollHeight}px`;
    });

    messageInput.addEventListener("compositionstart", () => {
      isComposing = true;
    });

    messageInput.addEventListener("compositionend", () => {
      isComposing = false;
      flushPendingMessages();
    });

    messageInput.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            void handleImageFile(file);
          }
          break;
        }
      }
    });
  }

  if (messagesContainer) {
    messagesContainer.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      if (isAtBottom) {
        autoScrollEnabled = true;
        if (scrollToBottomBtn) {
          scrollToBottomBtn.style.display = "none";
        }
        reportReadStatus();
      } else {
        autoScrollEnabled = false;
      }
    });

    messagesContainer.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const quoteAction = target.closest("[data-quote-action='quote']");
      if (quoteAction) {
        e.preventDefault();
        const messageId = parsePositiveInt(quoteAction.dataset.messageId);
        if (messageId) {
          selectQuoteFromMessage(messageId);
        }
        return;
      }

      const quotePreviewEl = target.closest("[data-quote-message-id]");
      if (quotePreviewEl) {
        e.preventDefault();
        const quoteMessageId = parsePositiveInt(quotePreviewEl.dataset.quoteMessageId);
        if (quoteMessageId) {
          jumpToQuotedMessage(quoteMessageId);
        }
      }
    });
  }

  if (scrollToBottomBtn) {
    scrollToBottomBtn.addEventListener("click", () => {
      scrollToBottom(true);
      scrollToBottomBtn.style.display = "none";
      reportReadStatus();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      window.ChatSettings.show();
      vscode.postMessage({ type: "getConfig" });
    });
  }

  if (settingsBackBtn) {
    settingsBackBtn.addEventListener("click", () => window.ChatSettings.hide());
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      if (!searchPanel) {
        return;
      }
      searchPanel.classList.toggle("hidden");
      if (!searchPanel.classList.contains("hidden")) {
        searchInput?.focus();
      }
    });
  }

  if (searchCloseBtn) {
    searchCloseBtn.addEventListener("click", () => {
      searchPanel?.classList.add("hidden");
    });
  }

  if (searchRunBtn) {
    searchRunBtn.addEventListener("click", runSearch);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }

  // Listen for messages from extension
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "addMessage":
        if (isComposing) {
          pendingMessages.push(message.payload);
        } else {
          appendMessageToView(message.payload);
        }
        break;
      case "loadHistory":
        loadHistory(message.payload);
        break;
      case "prependHistory":
        prependHistory(message.payload.messages, message.payload.hasMore);
        break;
      case "aroundMessagesLoaded":
        handleAroundMessagesLoaded(message.payload);
        break;
      case "aroundArchivedMessagesLoaded":
        handleAroundArchivedMessagesLoaded(message.payload);
        break;
      case "updateStatus":
        updateStatus(message.payload.connected);
        break;
      case "presenceUpdate":
        updatePresence(message.payload);
        break;
      case "readReceipt":
        updateReadHint(message.payload);
        break;
      case "sendFailed":
        handleSendFailed(message.payload);
        break;
      case "searchResults":
        handleSearchResults(message.payload);
        break;
      case "setDisplayMode":
        {
          const payload = message.payload || {};
          if (Object.prototype.hasOwnProperty.call(payload, "serverUrl")) {
            serverUrl = normalizeServerUrl(payload.serverUrl);
          }
          if (Object.prototype.hasOwnProperty.call(payload, "token")) {
            authToken = typeof payload.token === "string" ? payload.token : "";
          }
          if (payload.mode === "bubble" || payload.mode === "log") {
            setDisplayMode(payload.mode);
          }
        }
        break;
      case "clearMessages":
        clearMessages();
        break;
      case "configLoaded":
        window.ChatSettings.loadConfig(message.payload);
        break;
      case "operationResult":
        window.ChatSettings.handleOperationResult(message.payload);
        break;
      case "testResult":
        window.ChatSettings.handleTestResult(message.payload);
        break;
    }
  });

  // ============================================================================
  // Message Handling
  // ============================================================================

  async function sendMessage() {
    if (!messageInput) {
      return;
    }

    const pendingAttachments = attachmentManager.getPending();
    const text = messageInput.value.trim();
    if (!text && pendingAttachments.length === 0) {
      return;
    }

    let attachments;
    if (pendingAttachments.length > 0) {
      if (!serverUrl) {
        console.error("[WebView] Image upload failed: missing server URL");
        return;
      }
      if (!authToken) {
        console.error("[WebView] Image upload failed: missing auth token");
        return;
      }
      try {
        attachments = await attachmentManager.uploadAll(serverUrl, authToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[WebView] Image upload failed:", message);
        return;
      }
    }

    const clientMessageId = generateClientMessageId();
    vscode.postMessage({
      type: "sendMessage",
      payload: {
        text: text || "",
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        quote: selectedQuote || undefined,
        clientMessageId,
      },
    });

    messageInput.value = "";
    messageInput.style.height = "auto";
    attachmentManager.clear();
    clearComposerQuote();
  }

  /**
   * @param {any[]} messages
   */
  function loadHistory(messages) {
    const normalized = normalizeIncomingMessages(messages);
    messageStore = normalized;
    setOldestTimestampFromStore();
    hasMoreHistory = normalized.length >= HISTORY_PAGE_SIZE;
    isLoadingMore = false;
    rebuildMessages();
    if (isFirstLoad) {
      scrollToBottom(true);
      isFirstLoad = false;
    }
    reportReadStatus();
  }

  function loadMoreHistory() {
    if (isLoadingMore || !hasMoreHistory || !oldestTimestamp) {
      return;
    }
    isLoadingMore = true;
    vscode.postMessage({
      type: "loadMoreHistory",
      payload: { beforeTimestamp: oldestTimestamp },
    });
  }

  /**
   * @param {any[]} messages
   * @param {boolean} hasMore
   */
  function prependHistory(messages, hasMore) {
    if (!messagesContainer) {
      return;
    }
    isLoadingMore = false;
    hasMoreHistory = hasMore;

    const oldScrollHeight = messagesContainer.scrollHeight;
    const oldScrollTop = messagesContainer.scrollTop;
    messageStore = mergeMessageStore(messageStore, normalizeIncomingMessages(messages));
    setOldestTimestampFromStore();
    rebuildMessages();

    const newScrollHeight = messagesContainer.scrollHeight;
    const heightDiff = newScrollHeight - oldScrollHeight;
    messagesContainer.scrollTop = oldScrollTop + heightDiff;
    reportReadStatus();
  }

  function handleAroundMessagesLoaded(payload) {
    if (!payload) {
      return;
    }
    if (payload.error) {
      console.error(`[WebView] Failed to load quote context: ${payload.error}`);
      return;
    }
    const incoming = normalizeIncomingMessages(payload.messages);
    if (incoming.length > 0) {
      messageStore = mergeMessageStore(messageStore, incoming);
      setOldestTimestampFromStore();
      rebuildMessages();
    }
    const targetMessageId = parsePositiveInt(payload.targetMessageId);
    if (!targetMessageId || !focusMessage(targetMessageId)) {
      console.error("[WebView] Quoted target message is not available in current history window");
    }
  }

  function handleAroundArchivedMessagesLoaded(payload) {
    if (!payload) {
      return;
    }
    if (payload.error) {
      console.error(`[WebView] Failed to load archive context: ${payload.error}`);
      return;
    }
    const incoming = normalizeIncomingMessages(payload.messages);
    if (incoming.length > 0) {
      messageStore = mergeMessageStore(messageStore, incoming);
      setOldestTimestampFromStore();
      rebuildMessages();
    }
    const targetArchiveId = parsePositiveInt(payload.targetArchiveId);
    if (!targetArchiveId || !focusArchivedMessage(targetArchiveId)) {
      console.error("[WebView] Archived target message is not visible");
    }
  }

  function handleSendFailed(payload) {
    const message = typeof payload?.error === "string" ? payload.error : "发送失败";
    console.error("[WebView] Send failed:", message);
    if (statusText) {
      statusText.textContent = `发送失败: ${message}`;
    }
  }

  function handleSearchResults(payload) {
    if (!searchResultMeta) {
      return;
    }
    if (payload?.error) {
      searchResultMeta.textContent = `搜索失败: ${payload.error}`;
      if (searchResults) {
        searchResults.innerHTML = "";
      }
      return;
    }
    renderSearchResults(payload?.keyword || "", Array.isArray(payload?.results) ? payload.results : []);
  }

  function updatePresence(payload) {
    if (!presenceText) {
      return;
    }
    const total = Number.isFinite(payload?.total) ? payload.total : 0;
    const mobile = Number.isFinite(payload?.mobile) ? payload.mobile : 0;
    presenceText.textContent = `在线 ${total} (M:${mobile})`;
  }

  function showLoadMoreButton() {
    if (!messagesContainer || document.getElementById("load-more-btn")) {
      return;
    }
    const btn = document.createElement("div");
    btn.id = "load-more-btn";
    btn.className = "load-more-btn";
    btn.textContent = "加载更多历史";
    btn.addEventListener("click", () => {
      btn.textContent = "加载中...";
      btn.classList.add("loading");
      loadMoreHistory();
    });
    messagesContainer.insertBefore(btn, messagesContainer.firstChild);
  }

  function hideLoadMoreButton() {
    const btn = document.getElementById("load-more-btn");
    if (btn) {
      btn.remove();
    }
  }

  function clearMessages() {
    messageStore = [];
    resetRenderState();
    oldestTimestamp = null;
    hasMoreHistory = true;
    isLoadingMore = false;
    isFirstLoad = true;
    lastReadTimestamp = 0;
    if (readText) {
      readText.textContent = "";
    }
    clearComposerQuote();
    if (!messagesContainer) {
      return;
    }
    messagesContainer.innerHTML = "";
    updateEmptyState();
  }

  function updateEmptyState() {
    if (!messagesContainer) {
      return;
    }
    const currentEmptyState = document.getElementById("empty-state");
    if (messageStore.length === 0) {
      if (currentEmptyState) {
        currentEmptyState.style.display = "block";
      } else {
        const empty = document.createElement("div");
        empty.id = "empty-state";
        empty.textContent = "暂无消息";
        messagesContainer.appendChild(empty);
      }
      return;
    }
    if (currentEmptyState) {
      currentEmptyState.remove();
    }
  }

  function flushPendingMessages() {
    if (pendingMessages.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      pendingMessages.forEach((msg) => appendMessageToView(msg));
      pendingMessages = [];
    });
  }

  /**
   * @param {'bubble' | 'log'} mode
   */
  function setDisplayMode(mode) {
    if (displayMode === mode) {
      return;
    }
    displayMode = mode;
    document.body.dataset.displayMode = mode;
    vscode.postMessage({ type: "ready" });
  }

  /**
   * @param {boolean} connected
   */
  function updateStatus(connected) {
    if (!statusIndicator || !statusText) {
      return;
    }
    if (connected) {
      statusIndicator.className = "status-connected";
      statusText.textContent = "已连接";
      return;
    }
    statusIndicator.className = "status-disconnected";
    statusText.textContent = "已断开";
    if (presenceText) {
      presenceText.textContent = "";
    }
  }

  /**
   * @param {boolean} [force]
   */
  function scrollToBottom(force = false) {
    if (!messagesContainer) {
      return;
    }
    if (force || autoScrollEnabled) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // ============================================================================
  // Attachment Handling
  // ============================================================================

  /**
   * @param {File} file
   */
  async function handleImageFile(file) {
    try {
      await attachmentManager.handleImageFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[WebView] Failed to add image:", message);
      alert(`添加图片失败：${message}`);
    }
  }

  // ============================================================================
  // Image Preview
  // ============================================================================

  /**
   * @param {string} url
   */
  // @ts-ignore
  window.showImagePreview = function(url) {
    vscode.postMessage({
      type: "openImage",
      payload: { url },
    });
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  updateEmptyState();
  vscode.postMessage({ type: "ready" });
})();
