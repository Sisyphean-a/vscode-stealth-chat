<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import type { SearchResult } from "../lib/messageStore";
  import { formatShortTime } from "../lib/format";

  export let visible = false;
  export let results: SearchResult[] = [];
  export let metaText = "";
  export let errorText = "";

  const dispatch = createEventDispatcher<{
    close: void;
    run: { keyword: string };
    select: { result: SearchResult };
  }>();

  let keyword = "";
  let inputEl: HTMLInputElement | null = null;

  $: if (visible) {
    void tick().then(() => {
      inputEl?.focus();
    });
  }

  function runSearch(): void {
    dispatch("run", { keyword: keyword.trim() });
  }
</script>

<div id="search-panel" class={visible ? "" : "hidden"}>
  <div class="search-header">
    <input
      id="search-input"
      type="text"
      placeholder="搜索历史消息..."
      bind:value={keyword}
      bind:this={inputEl}
      on:keydown={(event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        runSearch();
      }}
    />
    <button id="search-run-btn" class="btn btn-primary" on:click={runSearch}>搜索</button>
    <button id="search-close-btn" class="btn btn-secondary" on:click={() => dispatch("close")}>
      关闭
    </button>
  </div>

  <div id="search-result-meta">{errorText || metaText}</div>
  <div id="search-results">
    {#each results as item}
      <div class="search-item" on:click={() => dispatch("select", { result: item })}>
        <div>{item.preview || "(空消息)"}</div>
        <div class="search-item-meta">
          {item.targetType === "archive" ? "归档" : "热库"} · {item.source} · {formatShortTime(item.timestamp)}
        </div>
      </div>
    {/each}
  </div>
</div>
