import * as vscode from "vscode";
import { Connection } from "./types";
import { getActiveConnection, getAllConnections } from "./utils/helpers";
import * as socketService from "./services/socketService";
import * as conversationStore from "./services/conversationStore";
import { BackgroundSyncService } from "./services/backgroundSyncService";
import { type SyncPullUpdate } from "./services/syncApiService";
import * as statusBar from "./ui/statusBar";
import { ChatViewProvider, getWebviewView } from "./providers/chatViewProvider";
import { ensureDefaultConnection } from "./services/configService";

const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
const DEFAULT_BACKGROUND_SYNC_INTERVAL_MS = 4000;

let outputChannel: vscode.OutputChannel;
let backgroundSync: BackgroundSyncService | undefined;
export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  socketService.setOutputChannel(outputChannel);

  const statusBarItem = statusBar.createStatusBar();
  context.subscriptions.push(statusBarItem);

  await ensureDefaultConnection();
  initializeConversationStore();
  setupBackgroundSync(context);
  connectActiveSocket();

  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tsLintChat.chatView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCommands(context);
  registerConfigWatcher(context);
  refreshUnreadStatus();
}

function initializeConversationStore(): void {
  const allConnections = getAllConnections();
  conversationStore.syncConnections(allConnections.map((item) => item.name));
  const active = getActiveConnection();
  conversationStore.setActiveConversation(active.name);
  conversationStore.clearUnread(active.name);
}

function setupBackgroundSync(context: vscode.ExtensionContext): void {
  backgroundSync = new BackgroundSyncService({
    globalState: context.globalState,
    outputChannel,
    onUpdates: handleBackgroundUpdates,
    onError: (serverUrl, error) => {
      statusBar.setSyncIssue("sync");
      outputChannel.appendLine(`[Sync][${serverUrl}] ${error.message}`);
    },
    onRecovered: () => {
      statusBar.setSyncIssue("");
    },
  });
  backgroundSync.loadPersistedState();
  applyBackgroundSyncConfig();
}

function applyBackgroundSyncConfig(): void {
  if (!backgroundSync) {
    return;
  }
  const config = vscode.workspace.getConfiguration("tsLint");
  const enabled = config.get<boolean>("backgroundSyncEnabled") ?? true;
  const pollIntervalMs = config.get<number>("backgroundSyncIntervalMs")
    ?? DEFAULT_BACKGROUND_SYNC_INTERVAL_MS;
  const syncConnections = getAllConnections()
    .filter((connection) => connection.backgroundSync !== false);

  statusBar.setSyncIssue("");

  backgroundSync.configure({
    connections: syncConnections,
    enabled,
    pollIntervalMs,
    limitPerApp: 50,
  });
}

function connectActiveSocket(): void {
  const config = vscode.workspace.getConfiguration("tsLint");
  const connection = getActiveConnection();
  const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

  conversationStore.setActiveConversation(connection.name);
  conversationStore.clearUnread(connection.name);
  refreshUnreadStatus();

  socketService.disconnectSocket();
  socketService.resetHistoryLoaded();
  socketService.resetLastDisplayedDate();

  socketService.connectToServer(connection.serverUrl, connection.token, forceWebsocket, {
    onConnect: () => {
      statusBar.updateStatusBar();
      postToWebview({ type: "updateStatus", payload: { connected: true } });
      pushActiveHistoryToWebview(false);
    },
    onDisconnect: () => {
      postToWebview({ type: "updateStatus", payload: { connected: false } });
    },
    onConnectError: (error) => {
      outputChannel.appendLine(`[Socket] ${error.message}`);
    },
    onMessage: (msg) => {
      applyIncomingMessages({
        connectionName: connection.name,
        messages: [msg],
        fromBackgroundSync: false,
      });
    },
    onHistoryLoaded: (messages) => {
      conversationStore.mergeMessagesForConnection(connection.name, messages);
      pushActiveHistoryToWebview(true);
    },
    onMoreHistoryLoaded: (messages, hasMore) => {
      conversationStore.mergeMessagesForConnection(connection.name, messages);
      postToWebview({
        type: "prependHistory",
        payload: { messages, hasMore },
      });
    },
    onAroundMessageLoaded: (payload) => {
      if (payload.messages.length > 0) {
        conversationStore.mergeMessagesForConnection(connection.name, payload.messages);
      }
      postToWebview({ type: "aroundMessagesLoaded", payload });
    },
    onAroundArchivedMessageLoaded: (payload) => {
      if (payload.messages.length > 0) {
        conversationStore.mergeMessagesForConnection(connection.name, payload.messages);
      }
      postToWebview({ type: "aroundArchivedMessagesLoaded", payload });
    },
    onPresenceUpdate: (payload) => {
      postToWebview({ type: "presenceUpdate", payload });
    },
    onReadReceipt: (payload) => {
      postToWebview({ type: "readReceipt", payload });
    },
  });

  postWebviewRuntimeConfig();
}

