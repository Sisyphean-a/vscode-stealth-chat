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
  <span id="status-indicator" class={statusClass}></span>
  <span id="status-text">{statusText}</span>
  <span id="presence-text" class="status-meta">{presenceText}</span>
  <span id="read-text" class="status-meta">{readText}</span>
  <button id="search-btn" title="搜索" on:click={() => dispatch("toggleSearch")}>搜索</button>
  <button id="settings-btn" title="设置" on:click={() => dispatch("openSettings")}>设置</button>
</div>
