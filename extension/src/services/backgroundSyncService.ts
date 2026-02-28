import * as vscode from "vscode";
import type { Connection } from "../types";
import * as conversationStore from "./conversationStore";
import {
  closeSyncSession,
  createSyncSession,
  pullSyncUpdates,
  type SyncPullUpdate,
  type SyncSessionApp,
} from "./syncApiService";

const CURSOR_STATE_KEY = "tsLint.backgroundSyncCursors";
const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_LIMIT_PER_APP = 50;
const MAX_BACKOFF_MS = 30000;
const POLL_JITTER_MS = 400;

type NormalizedConnection = Connection & { serverUrl: string };

type BackgroundSyncOptions = {
  globalState: vscode.Memento;
  onUpdates: (updates: SyncPullUpdate[]) => void;
  onError?: (serverUrl: string, error: Error) => void;
  onRecovered?: (serverUrl: string) => void;
  outputChannel?: vscode.OutputChannel;
};

type PoolState = {
  serverUrl: string;
  connections: NormalizedConnection[];
  apps: SyncSessionApp[];
  sessionToken: string;
  expiresAt: number;
  pollIntervalMs: number;
  backoffMs: number;
  timer: NodeJS.Timeout | undefined;
  running: boolean;
  stopped: boolean;
  unhealthy: boolean;
};

function buildEmptyPool(serverUrl: string, connections: NormalizedConnection[]): PoolState {
  return {
    serverUrl,
    connections,
    apps: [],
    sessionToken: "",
    expiresAt: 0,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    backoffMs: 0,
    timer: undefined,
    running: false,
    stopped: false,
    unhealthy: false,
  };
}

function clampPollInterval(ms: number): number {
  if (!Number.isFinite(ms) || ms < 1000) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.min(10000, Number(ms));
}

function jitterDelay(baseDelay: number): number {
  const jitter = Math.floor((Math.random() * 2 - 1) * POLL_JITTER_MS);
  return Math.max(1000, baseDelay + jitter);
}

function nextBackoff(previous: number): number {
  if (previous <= 0) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.min(MAX_BACKOFF_MS, previous * 2);
}

function readErrorCode(error: Error): string {
  const message = error.message || "";
  const separatorIndex = message.indexOf(":");
  if (separatorIndex <= 0) {
    return "";
  }
  return message.slice(0, separatorIndex).trim();
}

function isUnsetCursor(cursor: { timestamp: number; id: number }): boolean {
  return cursor.timestamp <= 0 || cursor.id <= 0;
}

export class BackgroundSyncService {
  private readonly globalState: vscode.Memento;
  private readonly onUpdates: (updates: SyncPullUpdate[]) => void;
  private readonly onError?: (serverUrl: string, error: Error) => void;
  private readonly onRecovered?: (serverUrl: string) => void;
  private readonly outputChannel?: vscode.OutputChannel;
  private readonly pools = new Map<string, PoolState>();

  private enabled = true;
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  private limitPerApp = DEFAULT_LIMIT_PER_APP;
  private cursorSaveTimer: NodeJS.Timeout | undefined;

  constructor(options: BackgroundSyncOptions) {
    this.globalState = options.globalState;
    this.onUpdates = options.onUpdates;
    this.onError = options.onError;
    this.onRecovered = options.onRecovered;
    this.outputChannel = options.outputChannel;
  }

  public loadPersistedState(): void {
    const saved = this.globalState.get<Record<string, { timestamp: number; id: number }>>(CURSOR_STATE_KEY, {});
    conversationStore.loadPersistedCursors(saved);
  }

