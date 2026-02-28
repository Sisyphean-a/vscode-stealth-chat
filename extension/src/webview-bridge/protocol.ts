import type {
  Attachment,
  ChatMessage,
  Connection,
  GlobalSettings,
  MessageQuote,
} from "../types";
import {
  KNOWN_HOST_TYPES,
  KNOWN_WEBVIEW_TYPES,
  isMessageEnvelope,
} from "../../../packages/protocol/host-webview.js";
const WEBVIEW_MESSAGE_TYPES = new Set(KNOWN_WEBVIEW_TYPES);
const HOST_MESSAGE_TYPES = new Set(KNOWN_HOST_TYPES);
type WebviewMessageType = (typeof KNOWN_WEBVIEW_TYPES)[number];
type HostMessageType = (typeof KNOWN_HOST_TYPES)[number];

export type WebviewMessage =
  | { type: "ready" }
  | {
      type: "sendMessage";
      payload: {
        text: string;
        attachments?: Attachment[];
        quote?: MessageQuote;
        clientMessageId?: string;
      };
    }
  | { type: "loadMoreHistory"; payload: { beforeTimestamp: number } }
  | { type: "loadAroundMessage"; payload: { targetMessageId: number } }
  | { type: "loadAroundArchivedMessage"; payload: { targetArchiveId: number } }
  | { type: "searchMessages"; payload: { keyword: string; limit?: number } }
  | { type: "markRead"; payload: { lastReadTimestamp: number; lastReadMessageId?: number } }
  | { type: "openImage"; payload: { url: string } }
  | { type: "getConfig" }
  | { type: "saveGlobalSettings"; payload: GlobalSettings }
  | { type: "saveConnection"; payload: { connection: Connection; originalName?: string } }
  | { type: "deleteConnection"; payload: { name: string } }
  | { type: "setActiveConnection"; payload: { name: string } }
  | { type: "testConnection"; payload: { name: string; serverUrl: string; token: string } };

export type HostMessage =
  | { type: "addMessage"; payload: ChatMessage }
  | { type: "loadHistory"; payload: ChatMessage[] }
  | { type: "prependHistory"; payload: { messages: ChatMessage[]; hasMore: boolean } }
  | {
      type: "aroundMessagesLoaded";
      payload: {
        messages: ChatMessage[];
        targetMessageId: number | null;
        error?: string | null;
      };
    }
  | {
      type: "aroundArchivedMessagesLoaded";
      payload: {
        messages: ChatMessage[];
        targetArchiveId: number | null;
        error?: string | null;
      };
    }
  | { type: "updateStatus"; payload: { connected: boolean } }
  | { type: "presenceUpdate"; payload: { appId: string; total: number; mobile: number; vscode: number } }
  | {
      type: "readReceipt";
      payload: {
        appId: string;
        clientType: "mobile" | "vscode" | "unknown";
        lastReadTimestamp: number;
        lastReadMessageId: number | null;
      };
    }
  | { type: "sendFailed"; payload: { clientMessageId: string | null; error: string } }
  | {
      type: "searchResults";
      payload: {
        keyword: string;
        results: Array<{
          targetType: "hot" | "archive";
          messageId: number | null;
          archiveId: number | null;
          source: "mobile" | "vscode";
          timestamp: number;
          preview: string;
        }>;
        error: string | null;
      };
    }
  | { type: "setDisplayMode"; payload: { mode: "bubble" | "log"; serverUrl: string; token: string } }
  | { type: "clearMessages" }
  | {
      type: "configLoaded";
      payload: {
        globalSettings: GlobalSettings;
        connections: Connection[];
        activeConnection: string;
      };
    }
  | { type: "operationResult"; payload: { success: boolean; message: string } }
  | {
      type: "testResult";
      payload: { name: string; success: boolean; message: string; latency?: number };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertPayloadObject(payload: unknown, type: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error(`Invalid payload for message type "${type}"`);
  }
  return payload;
}

function assertFiniteNumber(value: unknown, field: string, type: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid "${field}" in message type "${type}"`);
  }
  return Number(value);
}

function assertNonEmptyString(value: unknown, field: string, type: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid "${field}" in message type "${type}"`);
  }
  return value;
}

