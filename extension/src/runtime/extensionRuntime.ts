import * as vscode from "vscode";
import { ChatMessage, Connection, SocketCallbacks } from "../types";
import { getActiveConnection, getAllConnections } from "../utils/helpers";
import * as socketService from "../services/socketService";
import * as conversationStore from "../services/conversationStore";
import { BackgroundSyncService } from "../services/backgroundSyncService";
import { type SyncPullUpdate } from "../services/syncApiService";
import * as statusBar from "../ui/statusBar";
import { ChatViewProvider, getWebviewView } from "../providers/chatViewProvider";
import { ensureDefaultConnection } from "../services/configService";
import { ConfigChangeKind, ConfigWatcher } from "./configWatcher";
import { registerRuntimeCommands } from "./registerCommands";

const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
const DEFAULT_BACKGROUND_SYNC_INTERVAL_MS = 4000;

function toMessageText(message: { source: "mobile" | "vscode"; timestamp: number; text: string }): string {
  const msgTime = new Date(message.timestamp);
  const hh = msgTime.getHours().toString().padStart(2, "0");
  const mm = msgTime.getMinutes().toString().padStart(2, "0");
  const ss = msgTime.getSeconds().toString().padStart(2, "0");
  const prefix = message.source === "vscode" ? "Sent" : "Process";
  return `[Info - ${hh}:${mm}:${ss}] ${prefix}: ${message.text}`;
}

type IncomingOptions = {
  readonly connectionName: string;
  readonly messages: readonly ChatMessage[];
};

export class ExtensionRuntime {
  private readonly context: vscode.ExtensionContext;
  private readonly outputChannel: vscode.OutputChannel;
  private backgroundSync: BackgroundSyncService | undefined;

  public constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  public async activate(): Promise<void> {
    this.context.subscriptions.push(this.outputChannel);
    socketService.setOutputChannel(this.outputChannel);

    const statusBarItem = statusBar.createStatusBar();
    this.context.subscriptions.push(statusBarItem);

    await ensureDefaultConnection();
    this.initializeConversationStore();
    this.setupBackgroundSync();
    this.connectActiveSocket();

    const provider = new ChatViewProvider(this.context.extensionUri);
    this.context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("tsLintChat.chatView", provider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    );

    registerRuntimeCommands(this.context, {
      refreshUnreadStatus: () => this.refreshUnreadStatus(),
    });
    this.registerConfigWatcher();
    this.refreshUnreadStatus();
  }

  public deactivate(): void {
    this.backgroundSync?.stop();
    socketService.disconnectSocket();
  }

  private initializeConversationStore(): void {
    const allConnections = getAllConnections();
    conversationStore.syncConnections(allConnections.map((item) => item.name));
    const active = getActiveConnection();
    conversationStore.setActiveConversation(active.name);
    conversationStore.clearUnread(active.name);
  }

  private setupBackgroundSync(): void {
    this.backgroundSync = new BackgroundSyncService({
      globalState: this.context.globalState,
      outputChannel: this.outputChannel,
      onUpdates: (updates) => this.handleBackgroundUpdates(updates),
      onError: (serverUrl, error) => {
        statusBar.setSyncIssue("sync");
        this.outputChannel.appendLine(`[Sync][${serverUrl}] ${error.message}`);
      },
      onRecovered: () => {
        statusBar.setSyncIssue("");
      },
    });
    this.backgroundSync.loadPersistedState();
    this.applyBackgroundSyncConfig();
  }

  private applyBackgroundSyncConfig(): void {
    if (!this.backgroundSync) {
      return;
    }
    const config = vscode.workspace.getConfiguration("tsLint");
    const enabled = config.get<boolean>("backgroundSyncEnabled") ?? true;
    const pollIntervalMs =
      config.get<number>("backgroundSyncIntervalMs") ?? DEFAULT_BACKGROUND_SYNC_INTERVAL_MS;
    const syncConnections = getAllConnections().filter((connection) => connection.backgroundSync !== false);

    const syncReady = enabled && syncConnections.length > 0;
    statusBar.setSyncIssue(syncReady ? "" : "sync-off");

    this.backgroundSync.configure({
      connections: syncConnections,
      enabled,
      pollIntervalMs,
      limitPerApp: 50,
    });
  }

  private connectActiveSocket(): void {
    const config = vscode.workspace.getConfiguration("tsLint");
    const connection = getActiveConnection();
    const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

    this.activateConversation(connection.name);
    this.resetSocketState();

    socketService.connectToServer(
      connection.serverUrl,
      connection.token,
      forceWebsocket,
      this.buildSocketCallbacks(connection.name),
    );

    this.postWebviewRuntimeConfig();
  }

  private activateConversation(connectionName: string): void {
    conversationStore.setActiveConversation(connectionName);
    conversationStore.clearUnread(connectionName);
    this.refreshUnreadStatus();
  }

  private resetSocketState(): void {
    socketService.disconnectSocket();
    socketService.resetHistoryLoaded();
    socketService.resetLastDisplayedDate();
  }

