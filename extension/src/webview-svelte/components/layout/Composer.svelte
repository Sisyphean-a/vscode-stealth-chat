<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MessageQuote } from "../../../types";
  import { MAX_IMAGE_SIZE } from "../../lib/constants";
  import { readFileAsDataUrl, type PendingAttachment } from "../../lib/attachments";

export let selectedQuote: MessageQuote | null = null;
export let disabled = false;
export let resetToken = 0;

  const dispatch = createEventDispatcher<{
    send: { text: string; pendingAttachments: PendingAttachment[] };
    clearQuote: void;
    composing: { active: boolean };
  }>();

let inputValue = "";
let inputEl: HTMLTextAreaElement | null = null;
let pendingAttachments: PendingAttachment[] = [];
let lastResetToken = 0;

$: quoteVisible = !!selectedQuote;
$: if (resetToken !== lastResetToken) {
  lastResetToken = resetToken;
  clearInput();
}

  function autoGrow(): void {
    if (!inputEl) {
      return;
    }
    inputEl.style.height = "auto";
    inputEl.style.height = `${inputEl.scrollHeight}px`;
  }

  async function handleImageFile(file: File): Promise<void> {
    if (file.size > MAX_IMAGE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      throw new Error(`Image too large: ${sizeMB}MB`);
    }
    const data = await readFileAsDataUrl(file);
    pendingAttachments = [
      ...pendingAttachments,
      { data, filename: file.name || "image.png", size: file.size },
    ];
  }

  async function onPaste(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    for (const item of items) {
      if (!item.type.startsWith("image/")) {
        continue;
      }
      event.preventDefault();
      const file = item.getAsFile();
      if (file) {
        try {
          await handleImageFile(file);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[WebView] Failed to add image:", message);
          alert(`添加图片失败：${message}`);
        }
      }
      break;
    }
  }

  function removeAttachment(index: number): void {
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
  }

  function clearInput(): void {
    inputValue = "";
    pendingAttachments = [];
    autoGrow();
  }

function triggerSend(): void {
  const text = inputValue.trim();
  if (!text && pendingAttachments.length === 0) {
    return;
  }
  dispatch("send", { text, pendingAttachments: [...pendingAttachments] });
}

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    triggerSend();
  }
</script>

<div id="input-container">
  <div id="composer-quote" class="composer-quote {quoteVisible ? '' : 'hidden'}">
    <span id="composer-quote-text">{selectedQuote?.textSnippet || ""}</span>
    <button
      id="composer-quote-clear"
      type="button"
      title="取消引用"
      on:click={() => dispatch("clearQuote")}
    >
      ×
    </button>
  </div>

  <div id="attachment-preview" style={pendingAttachments.length > 0 ? "display:flex;" : "display:none;"}>
    {#each pendingAttachments as attachment, index}
      <div class="attachment-item">
        <img src={attachment.data} alt={attachment.filename} />
        <button
          type="button"
          class="remove-attachment"
          title="移除"
          on:click={() => removeAttachment(index)}
        >
          ×
        </button>
      </div>
    {/each}
  </div>

  <div id="input-row">
    <textarea
      id="message-input"
      rows="1"
      placeholder="输入消息... (可粘贴图片)"
      bind:value={inputValue}
      bind:this={inputEl}
      on:input={autoGrow}
      on:keydown={onKeydown}
      on:paste={onPaste}
      on:compositionstart={() => dispatch("composing", { active: true })}
      on:compositionend={() => dispatch("composing", { active: false })}
      disabled={disabled}
    ></textarea>
    <button id="send-button" title="发送 (Enter)" on:click={triggerSend} disabled={disabled}>
      <span>发送</span>
    </button>
  </div>
</div>
