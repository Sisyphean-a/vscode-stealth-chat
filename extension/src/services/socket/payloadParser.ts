import type { ChatMessage } from "../../types";
import { getAckData, getAckErrorMessage, isAckOk } from "../../../../packages/protocol/socket-events.js";

type AroundPayload = {
  messages?: ChatMessage[];
  targetMessageId?: number | null;
  targetArchiveId?: number | null;
  error?: string | null;
};

export function parsePresencePayload(payload: unknown): {
  appId: string;
  total: number;
  mobile: number;
  vscode: number;
} {
  const data = payload as Record<string, unknown> | undefined;
  return {
    appId: typeof data?.appId === "string" ? data.appId : "default",
    total: Number.isFinite(data?.total) ? Number(data?.total) : 0,
    mobile: Number.isFinite(data?.mobile) ? Number(data?.mobile) : 0,
    vscode: Number.isFinite(data?.vscode) ? Number(data?.vscode) : 0,
  };
}

export function parseReadReceiptPayload(payload: unknown): {
  appId: string;
  clientType: "mobile" | "vscode" | "unknown";
  lastReadTimestamp: number;
  lastReadMessageId: number | null;
} {
  const data = payload as Record<string, unknown> | undefined;
  const clientType = data?.clientType;
  const validClientType =
    clientType === "mobile" || clientType === "vscode" ? clientType : "unknown";
  return {
    appId: typeof data?.appId === "string" ? data.appId : "default",
    clientType: validClientType,
    lastReadTimestamp: Number.isFinite(data?.lastReadTimestamp)
      ? Number(data?.lastReadTimestamp)
      : Date.now(),
    lastReadMessageId: Number.isFinite(data?.lastReadMessageId)
      ? Number(data?.lastReadMessageId)
      : null,
  };
}

export function parseAroundMessagePayload(payload: AroundPayload): {
  messages: ChatMessage[];
  targetMessageId: number | null;
  error: string | null;
} {
  return {
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    targetMessageId: Number.isFinite(payload?.targetMessageId)
      ? Number(payload?.targetMessageId)
      : null,
    error: payload?.error ?? null,
  };
}

export function parseAroundArchivedPayload(payload: AroundPayload): {
  messages: ChatMessage[];
  targetArchiveId: number | null;
  error: string | null;
} {
  return {
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    targetArchiveId: Number.isFinite(payload?.targetArchiveId)
      ? Number(payload?.targetArchiveId)
      : null,
    error: payload?.error ?? null,
  };
}

export function parseSearchAck(ack: unknown): Array<{
  targetType: "hot" | "archive";
  messageId: number | null;
  archiveId: number | null;
  source: "mobile" | "vscode";
  timestamp: number;
  preview: string;
}> {
  if (!isAckOk(ack)) {
    throw new Error(getAckErrorMessage(ack, "搜索失败"));
  }
  const data = getAckData<{ results?: unknown }>(ack);
  const legacy = ack as { results?: unknown };
  const results = data?.results ?? legacy.results;
  return Array.isArray(results) ? results : [];
}
