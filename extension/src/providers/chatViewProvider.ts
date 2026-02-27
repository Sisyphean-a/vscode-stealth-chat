/**
 * WebView Provider
 */
import * as vscode from "vscode";
import { getChatHtml } from "../webview/chatContent";
import { getNonce, getActiveConnection } from "../utils/helpers";
import * as socketService from "../services/socketService";
import * as messageCache from "../services/messageCache";
import * as configService from "../services/configService";
import * as statusBar from "../ui/statusBar";
import { openImagePreview } from "../ui/imagePreview";
import { WebviewMessage } from "../types";

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
  constructor(
    private readonly _extensionUri: vscode.Uri
  ) {}

  public resolveWebviewView(
    view: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "src", "webview"),
      ],
    };

    if (!view.webview.html || view.webview.html.length === 0) {
      const nonce = getNonce();
      view.webview.html = getChatHtml(view.webview, this._extensionUri, nonce);
    } else if (socketService.isConnected()) {
      view.webview.postMessage({
        type: "updateStatus",
        payload: { connected: true },
      });
    }

    // 监听可见性变化，清除未读计数
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        statusBar.clearUnreadStatus();
      }
    });

    // 如果当前可见，也清除一次（比如刚打开）
    if (view.visible) {
      statusBar.clearUnreadStatus();
    }

    this.setupMessageHandler(view);
  }

  private setupMessageHandler(view: vscode.WebviewView): void {
    view.webview.onDidReceiveMessage((message: WebviewMessage) => {
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
    view.webview.postMessage({
      type: "updateStatus",
      payload: { connected: socketService.isConnected() },
    });

    const config = vscode.workspace.getConfiguration("tsLint");
    const displayMode = config.get<string>("displayMode") || "bubble";
    const activeConnection = getActiveConnection();
    view.webview.postMessage({
      type: "setDisplayMode",
      payload: {
        mode: displayMode,
        serverUrl: activeConnection.serverUrl,
        token: activeConnection.token,
      },
    });

    const cached = messageCache.getCachedMessages();
    if (cached.length > 0) {
      // 缓存中有消息，直接发送（包括历史加载后缓存的）
      view.webview.postMessage({ type: "loadHistory", payload: cached });
    } else if (socketService.isConnected() && !socketService.isHistoryLoaded()) {
      // 无缓存且未加载过历史，请求服务器
      socketService.loadHistory();
      // setHistoryLoaded 在 extension.ts 的 onHistoryLoaded 回调中调用
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
      view.webview.postMessage({
        type: "sendFailed",
        payload: {
          clientMessageId: payload.clientMessageId || null,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleSearchMessages(
    view: vscode.WebviewView,
    payload: { keyword: string; limit?: number }
  ): Promise<void> {
    if (!socketService.isConnected()) {
      view.webview.postMessage({
        type: "searchResults",
        payload: { keyword: payload?.keyword || "", results: [], error: "当前未连接" },
      });
      return;
    }
    try {
      const keyword = typeof payload?.keyword === "string" ? payload.keyword.trim() : "";
      const limit = Number.isFinite(payload?.limit) ? Number(payload.limit) : 50;
      const results = await socketService.searchMessages(keyword, limit);
      view.webview.postMessage({
        type: "searchResults",
        payload: { keyword, results, error: null },
      });
    } catch (error) {
      view.webview.postMessage({
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
    if (!socketService.isConnected()) {
      return;
    }
    if (!Number.isFinite(payload?.lastReadTimestamp) || payload.lastReadTimestamp <= 0) {
      return;
    }
    socketService.markRead(payload.lastReadTimestamp, payload.lastReadMessageId);
  }

  private sendConfig(view: vscode.WebviewView): void {
    view.webview.postMessage({
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
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: true, message: "Settings saved" },
      });
    } catch (error) {
      view.webview.postMessage({
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
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: true, message: "Connection saved" },
      });
    } catch (error) {
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: false, message: `Failed to save connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleDeleteConnection(
    view: vscode.WebviewView,
    payload: { name: string }
  ): Promise<void> {
    try {
      await configService.deleteConnection(payload.name);
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: true, message: "Connection deleted" },
      });
    } catch (error) {
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: false, message: `Failed to delete connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleSetActiveConnection(
    view: vscode.WebviewView,
    payload: { name: string }
  ): Promise<void> {
    try {
      await configService.setActiveConnection(payload.name);
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: true, message: "Active connection changed" },
      });
    } catch (error) {
      view.webview.postMessage({
        type: "operationResult",
        payload: { success: false, message: `Failed to change connection: ${getErrorMessage(error)}` },
      });
    }
  }

  private async handleTestConnection(
    view: vscode.WebviewView,
    payload: { name: string; serverUrl: string; token: string }
  ): Promise<void> {
    const { name, serverUrl, token } = payload;
    const result = await socketService.testConnection(serverUrl, token);
    view.webview.postMessage({
      type: "testResult",
      payload: { name, ...result },
    });
  }
}
