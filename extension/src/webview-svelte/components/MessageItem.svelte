<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ChatMessage } from "../../types";
  import { escapeHtml, formatLogTime, formatShortTime, linkifyImages } from "../lib/format";
  import { parsePositiveInt, resolveAttachmentUrl } from "../lib/messageStore";

  export let message: ChatMessage;
  export let displayMode: "bubble" | "log";
  export let serverUrl: string;

  const dispatch = createEventDispatcher<{
    quote: { messageId: number };
    jumpQuote: { messageId: number };
    openImage: { url: string };
  }>();

  $: textHtml = linkifyImages(escapeHtml(message.text || ""));
  $: quoteMessageId = parsePositiveInt(message.quote?.messageId);
  $: messageId = parsePositiveInt(message.id);
  $: archiveId = parsePositiveInt(message.archiveId ?? null);
  $: isOwn = message.source === "vscode";

  function onQuoteActionClick(): void {
    if (!messageId) {
      return;
    }
    dispatch("quote", { messageId });
  }

  function onQuotePreviewClick(): void {
    if (!quoteMessageId) {
      return;
    }
    dispatch("jumpQuote", { messageId: quoteMessageId });
  }

  function onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const link = target.closest(".image-link[data-image-url]") as HTMLElement | null;
    if (!link) {
      return;
    }
    event.preventDefault();
    const url = link.dataset.imageUrl;
    if (url) {
      dispatch("openImage", { url });
    }
  }

  function onImageClick(url: string): void {
    dispatch("openImage", { url });
  }
</script>

<div
  class="message-wrapper {isOwn ? 'own' : 'remote'} {archiveId ? 'archived-message' : ''}"
  data-message-id={messageId ? String(messageId) : undefined}
  data-archive-id={archiveId ? String(archiveId) : undefined}
>
  {#if displayMode === "bubble"}
    <div class="message-time">{formatShortTime(message.timestamp || Date.now())}</div>
    <div class="message-bubble {isOwn ? 'own' : 'remote'}">
      {#if quoteMessageId}
        <div
          class="quote-preview-bubble"
          data-quote-message-id={quoteMessageId}
          role="button"
          tabindex="0"
          on:click={onQuotePreviewClick}
        >
          <span class="quote-text">{message.quote?.textSnippet || "(空消息)"}</span>
        </div>
      {/if}

      {#if message.attachments && message.attachments.length > 0}
        {#each message.attachments as attachment}
          {#if attachment.type === "image"}
            <img
              src={resolveAttachmentUrl(attachment.data || attachment.url, serverUrl)}
              class="message-image"
              alt={attachment.filename || "image"}
              style="max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px;"
              on:click={() => onImageClick(resolveAttachmentUrl(attachment.data || attachment.url, serverUrl))}
            />
          {/if}
        {/each}
      {/if}

      {#if message.text}
        <span on:click={onContentClick}>
          {@html textHtml}
        </span>
      {/if}
    </div>

    {#if messageId}
      <button
        type="button"
        class="quote-action-btn bubble"
        data-quote-action="quote"
        on:click={onQuoteActionClick}
      >
        引用
      </button>
    {/if}
  {:else}
    <div class="message-bubble {isOwn ? 'own' : 'remote'}">
      <div class="log-entry">
        <span class="log-timestamp">[{formatLogTime(message.timestamp || Date.now())}]</span>
        <span class="log-source {isOwn ? 'out' : 'info'}">{isOwn ? "OUT" : "INFO"}</span>
        <div class="log-content" on:click={onContentClick}>
          {#if quoteMessageId}
            <button
              type="button"
              class="quote-preview-log"
              data-quote-message-id={quoteMessageId}
              on:click|stopPropagation={onQuotePreviewClick}
            >
              <span class="quote-text">{message.quote?.textSnippet || "(空消息)"}</span>
            </button>
          {/if}

          <div class="log-body">
            {#if message.attachments && message.attachments.length > 0}
              {#each message.attachments as attachment}
                {#if attachment.type === "image"}
                  {@const resolved = resolveAttachmentUrl(attachment.data || attachment.url, serverUrl)}
                  <span class="img-tag" on:click={() => onImageClick(resolved)}>
                    [IMG:{attachment.filename || "image.png"}]
                    <span class="img-preview-tooltip">
                      <img src={resolved} alt="Preview" />
                    </span>
                  </span>
                {/if}
              {/each}
            {/if}

            {#if message.text}
              <span class="log-text">{@html textHtml}</span>
            {/if}
          </div>
        </div>

        {#if messageId}
          <button
            type="button"
            class="quote-action-btn log"
            data-quote-action="quote"
            on:click|stopPropagation={onQuoteActionClick}
          >
            引用
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
