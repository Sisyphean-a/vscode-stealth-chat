import { normalizeServerUrl } from "../utils/helpers";

type CursorPayload = {
  timestamp: number;
  id: number;
};

type SyncConnectionPayload = {
  name: string;
  token: string;
};

export type SyncSessionApp = {
  appId: string;
  name: string;
  connectionName: string;
  initialCursor?: CursorPayload;
};

export type SyncSessionResponse = {
  sessionToken: string;
  expiresInMs: number;
  pollIntervalMs: number;
  apps: SyncSessionApp[];
};

export type SyncPullUpdate = {
  appId: string;
  connectionName: string;
  messages: Array<{
    id?: number;
    clientMessageId?: string | null;
    archiveId?: number | null;
    archived?: boolean;
    text: string;
    source: "mobile" | "vscode";
    timestamp: number;
    attachments?: Array<{
      type: string;
      data?: string;
      url?: string;
      filename?: string;
      size?: number;
    }>;
    quote?: {
      messageId: number;
      textSnippet: string;
      source: "mobile" | "vscode";
      timestamp: number;
    };
  }>;
  nextCursor: CursorPayload;
  hasMore: boolean;
};

export type SyncPullResponse = {
  serverTime: number;
  updates: SyncPullUpdate[];
};

type SyncApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

const REQUEST_TIMEOUT_MS = 10000;

async function postJson(url: string, body: unknown, authToken?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json() as SyncApiErrorPayload & { ok?: boolean };
    if (!response.ok || payload?.ok === false) {
      const code = payload?.error?.code || "SYNC_REQUEST_FAILED";
      const message = payload?.error?.message || `Request failed with status ${response.status}`;
      throw new Error(`${code}: ${message}`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function getSyncBaseUrl(serverUrl: string): string {
  return `${normalizeServerUrl(serverUrl)}/api/sync`;
}

export async function createSyncSession(options: {
  serverUrl: string;
  connections: SyncConnectionPayload[];
  pollIntervalMs?: number;
}): Promise<SyncSessionResponse> {
  const payload = await postJson(
    `${getSyncBaseUrl(options.serverUrl)}/session`,
    {
      connections: options.connections,
      pollIntervalMs: options.pollIntervalMs,
    },
  ) as { sessionToken: string; expiresInMs: number; pollIntervalMs: number; apps: SyncSessionApp[] };

  return {
    sessionToken: payload.sessionToken,
    expiresInMs: payload.expiresInMs,
    pollIntervalMs: payload.pollIntervalMs,
    apps: Array.isArray(payload.apps) ? payload.apps : [],
  };
}

export async function pullSyncUpdates(options: {
  serverUrl: string;
  sessionToken: string;
  cursors: Record<string, CursorPayload>;
  limitPerApp: number;
}): Promise<SyncPullResponse> {
  const payload = await postJson(
    `${getSyncBaseUrl(options.serverUrl)}/pull`,
    {
      cursors: options.cursors,
      limitPerApp: options.limitPerApp,
    },
    options.sessionToken,
  ) as { serverTime: number; updates: SyncPullUpdate[] };

  return {
    serverTime: Number.isFinite(payload.serverTime) ? Number(payload.serverTime) : Date.now(),
    updates: Array.isArray(payload.updates) ? payload.updates : [],
  };
}

export async function refreshSyncSession(options: {
  serverUrl: string;
  sessionToken: string;
}): Promise<SyncSessionResponse> {
  const payload = await postJson(
    `${getSyncBaseUrl(options.serverUrl)}/refresh`,
    {},
    options.sessionToken,
  ) as { sessionToken: string; expiresInMs: number; pollIntervalMs: number; apps: SyncSessionApp[] };

  return {
    sessionToken: payload.sessionToken,
    expiresInMs: payload.expiresInMs,
    pollIntervalMs: payload.pollIntervalMs,
    apps: Array.isArray(payload.apps) ? payload.apps : [],
  };
}

export async function closeSyncSession(options: {
  serverUrl: string;
  sessionToken: string;
}): Promise<void> {
  await postJson(
    `${getSyncBaseUrl(options.serverUrl)}/close`,
    {},
    options.sessionToken,
  );
}