  private buildSocketCallbacks(connectionName: string): SocketCallbacks {
    return {
      onConnect: () => {
        statusBar.updateStatusBar();
        this.postToWebview({ type: "updateStatus", payload: { connected: true } });
        this.pushActiveHistoryToWebview(false);
      },
      onDisconnect: () => {
        this.postToWebview({ type: "updateStatus", payload: { connected: false } });
      },
      onConnectError: (error) => {
        this.outputChannel.appendLine(`[Socket] ${error.message}`);
      },
      onMessage: (message) => {
        this.applyIncomingMessages({ connectionName, messages: [message] });
      },
      onHistoryLoaded: (messages) => {
        conversationStore.mergeMessagesForConnection(connectionName, messages);
        this.pushActiveHistoryToWebview(true);
      },
      onMoreHistoryLoaded: (messages, hasMore) => {
        conversationStore.mergeMessagesForConnection(connectionName, messages);
        this.postToWebview({ type: "prependHistory", payload: { messages, hasMore } });
      },
      onAroundMessageLoaded: (payload) => {
        if (payload.messages.length > 0) {
          conversationStore.mergeMessagesForConnection(connectionName, payload.messages);
        }
        this.postToWebview({ type: "aroundMessagesLoaded", payload });
      },
      onAroundArchivedMessageLoaded: (payload) => {
        if (payload.messages.length > 0) {
          conversationStore.mergeMessagesForConnection(connectionName, payload.messages);
        }
        this.postToWebview({ type: "aroundArchivedMessagesLoaded", payload });
      },
      onPresenceUpdate: (payload) => {
        this.postToWebview({ type: "presenceUpdate", payload });
      },
      onReadReceipt: (payload) => {
        this.postToWebview({ type: "readReceipt", payload });
      },
    };
  }

  private applyIncomingMessages(options: IncomingOptions): void {
    const activeConnection = conversationStore.getActiveConversationName();
    const webview = getWebviewView();

    for (const message of options.messages) {
      const added = conversationStore.mergeMessagesForConnection(options.connectionName, [message]) > 0;
      if (!added) {
        continue;
      }

      const isActive = options.connectionName === activeConnection;
      const shouldUnread = message.source === "mobile" && (!isActive || !webview?.visible);
      if (shouldUnread) {
        conversationStore.incrementUnread(options.connectionName, 1);
      }

      if (isActive) {
        this.logMessageToOutput(message);
        this.postToWebview({ type: "addMessage", payload: message });
      }
    }

    this.refreshUnreadStatus();
  }

  private handleBackgroundUpdates(updates: readonly SyncPullUpdate[]): void {
    const groupedByConnection = new Map<string, SyncPullUpdate[]>();
    for (const update of updates) {
      const list = groupedByConnection.get(update.connectionName) || [];
      list.push(update);
      groupedByConnection.set(update.connectionName, list);
    }

    for (const [connectionName, grouped] of groupedByConnection.entries()) {
      const messages = grouped.flatMap((item) => item.messages || []);
      this.applyIncomingMessages({ connectionName, messages });
    }
  }

  private logMessageToOutput(message: { source: "mobile" | "vscode"; timestamp: number; text: string }): void {
    socketService.checkAndShowDateSeparator(message.timestamp);
    this.outputChannel.appendLine(toMessageText(message));
  }

  private postToWebview(message: { type: string; payload?: unknown }): void {
    getWebviewView()?.webview.postMessage(message);
  }

  private pushActiveHistoryToWebview(clearBefore: boolean): void {
    const active = conversationStore.getActiveConversationName();
    if (!active) {
      return;
    }
    if (clearBefore) {
      this.postToWebview({ type: "clearMessages" });
    }
    this.postToWebview({ type: "loadHistory", payload: conversationStore.getMessages(active) });
  }

  private refreshUnreadStatus(): void {
    statusBar.setUnreadCount(conversationStore.getTotalUnread());
  }

  private postWebviewRuntimeConfig(): void {
    const config = vscode.workspace.getConfiguration("tsLint");
    const displayMode = config.get<string>("displayMode") || "bubble";
    const connection = getActiveConnection();
    this.postToWebview({
      type: "setDisplayMode",
      payload: {
        mode: displayMode,
        serverUrl: connection.serverUrl,
        token: connection.token,
      },
    });
  }

  private handleConnectionChange(): void {
    this.initializeConversationStore();
    this.applyBackgroundSyncConfig();
    this.connectActiveSocket();
    this.pushActiveHistoryToWebview(true);
  }

  private handleConfigChanges(kinds: ReadonlySet<ConfigChangeKind>): void {
    if (kinds.has("connection")) {
      this.handleConnectionChange();
      return;
    }
    if (kinds.has("backgroundSync")) {
      this.applyBackgroundSyncConfig();
    }
    if (kinds.has("display")) {
      this.postWebviewRuntimeConfig();
    }
  }

  private registerConfigWatcher(): void {
    const watcher = new ConfigWatcher({
      onChange: (kinds) => this.handleConfigChanges(kinds),
    });
    this.context.subscriptions.push(watcher);
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        watcher.push(event);
      }),
    );
  }

}
