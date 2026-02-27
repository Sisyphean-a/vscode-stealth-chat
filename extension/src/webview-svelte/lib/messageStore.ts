import type { ChatMessage, MessageQuote } from "../../types";
import { QUOTE_SNIPPET_MAX_LENGTH, TIME_GAP_THRESHOLD_MS } from "./constants";
import { formatDateLabel, formatShortTime } from "./format";

export type DisplayMode = "bubble" | "log";

export type SearchResult = {
  targetType: "hot" | "archive";
  messageId: number | null;
  archiveId: number | null;
  source: "mobile" | "vscode";
  timestamp: number;
  preview: string;
};

export type RenderItem =
  | { kind: "divider"; key: string; label: string; log: boolean; gap: boolean }
  | { kind: "message"; key: string; message: ChatMessage };

export function parsePositiveInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildMessageKey(msg: Partial<ChatMessage>): string {
  const messageId = parsePositiveInt(msg.id);
  if (messageId) {
    return `id:${messageId}`;
  }
  const source = typeof msg.source === "string" ? msg.source : "unknown";
  const text = typeof msg.text === "string" ? msg.text : "";
  const timestamp = Number.isFinite(msg.timestamp) ? msg.timestamp : 0;
  return `ts:${timestamp}-src:${source}-txt:${text}`;
}

export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  if (a.timestamp === b.timestamp) {
    const aId = parsePositiveInt(a.id) || 0;
    const bId = parsePositiveInt(b.id) || 0;
    return aId - bId;
  }
  return a.timestamp - b.timestamp;
}

export function normalizeIncomingMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .filter((msg) => {
      return typeof msg === "object" && msg !== null && Number.isFinite((msg as ChatMessage).timestamp);
    })
    .map((msg) => {
      const typed = msg as ChatMessage;
      return {
        ...typed,
        text: typeof typed.text === "string" ? typed.text : "",
      };
    })
    .sort(compareMessages);
}

export function mergeMessageStore(store: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const index = new Map<string, ChatMessage>();
  for (const message of store) {
    index.set(buildMessageKey(message), message);
  }
  for (const message of incoming) {
    index.set(buildMessageKey(message), message);
  }
  return Array.from(index.values()).sort(compareMessages);
}

export function buildQuoteSnippet(message: ChatMessage): string {
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const raw = hasAttachments ? `[图片] ${text}`.trim() : text;
  if (!raw) {
    return "(空消息)";
  }
  if (raw.length <= QUOTE_SNIPPET_MAX_LENGTH) {
    return raw;
  }
  return `${raw.slice(0, QUOTE_SNIPPET_MAX_LENGTH - 3)}...`;
}

export function makeQuoteFromMessage(message: ChatMessage): MessageQuote | null {
  const messageId = parsePositiveInt(message.id);
  if (!messageId) {
    return null;
  }
  return {
    messageId,
    textSnippet: buildQuoteSnippet(message),
    source: message.source,
    timestamp: message.timestamp,
  };
}

export function resolveAttachmentUrl(url: string | undefined, serverUrl: string): string {
  if (!url) {
    return "";
  }
  if (url.startsWith("/uploads/")) {
    return `${serverUrl}${url}`;
  }
  return url;
}

export function buildRenderItems(messages: ChatMessage[], displayMode: DisplayMode): RenderItem[] {
  const items: RenderItem[] = [];
  let lastTimestamp = 0;

  for (const message of messages) {
    const messageTime = Number.isFinite(message.timestamp) ? message.timestamp : 0;
    if (messageTime > 0) {
      const lastDate = lastTimestamp > 0 ? new Date(lastTimestamp).toLocaleDateString() : "";
      const currentDate = new Date(messageTime).toLocaleDateString();
      if (currentDate !== lastDate) {
        const label = displayMode === "log"
          ? `══ ${formatDateLabel(messageTime)} ══`
          : formatDateLabel(messageTime);
        items.push({
          kind: "divider",
          key: `date:${messageTime}:${currentDate}`,
          label,
          log: displayMode === "log",
          gap: false,
        });
      } else if (lastTimestamp > 0 && messageTime - lastTimestamp > TIME_GAP_THRESHOLD_MS) {
        const label = displayMode === "log"
          ? `-- ${formatShortTime(messageTime)} --`
          : formatShortTime(messageTime);
        items.push({
          kind: "divider",
          key: `gap:${messageTime}`,
          label,
          log: displayMode === "log",
          gap: true,
        });
      }
      lastTimestamp = messageTime;
    }

    items.push({
      kind: "message",
      key: `msg:${buildMessageKey(message)}`,
      message,
    });
  }
  return items;
}
