<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let connected: boolean | null = null;
  export let presenceText = "";
  export let readText = "";
  export let sendError = "";

  const dispatch = createEventDispatcher<{
    toggleSearch: void;
    openSettings: void;
  }>();

  $: statusClass = connected === null
    ? "status-connecting"
    : connected
      ? "status-connected"
      : "status-disconnected";

  $: statusText = sendError
    ? `发送失败: ${sendError}`
    : connected === null
      ? "连接中..."
      : connected
        ? "已连接"
        : "已断开";
</script>

<div id="status-bar">
  <div class="status-primary">
    <span id="status-indicator" class={statusClass}></span>
    <span id="status-text">{statusText}</span>
  </div>
  <div class="status-secondary">
    {#if presenceText}
      <span id="presence-text" class="status-meta" title={presenceText}>{presenceText}</span>
    {/if}
    {#if readText}
      <span id="read-text" class="status-meta status-meta-read" title={readText}>{readText}</span>
    {/if}
  </div>
  <div class="status-actions">
    <button
      id="search-btn"
      class="status-icon-btn"
      title="搜索"
      aria-label="打开搜索"
      on:click={() => dispatch("toggleSearch")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6"></circle>
        <path d="M16 16L21 21"></path>
      </svg>
    </button>
    <button
      id="settings-btn"
      class="status-icon-btn"
      title="设置"
      aria-label="打开设置"
      on:click={() => dispatch("openSettings")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5"></circle>
        <path d="M12 2.5V5"></path>
        <path d="M12 19V21.5"></path>
        <path d="M2.5 12H5"></path>
        <path d="M19 12H21.5"></path>
        <path d="M5.3 5.3L7.1 7.1"></path>
        <path d="M16.9 16.9L18.7 18.7"></path>
        <path d="M5.3 18.7L7.1 16.9"></path>
        <path d="M16.9 7.1L18.7 5.3"></path>
      </svg>
    </button>
  </div>
</div>
