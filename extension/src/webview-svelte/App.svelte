<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { ChatMessage, Connection, GlobalSettings, MessageQuote } from "../types";
  import type { HostMessage } from "../webview/protocol";
  import Composer from "./components/Composer.svelte";
  import MessageList from "./components/MessageList.svelte";
  import SearchPanel from "./components/SearchPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import { HISTORY_PAGE_SIZE } from "./lib/constants";
  import { normalizeServerUrl } from "./lib/format";
  import { uploadAll, type PendingAttachment } from "./lib/attachments";
  import {
    compareMessages,
    makeQuoteFromMessage,
    mergeMessageStore,
    normalizeIncomingMessages,
    parsePositiveInt,
    type DisplayMode,
    type SearchResult,
  } from "./lib/messageStore";
  import { listenHostMessages, postToHost } from "./lib/webviewClient";

  const TEST_BADGE_TIMEOUT_MS = 5000;
  const SEND_ERROR_TIMEOUT_MS = 3000;

  const DEFAULT_SETTINGS: GlobalSettings = {
    serverUrl: "http://localhost:3000",
    forceWebsocket: false,
    autoReveal: false,
    displayMode: "bubble",
  };

  let connected: boolean | null = null;
  let presenceText = "";
  let readText = "";
  let sendError = "";
  let sendErrorTimer: number | undefined;

  let displayMode: DisplayMode = "bubble";
  let serverUrl = normalizeServerUrl(DEFAULT_SETTINGS.serverUrl);
  let authToken = "";

  let messages: ChatMessage[] = [];
  let hasMoreHistory = true;
  let isLoadingMore = false;
  let oldestTimestamp: number | null = null;
  let isFirstLoad = true;
  let lastReadTimestamp = 0;

  let autoScrollEnabled = true;
  let showScrollToBottom = false;
  let isComposing = false;
  let pendingIncoming: ChatMessage[] = [];

  let selectedQuote: MessageQuote | null = null;
  let composerResetToken = 0;
  let messageListRef: MessageList | undefined;

  let searchVisible = false;
  let searchResults: SearchResult[] = [];
  let searchMeta = "";
  let searchError = "";

  let settingsVisible = false;
  let globalSettings: GlobalSettings = DEFAULT_SETTINGS;
  let connections: Connection[] = [];
  let activeConnection = "";
  let testBadges: Record<string, { success: boolean; latency?: number }> = {};
  const badgeTimers = new Map<string, number>();

  $: document.body.dataset.displayMode = displayMode;
  $: oldestTimestamp = messages.length > 0 ? messages[0].timestamp : null;

  onMount(() => {
    const dispose = listenHostMessages(handleHostMessage);
    postToHost({ type: "ready" });
    return () => {
      dispose();
      clearRuntimeTimers();
    };
  });

  function clearRuntimeTimers(): void {
    if (sendErrorTimer) {
      window.clearTimeout(sendErrorTimer);
    }
    for (const timer of badgeTimers.values()) {
      window.clearTimeout(timer);
    }
    badgeTimers.clear();
  }

  function setSendError(message: string): void {
    sendError = message;
    if (sendErrorTimer) {
      window.clearTimeout(sendErrorTimer);
    }
    sendErrorTimer = window.setTimeout(() => {
      sendError = "";
    }, SEND_ERROR_TIMEOUT_MS);
  }

  function handleHostMessage(message: HostMessage): void {
    if (message.type === "addMessage") {
      enqueueIncoming(message.payload);
      return;
    }
    if (message.type === "loadHistory") {
      void loadHistory(message.payload);
      return;
    }
    if (message.type === "prependHistory") {
      void prependHistory(message.payload.messages, message.payload.hasMore);
      return;
    }
    if (message.type === "aroundMessagesLoaded") {
      void applyAroundMessages(message.payload.messages, message.payload.targetMessageId, false, message.payload.error);
      return;
    }
    if (message.type === "aroundArchivedMessagesLoaded") {
      void applyAroundMessages(message.payload.messages, message.payload.targetArchiveId, true, message.payload.error);
      return;
    }
    if (message.type === "updateStatus") {
      connected = message.payload.connected;
      if (!connected) {
        presenceText = "";
      }
      return;
    }
    if (message.type === "presenceUpdate") {
      presenceText = `在线 ${message.payload.total} (M:${message.payload.mobile})`;
      return;
    }
    if (message.type === "readReceipt") {
      if (message.payload.clientType === "mobile") {
        const date = new Date(message.payload.lastReadTimestamp);
        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        readText = `对端已读 ${hh}:${mm}`;
      }
      return;
    }
    if (message.type === "sendFailed") {
      setSendError(message.payload.error || "发送失败");
      return;
    }
    if (message.type === "searchResults") {
      searchError = message.payload.error || "";
      searchResults = message.payload.results || [];
      searchMeta = message.payload.keyword
        ? `关键词 "${message.payload.keyword}"，共 ${searchResults.length} 条`
        : "";
      return;
    }
    if (message.type === "setDisplayMode") {
      displayMode = message.payload.mode;
      serverUrl = normalizeServerUrl(message.payload.serverUrl || DEFAULT_SETTINGS.serverUrl);
      authToken = message.payload.token || "";
      return;
    }
    if (message.type === "clearMessages") {
      resetAllMessages();
      return;
    }
    if (message.type === "configLoaded") {
      globalSettings = message.payload.globalSettings || DEFAULT_SETTINGS;
      connections = Array.isArray(message.payload.connections) ? message.payload.connections : [];
      activeConnection = message.payload.activeConnection || "";
      return;
    }
    if (message.type === "operationResult") {
      if (message.payload.success) {
        postToHost({ type: "getConfig" });
      } else {
        setSendError(message.payload.message);
      }
      return;
    }
    if (message.type === "testResult") {
      const { name, success, latency } = message.payload;
      testBadges = { ...testBadges, [name]: { success, latency } };
      const oldTimer = badgeTimers.get(name);
      if (oldTimer) {
        window.clearTimeout(oldTimer);
      }
      const timer = window.setTimeout(() => {
        const next = { ...testBadges };
        delete next[name];
        testBadges = next;
      }, TEST_BADGE_TIMEOUT_MS);
      badgeTimers.set(name, timer);
    }
  }

  function enqueueIncoming(message: ChatMessage): void {
    if (isComposing) {
      pendingIncoming = [...pendingIncoming, message];
      return;
    }
    void appendMessage(message);
  }

  function scrollToBottomStable(): void {
    messageListRef?.scrollToBottom(true);
    window.requestAnimationFrame(() => {
      messageListRef?.scrollToBottom(true);
    });
  }

  async function appendMessage(message: ChatMessage): Promise<void> {
    const oldLength = messages.length;
    const merged = mergeMessageStore(messages, [message]);
    if (merged.length === oldLength) {
      return;
    }
    const isLatest = compareMessages(message, merged[merged.length - 1]) >= 0;
    messages = merged;
    if (!isLatest) {
      return;
    }
    if (autoScrollEnabled) {
      await tick();
      scrollToBottomStable();
      reportReadStatus();
      return;
    }
    showScrollToBottom = true;
  }

  async function loadHistory(raw: unknown): Promise<void> {
    const normalized = normalizeIncomingMessages(raw);
    messages = normalized;
    hasMoreHistory = normalized.length >= HISTORY_PAGE_SIZE;
    isLoadingMore = false;
    if (isFirstLoad) {
      await tick();
      scrollToBottomStable();
      isFirstLoad = false;
    }
    reportReadStatus();
  }

  async function prependHistory(raw: unknown, hasMore: boolean): Promise<void> {
    const beforeTop = messageListRef?.getScrollTop() ?? 0;
    messages = mergeMessageStore(messages, normalizeIncomingMessages(raw));
    hasMoreHistory = hasMore;
    isLoadingMore = false;
    await tick();
    messageListRef?.setScrollTop(beforeTop);
    reportReadStatus();
  }

  async function applyAroundMessages(
    raw: unknown,
    targetId: number | null,
    archived: boolean,
    error?: string | null
  ): Promise<void> {
    if (error) {
      setSendError(error);
      return;
    }
    const incoming = normalizeIncomingMessages(raw);
    if (incoming.length > 0) {
      messages = mergeMessageStore(messages, incoming);
      await tick();
    }
    const safeTargetId = parsePositiveInt(targetId);
    if (!safeTargetId) {
      return;
    }
    const focused = archived
      ? messageListRef?.focusArchivedMessage(safeTargetId)
      : messageListRef?.focusMessage(safeTargetId);
    if (!focused) {
      setSendError(archived ? "归档目标消息不可见" : "引用目标消息不可见");
    }
  }

  function resetAllMessages(): void {
    messages = [];
    selectedQuote = null;
    pendingIncoming = [];
    hasMoreHistory = true;
    isLoadingMore = false;
    isFirstLoad = true;
    lastReadTimestamp = 0;
    readText = "";
    showScrollToBottom = false;
    searchResults = [];
    searchMeta = "";
    searchError = "";
  }

  function reportReadStatus(): void {
    if (messages.length === 0) {
      return;
    }
    const last = messages[messages.length - 1];
    if (!Number.isFinite(last.timestamp) || last.timestamp <= lastReadTimestamp) {
      return;
    }
    lastReadTimestamp = last.timestamp;
    postToHost({
      type: "markRead",
      payload: {
        lastReadTimestamp: last.timestamp,
        lastReadMessageId: parsePositiveInt(last.id) || undefined,
      },
    });
  }

  async function flushPendingIncoming(): Promise<void> {
    if (pendingIncoming.length === 0) {
      return;
    }
    const queue = [...pendingIncoming];
    pendingIncoming = [];
    for (const message of queue) {
      await appendMessage(message);
    }
  }

  function onComposerComposition(active: boolean): void {
    isComposing = active;
    if (!active) {
      void flushPendingIncoming();
    }
  }

  function onMessageQuote(messageId: number): void {
    const target = messages.find((item) => parsePositiveInt(item.id) === messageId);
    if (!target) {
      setSendError(`无法找到消息 #${messageId}`);
      return;
    }
    selectedQuote = makeQuoteFromMessage(target);
  }

  function jumpToMessage(messageId: number): void {
    if (messageListRef?.focusMessage(messageId)) {
      return;
    }
    postToHost({ type: "loadAroundMessage", payload: { targetMessageId: messageId } });
  }

  function jumpToArchivedMessage(archiveId: number): void {
    if (messageListRef?.focusArchivedMessage(archiveId)) {
      return;
    }
    postToHost({ type: "loadAroundArchivedMessage", payload: { targetArchiveId: archiveId } });
  }

  async function sendMessage(text: string, pendingAttachments: PendingAttachment[]): Promise<void> {
    if (!text.trim() && pendingAttachments.length === 0) {
      return;
    }
    let attachments;
    if (pendingAttachments.length > 0) {
      if (!serverUrl) {
        throw new Error("Image upload failed: missing server URL");
      }
      if (!authToken) {
        throw new Error("Image upload failed: missing auth token");
      }
      attachments = await uploadAll(serverUrl, authToken, pendingAttachments);
    }
    const clientMessageId = `vscode-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    postToHost({
      type: "sendMessage",
      payload: {
        text: text.trim(),
        attachments: attachments?.length ? attachments : undefined,
        quote: selectedQuote || undefined,
        clientMessageId,
      },
    });
    selectedQuote = null;
    composerResetToken += 1;
  }

  function onLoadMoreHistory(): void {
    if (isLoadingMore || !hasMoreHistory || !oldestTimestamp) {
      return;
    }
    isLoadingMore = true;
    postToHost({ type: "loadMoreHistory", payload: { beforeTimestamp: oldestTimestamp } });
  }

  function onAtBottomChange(atBottom: boolean): void {
    autoScrollEnabled = atBottom;
    showScrollToBottom = !atBottom;
    if (atBottom) {
      reportReadStatus();
    }
  }

  function onSearchRun(keyword: string): void {
    if (!keyword) {
      searchError = "请输入关键词";
      searchResults = [];
      searchMeta = "";
      return;
    }
    searchError = "";
    postToHost({ type: "searchMessages", payload: { keyword, limit: 50 } });
  }

  function onSearchSelect(result: SearchResult): void {
    if (result.targetType === "hot" && parsePositiveInt(result.messageId)) {
      jumpToMessage(Number(result.messageId));
      return;
    }
    if (result.targetType === "archive" && parsePositiveInt(result.archiveId)) {
      jumpToArchivedMessage(Number(result.archiveId));
    }
  }
</script>

<StatusBar
  {connected}
  {presenceText}
  {readText}
  {sendError}
  on:toggleSearch={() => (searchVisible = !searchVisible)}
  on:openSettings={() => {
    settingsVisible = true;
    postToHost({ type: "getConfig" });
  }}
/>

<MessageList
  bind:this={messageListRef}
  {messages}
  {displayMode}
  {serverUrl}
  {hasMoreHistory}
  {isLoadingMore}
  on:loadMore={onLoadMoreHistory}
  on:quote={(event) => onMessageQuote(event.detail.messageId)}
  on:jumpQuote={(event) => jumpToMessage(event.detail.messageId)}
  on:openImage={(event) => postToHost({ type: "openImage", payload: { url: event.detail.url } })}
  on:atBottomChange={(event) => onAtBottomChange(event.detail.atBottom)}
/>

{#if showScrollToBottom}
  <button
    id="scroll-to-bottom"
    title="滚动到底部"
    style="display:flex;"
    on:click={() => {
      messageListRef?.scrollToBottom(true);
      showScrollToBottom = false;
      reportReadStatus();
    }}
  >
    ↓
  </button>
{/if}

<Composer
  {selectedQuote}
  resetToken={composerResetToken}
  disabled={connected === false}
  on:clearQuote={() => (selectedQuote = null)}
  on:composing={(event) => onComposerComposition(event.detail.active)}
  on:send={async (event) => {
    try {
      await sendMessage(event.detail.text, event.detail.pendingAttachments);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSendError(message);
    }
  }}
/>

<SearchPanel
  visible={searchVisible}
  results={searchResults}
  metaText={searchMeta}
  errorText={searchError}
  on:close={() => (searchVisible = false)}
  on:run={(event) => onSearchRun(event.detail.keyword)}
  on:select={(event) => onSearchSelect(event.detail.result)}
/>

<SettingsPanel
  visible={settingsVisible}
  {globalSettings}
  {connections}
  {activeConnection}
  {testBadges}
  on:close={() => (settingsVisible = false)}
  on:saveGlobal={(event) => postToHost({ type: "saveGlobalSettings", payload: event.detail.settings })}
  on:saveConnection={(event) => postToHost({ type: "saveConnection", payload: event.detail })}
  on:deleteConnection={(event) => postToHost({ type: "deleteConnection", payload: event.detail })}
  on:setActiveConnection={(event) => postToHost({ type: "setActiveConnection", payload: event.detail })}
  on:testConnection={(event) => postToHost({ type: "testConnection", payload: event.detail })}
/>
