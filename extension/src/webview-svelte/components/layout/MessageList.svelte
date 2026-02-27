<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ChatMessage } from "../../../types";
  import {
    buildRenderItems,
    parsePositiveInt,
    type DisplayMode,
    type RenderItem,
  } from "../../lib/messageStore";
  import MessageItem from "../features/MessageItem.svelte";

  export let messages: ChatMessage[] = [];
  export let displayMode: DisplayMode = "bubble";
  export let serverUrl = "";
  export let hasMoreHistory = true;
  export let isLoadingMore = false;

  const dispatch = createEventDispatcher<{
    loadMore: void;
    quote: { messageId: number };
    jumpQuote: { messageId: number };
    openImage: { url: string };
    atBottomChange: { atBottom: boolean };
  }>();

  let containerEl: HTMLElement | null = null;
  let renderItems: RenderItem[] = [];

  $: renderItems = buildRenderItems(messages, displayMode);

  function onScroll(): void {
    if (!containerEl) {
      return;
    }
    const gap = containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight;
    dispatch("atBottomChange", { atBottom: gap < 50 });
  }

  function highlight(el: HTMLElement): void {
    el.classList.remove("message-highlight");
    void el.offsetWidth;
    el.classList.add("message-highlight");
    window.setTimeout(() => {
      el.classList.remove("message-highlight");
    }, 1200);
  }

  function focusByAttribute(name: string, value: number): boolean {
    if (!containerEl) {
      return false;
    }
    const selector = `[data-${name}="${value}"]`;
    const target = containerEl.querySelector(selector) as HTMLElement | null;
    if (!target) {
      return false;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    highlight(target);
    return true;
  }

  export function focusMessage(messageId: number): boolean {
    const safeId = parsePositiveInt(messageId);
    if (!safeId) {
      return false;
    }
    return focusByAttribute("message-id", safeId);
  }

  export function focusArchivedMessage(archiveId: number): boolean {
    const safeId = parsePositiveInt(archiveId);
    if (!safeId) {
      return false;
    }
    return focusByAttribute("archive-id", safeId);
  }

  export function getScrollTop(): number {
    return containerEl?.scrollTop ?? 0;
  }

  export function getScrollHeight(): number {
    return containerEl?.scrollHeight ?? 0;
  }

  export function setScrollTop(next: number): void {
    if (containerEl) {
      containerEl.scrollTop = next;
    }
  }

  export function scrollToBottom(force = false): void {
    if (!containerEl) {
      return;
    }
    if (force) {
      containerEl.scrollTop = containerEl.scrollHeight;
      return;
    }
    const gap = containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight;
    if (gap < 50) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  }
</script>

<div id="messages-container" bind:this={containerEl} on:scroll={onScroll}>
  {#if hasMoreHistory}
    <button
      type="button"
      id="load-more-btn"
      class="load-more-btn {isLoadingMore ? 'loading' : ''}"
      disabled={isLoadingMore}
      on:click={() => dispatch("loadMore")}
    >
      {isLoadingMore ? "加载中..." : "加载更多历史"}
    </button>
  {/if}

  {#if messages.length === 0}
    <div id="empty-state">暂无消息</div>
  {:else}
    {#each renderItems as item (item.key)}
      {#if item.kind === "divider"}
        <div class="time-divider {item.gap ? 'time-gap' : ''}">
          <span>{item.label}</span>
        </div>
      {:else}
        <MessageItem
          message={item.message}
          {displayMode}
          {serverUrl}
          on:quote={(event) => dispatch("quote", event.detail)}
          on:jumpQuote={(event) => dispatch("jumpQuote", event.detail)}
          on:openImage={(event) => dispatch("openImage", event.detail)}
        />
      {/if}
    {/each}
  {/if}
</div>
