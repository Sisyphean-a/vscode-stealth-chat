export const ACK_TIMEOUT_MS = 4000;
export const MAX_SEND_RETRIES = 3;
export const RETRY_DELAY_MS = 1200;

export const HISTORY_PAGE_SIZE = 50;
export const SEARCH_RESULT_LIMIT = 50;
export const DEFAULT_AROUND_WINDOW_SIZE = 25;
export const MAX_AROUND_WINDOW_SIZE = 100;
export const QUOTE_SNIPPET_MAX_LENGTH = 120;

export const DEFAULT_EMOJI_SET = Object.freeze([
  "🙂",
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😉",
  "😍",
  "😘",
  "😗",
  "😙",
  "😚",
  "😋",
  "😜",
  "🤪",
  "🤨",
  "🧐",
  "🤓",
  "😎",
  "🥳",
  "😤",
  "😢",
  "😭",
  "😡",
  "🤯",
  "😱",
  "😴",
  "🤢",
  "🤮",
  "🥺",
  "😇",
  "🤔",
]);

export function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildClientMessageId(prefix, provided) {
  if (typeof provided === "string" && provided.trim().length > 0) {
    return provided.trim();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function buildMessageKey(message) {
  const messageId = parsePositiveInt(message?.id);
  if (messageId) {
    return `id:${messageId}`;
  }

  const source = typeof message?.source === "string" ? message.source : "unknown";
  const text = typeof message?.text === "string" ? message.text : "";
  const timestamp = Number.isFinite(message?.timestamp) ? Number(message.timestamp) : 0;
  return `ts:${timestamp}-src:${source}-txt:${text}`;
}

export function compareMessages(a, b) {
  const aTimestamp = Number.isFinite(a?.timestamp) ? Number(a.timestamp) : 0;
  const bTimestamp = Number.isFinite(b?.timestamp) ? Number(b.timestamp) : 0;
  if (aTimestamp === bTimestamp) {
    const aId = parsePositiveInt(a?.id) || 0;
    const bId = parsePositiveInt(b?.id) || 0;
    return aId - bId;
  }
  return aTimestamp - bTimestamp;
}

export function normalizeIncomingMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .filter((message) => {
      return typeof message === "object" && message !== null && Number.isFinite(message.timestamp);
    })
    .map((message) => ({
      ...message,
      text: typeof message.text === "string" ? message.text : "",
    }))
    .sort(compareMessages);
}

export function mergeMessages(existing, incoming) {
  const index = new Map();
  for (const message of existing || []) {
    index.set(buildMessageKey(message), message);
  }
  for (const message of incoming || []) {
    index.set(buildMessageKey(message), message);
  }
  return Array.from(index.values()).sort(compareMessages);
}

export function buildQuoteSnippet(message, maxLength = QUOTE_SNIPPET_MAX_LENGTH) {
  const hasAttachments = Array.isArray(message?.attachments) && message.attachments.length > 0;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const raw = hasAttachments ? `[图片] ${text}`.trim() : text;
  if (!raw) {
    return "(空消息)";
  }
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength - 3)}...`;
}
