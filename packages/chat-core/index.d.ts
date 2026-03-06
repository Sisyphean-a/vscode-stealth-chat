export const ACK_TIMEOUT_MS: number;
export const MAX_SEND_RETRIES: number;
export const RETRY_DELAY_MS: number;

export const HISTORY_PAGE_SIZE: number;
export const SEARCH_RESULT_LIMIT: number;
export const DEFAULT_AROUND_WINDOW_SIZE: number;
export const MAX_AROUND_WINDOW_SIZE: number;
export const QUOTE_SNIPPET_MAX_LENGTH: number;
export const IMAGE_UPLOAD_COMPRESSION_SIZE_THRESHOLD: number;
export const IMAGE_UPLOAD_TARGET_MAX_DIMENSION: number;
export const IMAGE_UPLOAD_TARGET_QUALITY: number;
export const IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT: number;
export const DEFAULT_EMOJI_SET: readonly string[];

export type MessageLike = {
  id?: unknown;
  clientMessageId?: unknown;
  source?: unknown;
  text?: unknown;
  timestamp?: unknown;
  attachments?: unknown;
};

export function parsePositiveInt(value: unknown): number | null;
export function buildClientMessageId(prefix: string, provided?: string): string;
export function buildMessageKey<T extends MessageLike>(message: T): string;
export function compareMessages<T extends MessageLike>(a: T, b: T): number;
export function normalizeIncomingMessages<T extends MessageLike = MessageLike>(messages: unknown): T[];
export function mergeMessages<T extends MessageLike>(existing: readonly T[], incoming: readonly T[]): T[];
export function buildQuoteSnippet(message: MessageLike, maxLength?: number): string;
export function derivePeerReadState(options: {
  messages?: readonly MessageLike[];
  ownSource?: unknown;
  receipt?: {
    lastReadTimestamp?: unknown;
    lastReadMessageId?: unknown;
  } | null;
}): {
  summaryKind: "none" | "summaryOnly" | "earlier" | "latest";
  anchorMessageId: number | null;
  timestamp: number | null;
};
export function shouldIncrementUnreadCount(options: {
  messageSource?: unknown;
  isActiveConversation?: boolean;
  isViewVisible?: boolean;
}): boolean;
export function shouldApplyReadReceiptToUnread(options: {
  clientType?: unknown;
}): boolean;
export function shouldCompressBeforeUpload(options: {
  mimeType?: unknown;
  size?: unknown;
}): boolean;
export function buildImageUploadPlan(options: {
  mimeType?: unknown;
  size?: unknown;
}): {
  shouldCompress: boolean;
  outputMimeType: string;
  targetMaxDimension: number;
  targetQuality: number;
  outputSizeLimit: number;
};
