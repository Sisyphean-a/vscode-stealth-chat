import type { ChatMessage, MessageQuote } from "../../types";
import {
  buildMessageKey,
  buildQuoteSnippet as buildQuoteSnippetCore,
  compareMessages,
  mergeMessages,
  normalizeIncomingMessages as normalizeIncomingMessagesCore,
  parsePositiveInt,
} from "../../../../packages/chat-core/index.js";
import { TIME_GAP_THRESHOLD_MS } from "./constants";
import { formatDateLabel, formatShortTime } from "./format";

export type DisplayMode = "bubble" | "log";
export type DeliveryState = "sending" | "failed";
export type DeliveryStateMap = Record<string, DeliveryState>;

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
export { buildMessageKey, compareMessages, parsePositiveInt };

export function normalizeClientMessageId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeIncomingMessages(messages: unknown): ChatMessage[] {
  return normalizeIncomingMessagesCore<ChatMessage>(messages);
}

export function mergeMessageStore(store: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  return mergeMessages(store, incoming);
}

function buildClientMessageIndex(messages: readonly ChatMessage[]): Map<string, number> {
  const index = new Map<string, number>();
  messages.forEach((message, i) => {
    const clientMessageId = normalizeClientMessageId(message.clientMessageId);
    if (clientMessageId) {
      index.set(clientMessageId, i);
    }
  });
  return index;
}

function clearResolvedStates(stateMap: DeliveryStateMap, ids: readonly string[]): DeliveryStateMap {
  if (ids.length === 0) {
    return stateMap;
  }
  const next = { ...stateMap };
  for (const id of ids) {
    delete next[id];
  }
  return next;
}

export function reconcileIncomingMessages(
  store: ChatMessage[],
  incoming: ChatMessage[],
  stateMap: DeliveryStateMap
): { messages: ChatMessage[]; deliveryStateMap: DeliveryStateMap } {
  if (incoming.length === 0) {
    return { messages: store, deliveryStateMap: stateMap };
  }
  const nextStore = [...store];
  const incomingRest: ChatMessage[] = [];
  const resolvedClientMessageIds: string[] = [];
  const clientIndex = buildClientMessageIndex(nextStore);

  for (const message of incoming) {
    const clientMessageId = normalizeClientMessageId(message.clientMessageId);
    const existingIndex = clientMessageId ? clientIndex.get(clientMessageId) : undefined;
    if (existingIndex === undefined) {
      incomingRest.push(message);
      continue;
    }
    nextStore[existingIndex] = message;
    resolvedClientMessageIds.push(clientMessageId);
  }

  return {
    messages: mergeMessages(nextStore, incomingRest),
    deliveryStateMap: clearResolvedStates(stateMap, resolvedClientMessageIds),
  };
}

export function buildQuoteSnippet(message: ChatMessage): string {
  return buildQuoteSnippetCore(message);
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
