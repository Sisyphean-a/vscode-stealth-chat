import * as vscode from "vscode";
import { getChatHtml } from "../webview-bridge/chatContent";
import { getNonce, getActiveConnection } from "../utils/helpers";
import * as socketService from "../services/socketService";
import * as conversationStore from "../services/conversationStore";
import * as configService from "../services/configService";
import * as unreadStateService from "../services/unreadStateService";
import * as statusBar from "../ui/statusBar";
import { openImagePreview } from "../ui/imagePreview";
import {
  buildHostMessage,
  parseWebviewMessage,
  type HostMessageBody,
} from "../webview-bridge/protocol";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let webviewView: vscode.WebviewView | undefined;

export function getWebviewView(): vscode.WebviewView | undefined {
  return webviewView;
}

export function setWebviewView(view: vscode.WebviewView | undefined): void {
  webviewView = view;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  private postHostMessage(view: vscode.WebviewView, message: HostMessageBody): void {
    view.webview.postMessage(buildHostMessage(message));
  }

  public resolveWebviewView(
    view: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "dist", "webview"),
      ],
    };

    if (!view.webview.html || view.webview.html.length === 0) {
      const nonce = getNonce();
      view.webview.html = getChatHtml(view.webview, this._extensionUri, nonce);
    } else if (socketService.isConnected()) {
      this.postHostMessage(view, {
        type: "updateStatus",
        payload: { connected: true },
      });
    }

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        unreadStateService.clearUnreadForActiveConversation();
        statusBar.updateStatusBar();
      }
    });

    this.setupMessageHandler(view);
  }

  private setupMessageHandler(view: vscode.WebviewView): void {
    view.webview.onDidReceiveMessage((raw: unknown) => {
      let message;
      try {
        message = parseWebviewMessage(raw);
      } catch (error) {
        console.error(`[WebView] Invalid incoming message: ${getErrorMessage(error)}`);
        return;
      }
      switch (message.type) {
        case "ready":
          this.handleReady(view);
          break;
        case "sendMessage":
          this.handleSendMessage(view, message.payload);
          break;
        case "loadMoreHistory":
          this.handleLoadMoreHistory(message.payload);
          break;
        case "loadAroundMessage":
          this.handleLoadAroundMessage(message.payload);
          break;
        case "loadAroundArchivedMessage":
          this.handleLoadAroundArchivedMessage(message.payload);
          break;
        case "searchMessages":
          this.handleSearchMessages(view, message.payload);
          break;
        case "importConfig":
          this.handleImportConfig(view, message.payload);
          break;
        case "markRead":
          this.handleMarkRead(message.payload);
          break;
        case "openImage":
          openImagePreview(message.payload.url);
          break;
        case "getConfig":
          this.sendConfig(view);
          break;
        case "saveGlobalSettings":
          this.handleSaveGlobalSettings(view, message.payload);
          break;
        case "saveConnection":
          this.handleSaveConnection(view, message.payload);
          break;
        case "deleteConnection":
          this.handleDeleteConnection(view, message.payload);
          break;
        case "setActiveConnection":
          this.handleSetActiveConnection(view, message.payload);
          break;
        case "testConnection":
          this.handleTestConnection(view, message.payload);
          break;
      }
    });
  }

  private handleReady(view: vscode.WebviewView): void {
    this.postHostMessage(view, {
      type: "updateStatus",
      payload: { connected: socketService.isConnected() },
    });

    const config = vscode.workspace.getConfiguration("tsLint");
    const rawDisplayMode = config.get<string>("displayMode");
    const displayMode: "bubble" | "log" = rawDisplayMode === "log" ? "log" : "bubble";
    const activeConnection = getActiveConnection();
    this.postHostMessage(view, {
      type: "setDisplayMode",
      payload: {
        mode: displayMode,
        serverUrl: activeConnection.serverUrl,
        token: activeConnection.token,
      },
    });

    const activeName = conversationStore.getActiveConversationName();
    const cached = activeName ? conversationStore.getMessages(activeName) : [];
    if (cached.length > 0) {
      this.postHostMessage(view, { type: "loadHistory", payload: [...cached] });
    } else if (socketService.isConnected() && !socketService.isHistoryLoaded()) {
      socketService.loadHistory();
    }
  }

  private handleLoadMoreHistory(payload: { beforeTimestamp: number }): void {
    if (!socketService.isConnected()) return;
    socketService.loadMoreHistory(payload.beforeTimestamp);
  }

  private handleLoadAroundMessage(payload: { targetMessageId: number }): void {
    if (!socketService.isConnected()) return;
    if (!Number.isFinite(payload?.targetMessageId) || payload.targetMessageId <= 0) {
      return;
    }
    socketService.loadAroundMessage(payload.targetMessageId);
  }

  private handleLoadAroundArchivedMessage(payload: { targetArchiveId: number }): void {
    if (!socketService.isConnected()) return;
    if (!Number.isFinite(payload?.targetArchiveId) || payload.targetArchiveId <= 0) {
      return;
    }
    socketService.loadAroundArchivedMessage(payload.targetArchiveId);
  }

  private async handleSendMessage(view: vscode.WebviewView, payload: {
    text: string;
    attachments?: import("../types").Attachment[];
    quote?: import("../types").MessageQuote;
    clientMessageId?: string;
  }): Promise<void> {
    const { text, attachments, quote } = payload;
    if ((!text?.trim() && !attachments?.length) || !socketService.isConnected()) return;

    const activeConnection = getActiveConnection();
    const clickUrl = activeConnection.serverUrl;
    try {
      await socketService.sendChatMessage({
        text: text?.trim() || "",
        source: "vscode",
        clickUrl,
        attachments,
        quote,
        clientMessageId: payload.clientMessageId,
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "sendFailed",
        payload: {
          clientMessageId: payload.clientMessageId || null,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleSearchMessages(view: vscode.WebviewView, payload: {
    keyword: string;
    limit?: number;
    includeArchived?: boolean;
  }): Promise<void> {
    if (!socketService.isConnected()) {
      this.postHostMessage(view, {
        type: "searchResults",
        payload: { keyword: payload?.keyword || "", results: [], error: "当前未连接" },
      });
      return;
    }
    try {
      const keyword = typeof payload?.keyword === "string" ? payload.keyword.trim() : "";
      const limit = Number.isFinite(payload?.limit) ? Number(payload.limit) : 50;
      const includeArchived = payload?.includeArchived !== false;
      const results = await socketService.searchMessages(keyword, limit, includeArchived);
      this.postHostMessage(view, {
        type: "searchResults",
        payload: { keyword, results, error: null },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "searchResults",
        payload: {
          keyword: payload?.keyword || "",
          results: [],
          error: getErrorMessage(error),
        },
      });
    }
  }

  private handleMarkRead(payload: { lastReadTimestamp: number; lastReadMessageId?: number }): void {
    if (!Number.isFinite(payload?.lastReadTimestamp) || payload.lastReadTimestamp <= 0) {
      return;
    }
    unreadStateService.clearUnreadForActiveConversation();
    if (!socketService.isConnected()) {
      return;
    }
    socketService.markRead(payload.lastReadTimestamp, payload.lastReadMessageId);
  }

  private sendConfig(view: vscode.WebviewView): void {
    this.postHostMessage(view, {
      type: "configLoaded",
      payload: {
        globalSettings: configService.getGlobalSettings(),
        connections: configService.getConnections(),
        activeConnection: configService.getActiveConnectionName(),
      },
    });
  }

  private async handleSaveGlobalSettings(
    view: vscode.WebviewView,
    payload: import("../types").GlobalSettings
  ): Promise<void> {
    try {
      await configService.saveGlobalSettings(payload);
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: true, message: "Settings saved" },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: false, message: `Failed to save settings: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleSaveConnection(
    view: vscode.WebviewView,
    payload: { connection: import("../types").Connection; originalName?: string }
  ): Promise<void> {
    try {
      await configService.saveConnection(payload.connection, payload.originalName);
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: true, message: "Connection saved" },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: false, message: `Failed to save connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleDeleteConnection(view: vscode.WebviewView, payload: { name: string }): Promise<void> {
    try {
      await configService.deleteConnection(payload.name);
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: true, message: "Connection deleted" },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: false, message: `Failed to delete connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleSetActiveConnection(view: vscode.WebviewView, payload: { name: string }): Promise<void> {
    try {
      await configService.setActiveConnection(payload.name);
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: true, message: "Active connection changed" },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: false, message: `Failed to change connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleTestConnection(view: vscode.WebviewView, payload: { name: string; serverUrl: string; token: string }): Promise<void> {
    const { name, serverUrl, token } = payload;
    const result = await socketService.testConnection(serverUrl, token);
    this.postHostMessage(view, {
      type: "testResult",
      payload: { name, ...result },
    });
  }

  private async handleImportConfig(
    view: vscode.WebviewView,
    payload: {
      globalSettings: import("../types").GlobalSettings;
      connections: import("../types").Connection[];
      activeConnection: string;
    },
  ): Promise<void> {
    try {
      await configService.importConfig(payload);
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: true, message: "Config imported" },
      });
    } catch (error) {
      this.postHostMessage(view, {
        type: "operationResult",
        payload: { success: false, message: `Failed to import config: ${getErrorMessage(error)}` },
      });
    }
  }
}
