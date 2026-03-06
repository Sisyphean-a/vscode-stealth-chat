const ACK_TIMEOUT_MS = 4000;
const MAX_SEND_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

const HISTORY_PAGE_SIZE = 50;
const SEARCH_RESULT_LIMIT = 50;
const DEFAULT_AROUND_WINDOW_SIZE = 25;
const MAX_AROUND_WINDOW_SIZE = 100;
const QUOTE_SNIPPET_MAX_LENGTH = 120;
const IMAGE_UPLOAD_COMPRESSION_SIZE_THRESHOLD = 1024 * 1024;
const IMAGE_UPLOAD_TARGET_MAX_DIMENSION = 1920;
const IMAGE_UPLOAD_TARGET_QUALITY = 0.82;
const IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT = 900 * 1024;
const IMAGE_UPLOAD_SERVER_SUPPORTED_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
const DEFAULT_EMOJI_SET = Object.freeze([
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

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildClientMessageId(prefix, provided) {
  if (typeof provided === "string" && provided.trim().length > 0) {
    return provided.trim();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildMessageKey(message) {
  const messageId = parsePositiveInt(message?.id);
  if (messageId) {
    return `id:${messageId}`;
  }
  const clientMessageId = typeof message?.clientMessageId === "string"
    ? message.clientMessageId.trim()
    : "";
  if (clientMessageId) {
    return `cid:${clientMessageId}`;
  }

  const source = typeof message?.source === "string" ? message.source : "unknown";
  const text = typeof message?.text === "string" ? message.text : "";
  const timestamp = Number.isFinite(message?.timestamp) ? Number(message.timestamp) : 0;
  return `ts:${timestamp}-src:${source}-txt:${text}`;
}

function compareMessages(a, b) {
  const aTimestamp = Number.isFinite(a?.timestamp) ? Number(a.timestamp) : 0;
  const bTimestamp = Number.isFinite(b?.timestamp) ? Number(b.timestamp) : 0;
  if (aTimestamp === bTimestamp) {
    const aId = parsePositiveInt(a?.id) || 0;
    const bId = parsePositiveInt(b?.id) || 0;
    return aId - bId;
  }
  return aTimestamp - bTimestamp;
}

function normalizeIncomingMessages(messages) {
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

function mergeMessages(existing, incoming) {
  const index = new Map();
  for (const message of existing || []) {
    index.set(buildMessageKey(message), message);
  }
  for (const message of incoming || []) {
    index.set(buildMessageKey(message), message);
  }
  return Array.from(index.values()).sort(compareMessages);
}

function buildQuoteSnippet(message, maxLength = QUOTE_SNIPPET_MAX_LENGTH) {
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

function shouldIncrementUnreadCount(options) {
  const { messageSource, isActiveConversation, isViewVisible } = options || {};
  return messageSource === "mobile" && (!isActiveConversation || !isViewVisible);
}

function shouldApplyReadReceiptToUnread(options) {
  return options?.clientType === "vscode";
}

function shouldCompressBeforeUpload(image) {
  const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : '';
  const size = Number.isFinite(image?.size) ? Number(image.size) : 0;
  if (!mimeType.startsWith('image/')) {
    return false;
  }
  if (!IMAGE_UPLOAD_SERVER_SUPPORTED_TYPES.includes(mimeType)) {
    return true;
  }
  if (mimeType === 'image/png') {
    return false;
  }
  return size >= IMAGE_UPLOAD_COMPRESSION_SIZE_THRESHOLD;
}

function buildImageUploadPlan(image) {
  const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : 'image/jpeg';
  const shouldCompress = shouldCompressBeforeUpload(image);
  return {
    shouldCompress,
    outputMimeType: shouldCompress ? 'image/jpeg' : mimeType,
    targetMaxDimension: IMAGE_UPLOAD_TARGET_MAX_DIMENSION,
    targetQuality: IMAGE_UPLOAD_TARGET_QUALITY,
    outputSizeLimit: IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT,
  };
}

module.exports = {
  ACK_TIMEOUT_MS,
  MAX_SEND_RETRIES,
  RETRY_DELAY_MS,
  HISTORY_PAGE_SIZE,
  SEARCH_RESULT_LIMIT,
  DEFAULT_AROUND_WINDOW_SIZE,
  MAX_AROUND_WINDOW_SIZE,
  QUOTE_SNIPPET_MAX_LENGTH,
  IMAGE_UPLOAD_COMPRESSION_SIZE_THRESHOLD,
  IMAGE_UPLOAD_TARGET_MAX_DIMENSION,
  IMAGE_UPLOAD_TARGET_QUALITY,
  IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT,
  DEFAULT_EMOJI_SET,
  parsePositiveInt,
  buildClientMessageId,
  buildMessageKey,
  compareMessages,
  normalizeIncomingMessages,
  mergeMessages,
  buildQuoteSnippet,
  shouldIncrementUnreadCount,
  shouldApplyReadReceiptToUnread,
  shouldCompressBeforeUpload,
  buildImageUploadPlan,
};
