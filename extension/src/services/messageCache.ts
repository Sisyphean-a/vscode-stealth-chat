/**
 * 消息缓存服务
 * 管理消息缓存、去重和历史合并
 */
import { ChatMessage } from "../types";

const CACHE_MAX_SIZE = 200;
let cachedMessages: ChatMessage[] = [];
const processedMessageKeys = new Set<string>();

/**
 * 生成消息唯一键（用于去重）
 */
export function getMessageKey(msg: ChatMessage): string {
  const textKey = msg.text?.slice(0, 20) || "";
  return `${msg.timestamp}-${msg.source}-${textKey}`;
}

/**
 * 检查消息是否已处理（去重）
 */
export function isMessageDuplicate(msg: ChatMessage): boolean {
  const key = getMessageKey(msg);
  if (processedMessageKeys.has(key)) {
    return true;
  }
  processedMessageKeys.add(key);
  if (processedMessageKeys.size > CACHE_MAX_SIZE * 2) {
    const keysToDelete = Array.from(processedMessageKeys).slice(0, CACHE_MAX_SIZE);
    keysToDelete.forEach((k) => processedMessageKeys.delete(k));
  }
  return false;
}

/**
 * 添加消息到缓存（带去重和大小限制）
 */
export function addToCache(msg: ChatMessage): boolean {
  if (isMessageDuplicate(msg)) {
    return false;
  }
  cachedMessages.push(msg);
  if (cachedMessages.length > CACHE_MAX_SIZE) {
    cachedMessages = cachedMessages.slice(-CACHE_MAX_SIZE);
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
 * 获取缓存的消息
 */
export function getCachedMessages(): ChatMessage[] {
  return cachedMessages;
}