function applyIncomingMessages(options: {
  connectionName: string;
  messages: any[];
  fromBackgroundSync: boolean;
}): void {
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
      logMessageToOutput(message);
      postToWebview({ type: "addMessage", payload: message });
    }
  }

  refreshUnreadStatus();
}

function handleBackgroundUpdates(updates: SyncPullUpdate[]): void {
  const groupedByConnection = new Map<string, SyncPullUpdate[]>();
  for (const update of updates) {
    const list = groupedByConnection.get(update.connectionName) || [];
    list.push(update);
    groupedByConnection.set(update.connectionName, list);
  }

  for (const [connectionName, grouped] of groupedByConnection.entries()) {
    const messages = grouped.flatMap((item) => item.messages || []);
    applyIncomingMessages({
      connectionName,
      messages,
      fromBackgroundSync: true,
    });
  }
}

function logMessageToOutput(message: { source: "mobile" | "vscode"; timestamp: number; text: string }): void {
  socketService.checkAndShowDateSeparator(message.timestamp);
  const msgTime = new Date(message.timestamp);
  const timestamp = `${msgTime.getHours().toString().padStart(2, "0")}:${msgTime.getMinutes().toString().padStart(2, "0")}:${msgTime.getSeconds().toString().padStart(2, "0")}`;
  const prefix = message.source === "vscode" ? "Sent" : "Process";
  outputChannel.appendLine(`[Info - ${timestamp}] ${prefix}: ${message.text}`);
}

function postToWebview(message: { type: string; payload?: unknown }): void {
  getWebviewView()?.webview.postMessage(message);
}

function pushActiveHistoryToWebview(clearBefore: boolean): void {
  const active = conversationStore.getActiveConversationName();
  if (!active) {
    return;
  }
  if (clearBefore) {
    postToWebview({ type: "clearMessages" });
  }
  postToWebview({ type: "loadHistory", payload: conversationStore.getMessages(active) });
}

function refreshUnreadStatus(): void {
  statusBar.setUnreadCount(conversationStore.getTotalUnread());
}

function postWebviewRuntimeConfig(): void {
  const config = vscode.workspace.getConfiguration("tsLint");
  const displayMode = config.get<string>("displayMode") || "bubble";
  const connection = getActiveConnection();
  postToWebview({
    type: "setDisplayMode",
    payload: {
      mode: displayMode,
      serverUrl: connection.serverUrl,
      token: connection.token,
    },
  });
}

function handleConnectionChange(): void {
  initializeConversationStore();
  applyBackgroundSyncConfig();
  connectActiveSocket();
  pushActiveHistoryToWebview(true);
}

function registerConfigWatcher(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("tsLint.activeConnection")
        || e.affectsConfiguration("tsLint.connections")
        || e.affectsConfiguration("tsLint.serverUrl")
        || e.affectsConfiguration("tsLint.secret")
      ) {
        handleConnectionChange();
        return;
      }
      if (
        e.affectsConfiguration("tsLint.backgroundSyncEnabled")
        || e.affectsConfiguration("tsLint.backgroundSyncIntervalMs")
      ) {
        applyBackgroundSyncConfig();
        return;
      }
      if (e.affectsConfiguration("tsLint.displayMode")) {
        postWebviewRuntimeConfig();
      }
    })
  );
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.focus", () => {
      void vscode.commands.executeCommand("tsLintChat.chatView.focus");
      const active = conversationStore.getActiveConversationName();
      if (active) {
        conversationStore.clearUnread(active);
      }
      refreshUnreadStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.switchConnection", async () => {
      const config = vscode.workspace.getConfiguration("tsLint");
      const connections = config.get<Connection[]>("connections") || [];
      if (connections.length === 0) {
        vscode.window.showInformationMessage("未配置任何连接。");
        return;
      }

      const currentActive = config.get<string>("activeConnection");
      const items = connections.map((connection) => ({
        label: connection.name,
        description: connection.serverUrl || "default",
        picked: connection.name === currentActive,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "选择连接配置",
      });
      if (selected && selected.label !== currentActive) {
        await config.update("activeConnection", selected.label, true);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.stealthSend", async () => {
      const message = await vscode.window.showInputBox({
        placeHolder: "Enter configuration parameters...",
        ignoreFocusOut: true,
      });

      if (!message?.trim() || !socketService.isConnected()) {
        return;
      }

      const clickUrl = getActiveConnection().serverUrl;
      try {
        await socketService.sendChatMessage({
          text: message.trim(),
          source: "vscode",
          clickUrl,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`发送失败: ${errorMessage}`);
      }
    })
  );
}

export function deactivate() {
  backgroundSync?.stop();
  socketService.disconnectSocket();
}
