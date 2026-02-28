import { ChatMessage } from "../types";
import {
  buildMessageKey,
  mergeMessages,
  normalizeIncomingMessages,
  parsePositiveInt,
} from "../../../packages/chat-core/index.js";

export type MessageCursor = {
  timestamp: number;
  id: number;
};

type ConversationState = {
  connectionName: string;
  appId: string | null;
  messages: ChatMessage[];
  unread: number;
  cursor: MessageCursor;
};

const MAX_MESSAGES_PER_CONVERSATION = 200;

const conversations = new Map<string, ConversationState>();
let activeConversationName = "";

function createDefaultCursor(): MessageCursor {
  return { timestamp: 0, id: 0 };
}

function cloneCursor(cursor: MessageCursor): MessageCursor {
  return { timestamp: cursor.timestamp, id: cursor.id };
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) {
    return messages;
  }
  return messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
}

function createConversation(connectionName: string): ConversationState {
  return {
    connectionName,
    appId: null,
    messages: [],
    unread: 0,
    cursor: createDefaultCursor(),
  };
}

function ensureConversation(connectionName: string): ConversationState {
  const key = connectionName.trim();
  if (!conversations.has(key)) {
    conversations.set(key, createConversation(key));
  }
  return conversations.get(key)!;
}

function normalizeCursor(cursor: Partial<MessageCursor> | undefined): MessageCursor {
  const timestamp = Number.parseInt(String(cursor?.timestamp ?? ""), 10);
  const id = Number.parseInt(String(cursor?.id ?? ""), 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(id) || id <= 0) {
    return createDefaultCursor();
  }
  return { timestamp, id };
}

function updateCursorByTail(state: ConversationState): void {
  const last = state.messages[state.messages.length - 1];
  if (!last) {
    return;
  }
  const id = parsePositiveInt(last.id);
  if (!id) {
    return;
  }
  const timestamp = Number.parseInt(String(last.timestamp ?? ""), 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return;
  }
  state.cursor = { timestamp, id };
}

function countAddedMessages(existing: ChatMessage[], incoming: ChatMessage[]): number {
  const seen = new Set(existing.map((message) => buildMessageKey(message)));
  let added = 0;
  for (const message of incoming) {
    const key = buildMessageKey(message);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    added += 1;
  }
  return added;
}

function mergeIntoConversation(state: ConversationState, incoming: unknown): number {
  const normalized = normalizeIncomingMessages<ChatMessage>(incoming);
  if (normalized.length === 0) {
    return 0;
  }

  const added = countAddedMessages(state.messages, normalized);
  if (added <= 0) {
    return 0;
  }
  state.messages = trimMessages(mergeMessages(state.messages, normalized));
  updateCursorByTail(state);
  return added;
}

export function syncConnections(connectionNames: string[]): void {
  const next = new Set(connectionNames.map((name) => name.trim()).filter(Boolean));

  for (const name of next) {
    ensureConversation(name);
  }
  for (const key of conversations.keys()) {
    if (!next.has(key)) {
      conversations.delete(key);
    }
  }

  if (!next.has(activeConversationName)) {
    activeConversationName = connectionNames[0] || "";
  }
}

export function setActiveConversation(connectionName: string): void {
  const safeName = connectionName.trim();
  if (!safeName) {
    return;
  }
  ensureConversation(safeName);
  activeConversationName = safeName;
}

export function getActiveConversationName(): string {
  return activeConversationName;
}

export function assignAppId(connectionName: string, appId: string): void {
  const state = ensureConversation(connectionName);
  state.appId = appId.trim() || null;
}

export function getConnectionNames(): string[] {
  return Array.from(conversations.keys());
}

export function getConnectionByAppId(appId: string): string | null {
  const safeAppId = appId.trim();
  for (const [name, state] of conversations.entries()) {
    if (state.appId === safeAppId) {
      return name;
    }
  }
  return null;
}

export function getMessages(connectionName: string): readonly ChatMessage[] {
  return [...ensureConversation(connectionName).messages];
}

export function getActiveMessages(): readonly ChatMessage[] {
  if (!activeConversationName) {
    return [];
  }
  return getMessages(activeConversationName);
}

export function replaceHistory(connectionName: string, incoming: unknown): ChatMessage[] {
  const state = ensureConversation(connectionName);
  state.messages = [];
  mergeIntoConversation(state, incoming);
  return state.messages;
}

export function mergeMessagesForConnection(connectionName: string, incoming: unknown): number {
  const state = ensureConversation(connectionName);
  return mergeIntoConversation(state, incoming);
}

export function clearUnread(connectionName: string): void {
  ensureConversation(connectionName).unread = 0;
}

export function incrementUnread(connectionName: string, increment = 1): void {
  if (increment <= 0) {
    return;
  }
  const state = ensureConversation(connectionName);
  state.unread += increment;
}

export function getUnread(connectionName: string): number {
  return ensureConversation(connectionName).unread;
}

export function getTotalUnread(): number {
  let total = 0;
  for (const state of conversations.values()) {
    total += state.unread;
  }
  return total;
}

export function getCursor(connectionName: string): MessageCursor {
  return cloneCursor(ensureConversation(connectionName).cursor);
}

export function setCursor(connectionName: string, cursor: Partial<MessageCursor>): void {
  const state = ensureConversation(connectionName);
  state.cursor = normalizeCursor(cursor);
}

export function loadPersistedCursors(cursors: Record<string, Partial<MessageCursor>>): void {
  for (const [connectionName, cursor] of Object.entries(cursors || {})) {
    if (!connectionName.trim()) {
      continue;
    }
    setCursor(connectionName, cursor);
  }
}

export function exportCursors(): Record<string, MessageCursor> {
  const exported: Record<string, MessageCursor> = {};
  for (const [connectionName, state] of conversations.entries()) {
    exported[connectionName] = cloneCursor(state.cursor);
  }
  return exported;
}
