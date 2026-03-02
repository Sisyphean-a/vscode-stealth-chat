<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { ChatMessage, Connection, GlobalSettings, MessageQuote } from "../types";
  import type { HostMessage } from "../webview-bridge/protocol";
  import {
    dispatchHostMessage,
    formatReadText,
    type HostMessageHandlers,
  } from "./controllers/hostMessageDispatcher";
  import Composer from "./components/layout/Composer.svelte";
  import MessageList from "./components/layout/MessageList.svelte";
  import SearchPanel from "./components/features/SearchPanel.svelte";
  import SettingsPanel from "./components/features/SettingsPanel.svelte";
  import StatusBar from "./components/layout/StatusBar.svelte";
  import { HISTORY_PAGE_SIZE } from "./lib/constants";
  import { normalizeServerUrl } from "./lib/format";
  import { IncomingBatcher } from "./lib/incomingBatcher";
  import { ReadStatusReporter } from "./lib/readStatusReporter";
  import { uploadAll, type PendingAttachment } from "./lib/attachments";
  import { buildClientMessageId } from "../../../packages/chat-core/index.js";
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

  let autoScrollEnabled = true;
  let showScrollToBottom = false;
  let isComposing = false;
  let pendingIncoming: ChatMessage[] = [];

  let selectedQuote: MessageQuote | null = null;
  let composerResetToken = 0;
  let composerRef: Composer | undefined;
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
  const readReporter = new ReadStatusReporter((payload) => {
    postToHost({ type: "markRead", payload });
  });
  const incomingBatcher = new IncomingBatcher((batch) => {
    void applyIncomingBatch(batch);
  });

  $: document.body.dataset.displayMode = displayMode;
  $: oldestTimestamp = messages.length > 0 ? messages[0].timestamp : null;

  onMount(() => {
    const dispose = listenHostMessages(handleHostMessage);
    postToHost({ type: "ready" });
    return () => {
      dispose();
      clearRuntimeTimers();
      incomingBatcher.dispose();
      readReporter.dispose();
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

  const hostHandlers: HostMessageHandlers = {
    onAddMessage: (message) => enqueueIncoming(message),
    onLoadHistory: (payload) => {
      void loadHistory(payload);
    },
    onPrependHistory: ({ messages: payload, hasMore }) => {
      void prependHistory(payload, hasMore);
    },
    onAroundLoaded: (payload) => {
      void applyAroundMessages(payload.messages, payload.targetMessageId, false, payload.error);
    },
    onAroundArchivedLoaded: (payload) => {
      void applyAroundMessages(payload.messages, payload.targetArchiveId, true, payload.error);
    },
    onUpdateStatus: (nextConnected) => {
      connected = nextConnected;
      if (!connected) {
        presenceText = "";
      }
    },
    onPresenceUpdate: (payload) => {
      presenceText = `在线 ${payload.total} (M:${payload.mobile})`;
    },
    onReadReceipt: (payload) => {
      if (payload.clientType !== "mobile") {
        return;
      }
      readText = formatReadText(payload.lastReadTimestamp);
    },
    onSendFailed: (error) => {
      setSendError(error);
    },
    onSearchResults: (payload) => {
      searchError = payload.error || "";
      searchResults = payload.results || [];
      searchMeta = payload.keyword ? `关键词 "${payload.keyword}"，共 ${searchResults.length} 条` : "";
    },
    onRuntimeConfig: (payload) => {
      displayMode = payload.mode;
      serverUrl = normalizeServerUrl(payload.serverUrl || DEFAULT_SETTINGS.serverUrl);
      authToken = payload.token || "";
    },
    onClearMessages: () => {
      resetAllMessages();
    },
    onConfigLoaded: (payload) => {
      globalSettings = payload.globalSettings || DEFAULT_SETTINGS;
      connections = Array.isArray(payload.connections) ? payload.connections : [];
      activeConnection = payload.activeConnection || "";
    },
    onOperationResult: (payload) => {
      if (payload.success) {
        postToHost({ type: "getConfig" });
        return;
      }
      setSendError(payload.message);
    },
    onTestResult: (payload) => {
      setTestBadge(payload.name, payload.success, payload.latency);
    },
  };

  function handleHostMessage(message: HostMessage): void {
    dispatchHostMessage(message, hostHandlers);
  }

  function enqueueIncoming(message: ChatMessage): void {
    if (isComposing) {
      pendingIncoming = [...pendingIncoming, message];
      return;
    }
    incomingBatcher.enqueue(message);
  }

  function scrollToBottomStable(): void {
    messageListRef?.scrollToBottom(true);
    window.requestAnimationFrame(() => {
      messageListRef?.scrollToBottom(true);
    });
  }

  async function applyIncomingBatch(batch: ChatMessage[]): Promise<void> {
    if (batch.length === 0) {
      return;
    }
    const oldLength = messages.length;
    const merged = mergeMessageStore(messages, batch);
    if (merged.length === oldLength) {
      return;
    }

    let newestIncoming = batch[0];
    for (const message of batch.slice(1)) {
      if (compareMessages(message, newestIncoming) > 0) {
        newestIncoming = message;
      }
    }

    const isLatest = compareMessages(newestIncoming, merged[merged.length - 1]) >= 0;
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
    incomingBatcher.clear();
    pendingIncoming = [];
    hasMoreHistory = true;
    isLoadingMore = false;
    isFirstLoad = true;
    readReporter.reset();
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
    if (!Number.isFinite(last.timestamp)) {
      return;
    }
    readReporter.report(last.timestamp, last.id);
  }

  function onComposerComposition(active: boolean): void {
    isComposing = active;
    if (!active) {
      const queue = [...pendingIncoming];
      pendingIncoming = [];
      for (const message of queue) {
        incomingBatcher.enqueue(message);
      }
    }
  }

  function onMessageQuote(messageId: number): void {
    const target = messages.find((item) => parsePositiveInt(item.id) === messageId);
    if (!target) {
      setSendError(`无法找到消息 #${messageId}`);
      return;
    }
    selectedQuote = makeQuoteFromMessage(target);
    composerRef?.focusInput();
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
    let attachments: Awaited<ReturnType<typeof uploadAll>> = [];
    if (pendingAttachments.length > 0) {
      if (!serverUrl) {
        throw new Error("Image upload failed: missing server URL");
      }
      if (!authToken) {
        throw new Error("Image upload failed: missing auth token");
      }
      attachments = await uploadAll(serverUrl, authToken, pendingAttachments);
    }
    const clientMessageId = buildClientMessageId("vscode");
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

  function setTestBadge(name: string, success: boolean, latency?: number): void {
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
  bind:this={composerRef}
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