function assertMessageType(type: string): asserts type is WebviewMessageType {
  if (!WEBVIEW_MESSAGE_TYPES.has(type as WebviewMessageType)) {
    throw new Error(`Unknown webview message type: ${type}`);
  }
}

function validatePayload(type: WebviewMessageType, payload: unknown): void {
  if (type === "ready" || type === "getConfig") {
    return;
  }

  const data = assertPayloadObject(payload, type);
  if (type === "sendMessage") {
    if (typeof data.text !== "string") {
      throw new Error(`Invalid "text" in message type "${type}"`);
    }
    if (data.clientMessageId !== undefined && typeof data.clientMessageId !== "string") {
      throw new Error(`Invalid "clientMessageId" in message type "${type}"`);
    }
    return;
  }
  if (type === "loadMoreHistory") {
    assertFiniteNumber(data.beforeTimestamp, "beforeTimestamp", type);
    return;
  }
  if (type === "loadAroundMessage") {
    assertFiniteNumber(data.targetMessageId, "targetMessageId", type);
    return;
  }
  if (type === "loadAroundArchivedMessage") {
    assertFiniteNumber(data.targetArchiveId, "targetArchiveId", type);
    return;
  }
  if (type === "searchMessages") {
    assertNonEmptyString(data.keyword ?? "", "keyword", type);
    if (data.limit !== undefined) {
      assertFiniteNumber(data.limit, "limit", type);
    }
    return;
  }
  if (type === "markRead") {
    assertFiniteNumber(data.lastReadTimestamp, "lastReadTimestamp", type);
    if (data.lastReadMessageId !== undefined) {
      assertFiniteNumber(data.lastReadMessageId, "lastReadMessageId", type);
    }
    return;
  }
  if (type === "openImage") {
    assertNonEmptyString(data.url, "url", type);
    return;
  }
  if (type === "saveGlobalSettings") {
    assertNonEmptyString(data.serverUrl ?? "", "serverUrl", type);
    if (typeof data.forceWebsocket !== "boolean") {
      throw new Error(`Invalid "forceWebsocket" in message type "${type}"`);
    }
    if (typeof data.autoReveal !== "boolean") {
      throw new Error(`Invalid "autoReveal" in message type "${type}"`);
    }
    if (data.displayMode !== "bubble" && data.displayMode !== "log") {
      throw new Error(`Invalid "displayMode" in message type "${type}"`);
    }
    return;
  }
  if (type === "saveConnection") {
    const connection = assertPayloadObject(data.connection, type);
    assertNonEmptyString(connection.name, "connection.name", type);
    assertNonEmptyString(connection.token, "connection.token", type);
    if (connection.serverUrl !== undefined && typeof connection.serverUrl !== "string") {
      throw new Error(`Invalid "connection.serverUrl" in message type "${type}"`);
    }
    if (connection.backgroundSync !== undefined && typeof connection.backgroundSync !== "boolean") {
      throw new Error(`Invalid "connection.backgroundSync" in message type "${type}"`);
    }
    if (data.originalName !== undefined && typeof data.originalName !== "string") {
      throw new Error(`Invalid "originalName" in message type "${type}"`);
    }
    return;
  }
  if (type === "deleteConnection" || type === "setActiveConnection") {
    assertNonEmptyString(data.name, "name", type);
    return;
  }
  assertNonEmptyString(data.name, "name", type);
  assertNonEmptyString(data.serverUrl, "serverUrl", type);
  assertNonEmptyString(data.token, "token", type);
}

export function parseWebviewMessage(raw: unknown): WebviewMessage {
  if (!isMessageEnvelope(raw)) {
    throw new Error("Invalid webview message format");
  }
  const { type, payload } = raw;
  assertMessageType(type);
  validatePayload(type, payload);
  return raw as WebviewMessage;
}

export function isHostMessage(raw: unknown): raw is HostMessage {
  if (!isMessageEnvelope(raw)) {
    return false;
  }
  return HOST_MESSAGE_TYPES.has(raw.type as HostMessageType);
}