  public configure(options: {
    connections: NormalizedConnection[];
    enabled: boolean;
    pollIntervalMs?: number;
    limitPerApp?: number;
  }): void {
    this.enabled = options.enabled;
    this.pollIntervalMs = clampPollInterval(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    this.limitPerApp = Number.isFinite(options.limitPerApp)
      ? Math.max(1, Math.min(100, Number(options.limitPerApp)))
      : DEFAULT_LIMIT_PER_APP;
    if (!this.enabled) {
      this.stop();
      return;
    }
    this.rebuildPools(options.connections);
  }

  public stop(): void {
    for (const pool of this.pools.values()) {
      this.stopPool(pool);
    }
    this.pools.clear();
    if (this.cursorSaveTimer) {
      clearTimeout(this.cursorSaveTimer);
      this.cursorSaveTimer = undefined;
    }
    void this.globalState.update(CURSOR_STATE_KEY, conversationStore.exportCursors());
  }

  private log(line: string): void {
    this.outputChannel?.appendLine(`[Sync] ${line}`);
  }

  private rebuildPools(connections: NormalizedConnection[]): void {
    const grouped = new Map<string, NormalizedConnection[]>();
    for (const connection of connections) {
      const safeUrl = connection.serverUrl.trim();
      const existing = grouped.get(safeUrl) || [];
      existing.push(connection);
      grouped.set(safeUrl, existing);
    }

    for (const [serverUrl, pool] of this.pools.entries()) {
      if (!grouped.has(serverUrl)) {
        this.stopPool(pool);
        this.pools.delete(serverUrl);
      }
    }

    for (const [serverUrl, scopedConnections] of grouped.entries()) {
      const pool = this.pools.get(serverUrl) || buildEmptyPool(serverUrl, scopedConnections);
      pool.connections = scopedConnections;
      pool.stopped = false;
      if (!this.pools.has(serverUrl)) {
        this.pools.set(serverUrl, pool);
      }
      if (this.enabled) {
        this.schedulePool(pool, 100);
      }
    }
  }

  private stopPool(pool: PoolState): void {
    pool.stopped = true;
    if (pool.timer) {
      clearTimeout(pool.timer);
      pool.timer = undefined;
    }
    if (pool.sessionToken) {
      void closeSyncSession({ serverUrl: pool.serverUrl, sessionToken: pool.sessionToken }).catch(() => undefined);
    }
    pool.sessionToken = "";
    pool.apps = [];
  }

  private schedulePool(pool: PoolState, delayMs: number): void {
    if (pool.stopped) {
      return;
    }
    if (pool.timer) {
      clearTimeout(pool.timer);
    }
    pool.timer = setTimeout(() => {
      void this.pollPool(pool);
    }, delayMs);
  }

  private async openSession(pool: PoolState): Promise<void> {
    const session = await createSyncSession({
      serverUrl: pool.serverUrl,
      connections: pool.connections.map((item) => ({ name: item.name, token: item.token })),
      pollIntervalMs: this.pollIntervalMs,
    });
    pool.sessionToken = session.sessionToken;
    pool.apps = session.apps;
    pool.pollIntervalMs = clampPollInterval(session.pollIntervalMs);
    pool.expiresAt = Date.now() + session.expiresInMs;
    for (const app of session.apps) {
      conversationStore.assignAppId(app.connectionName, app.appId);
      const currentCursor = conversationStore.getCursor(app.connectionName);
      if (isUnsetCursor(currentCursor) && app.initialCursor) {
        conversationStore.setCursor(app.connectionName, app.initialCursor);
      }
    }
  }

  private buildCursors(pool: PoolState): Record<string, { timestamp: number; id: number }> {
    const cursors: Record<string, { timestamp: number; id: number }> = {};
    for (const app of pool.apps) {
      const cursor = conversationStore.getCursor(app.connectionName);
      cursors[app.appId] = cursor;
    }
    return cursors;
  }

  private applyUpdates(pool: PoolState, updates: SyncPullUpdate[]): void {
    const effective: SyncPullUpdate[] = [];
    for (const update of updates) {
      if (!update.connectionName || !Array.isArray(update.messages)) {
        continue;
      }
      conversationStore.assignAppId(update.connectionName, update.appId);
      conversationStore.mergeMessagesForConnection(update.connectionName, update.messages);
      conversationStore.setCursor(update.connectionName, update.nextCursor);
      effective.push(update);
    }

    if (effective.length > 0) {
      this.onUpdates(effective);
      this.persistCursorsSoon();
    }

    if (pool.unhealthy) {
      pool.unhealthy = false;
      this.onRecovered?.(pool.serverUrl);
    }
  }

  private async pollPool(pool: PoolState): Promise<void> {
    if (pool.stopped || pool.running || !this.enabled) {
      return;
    }
    pool.running = true;

    try {
      if (!pool.sessionToken || Date.now() >= pool.expiresAt) {
        await this.openSession(pool);
      }

      const result = await pullSyncUpdates({
        serverUrl: pool.serverUrl,
        sessionToken: pool.sessionToken,
        cursors: this.buildCursors(pool),
        limitPerApp: this.limitPerApp,
      });
      this.applyUpdates(pool, result.updates);
      pool.backoffMs = 0;
      this.schedulePool(pool, jitterDelay(pool.pollIntervalMs));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const code = readErrorCode(err);
      if (code === "SYNC_SESSION_INVALID") {
        pool.sessionToken = "";
      }
      pool.backoffMs = nextBackoff(pool.backoffMs);
      pool.unhealthy = true;
      this.log(`${pool.serverUrl} -> ${err.message}`);
      this.onError?.(pool.serverUrl, err);
      this.schedulePool(pool, pool.backoffMs);
    } finally {
      pool.running = false;
    }
  }

  private persistCursorsSoon(delayMs = 1500): void {
    if (this.cursorSaveTimer) {
      clearTimeout(this.cursorSaveTimer);
    }
    this.cursorSaveTimer = setTimeout(() => {
      void this.globalState.update(CURSOR_STATE_KEY, conversationStore.exportCursors());
    }, delayMs);
  }
}
