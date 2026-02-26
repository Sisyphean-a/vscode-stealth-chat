/**
 * 消息缓存服务
 * 管理消息缓存、去重和历史合并
 */
import { ChatMessage } from "../types";

const CACHE_MAX_SIZE = 200;
let cachedMessages: ChatMessage[] = [];
const processedMessageKeys = new Set<string>();

/**
 * 简单字符串哈希（用于去重，非加密用途）
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * 生成消息唯一键（用于去重）
 */
export function getMessageKey(msg: ChatMessage): string {
  if (typeof msg.id === "number" && Number.isFinite(msg.id) && msg.id > 0) {
    return `id:${msg.id}`;
  }
  const textHash = simpleHash(msg.text || "");
  const attachmentKey = msg.attachments?.length ? `-att${msg.attachments.length}` : "";
  return `${msg.timestamp}-${msg.source}-${textHash}${attachmentKey}`;
}

/**
 * 检查消息是否已处理（去重）
 */
export function isMessageDuplicate(msg: ChatMessage): boolean {
  return processedMessageKeys.has(getMessageKey(msg));
}

/**
 * 添加消息到缓存（带去重和大小限制）
 */
export function addToCache(msg: ChatMessage): boolean {
  const key = getMessageKey(msg);
  if (processedMessageKeys.has(key)) {
    return false;
  }
  processedMessageKeys.add(key);

  cachedMessages.push(msg);
  while (cachedMessages.length > CACHE_MAX_SIZE) {
    const removed = cachedMessages.shift();
    if (removed) {
      processedMessageKeys.delete(getMessageKey(removed));
    }
  }
  return true;
}

/**
 * 合并历史消息（保留本地未同步消息）
 */
export function mergeHistory(history: ChatMessage[]): void {
  const localMaxTimestamp =
    cachedMessages.length > 0
      ? Math.max(...cachedMessages.map((m) => m.timestamp))
      : 0;

  const localNewerMessages = cachedMessages.filter(
    (m) => m.timestamp > localMaxTimestamp - 1000
  );

  processedMessageKeys.clear();

  const merged: ChatMessage[] = [];
  for (const msg of history) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      processedMessageKeys.add(key);
      merged.push(msg);
    }
  }

  for (const msg of localNewerMessages) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      processedMessageKeys.add(key);
      merged.push(msg);
    }
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);
  cachedMessages = merged.slice(-CACHE_MAX_SIZE);
}

/**
 * 清空缓存
 */
export function clearCache(): void {
  cachedMessages = [];
  processedMessageKeys.clear();
}

/**
 * 在缓存前面添加历史消息（用于加载更多）
 */
export function prependHistory(messages: ChatMessage[]): void {
  const newMessages: ChatMessage[] = [];
  for (const msg of messages) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      processedMessageKeys.add(key);
      newMessages.push(msg);
    }
  }
  newMessages.sort((a, b) => a.timestamp - b.timestamp);
  cachedMessages.unshift(...newMessages);

  while (cachedMessages.length > CACHE_MAX_SIZE) {
    const removed = cachedMessages.shift();
    if (removed) {
      processedMessageKeys.delete(getMessageKey(removed));
    }
  }
}

/**
 * 合并消息集合（用于上下文加载等场景）
 */
export function mergeMessages(messages: ChatMessage[]): void {
  const merged = [...cachedMessages];
  for (const msg of messages) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      merged.push(msg);
    }
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);
  cachedMessages = merged.slice(-CACHE_MAX_SIZE);

  processedMessageKeys.clear();
  for (const msg of cachedMessages) {
    processedMessageKeys.add(getMessageKey(msg));
  }
}

/**
 * 获取最早消息的时间戳
 */
export function getOldestTimestamp(): number | null {
  if (cachedMessages.length === 0) return null;
  return cachedMessages[0].timestamp;
}

/**
 * 获取缓存的消息
 */
export function getCachedMessages(): ChatMessage[] {
  return cachedMessages;
}
