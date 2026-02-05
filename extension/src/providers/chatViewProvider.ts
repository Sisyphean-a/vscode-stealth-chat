/**
 * WebView Provider
 */
import * as vscode from "vscode";
import { getChatHtml } from "../webview/chatContent";
import { getNonce, getCurrentTimestamp } from "../utils/helpers";
import * as socketService from "../services/socketService";
import * as messageCache from "../services/messageCache";
import { openImagePreview } from "../ui/imagePreview";

let webviewView: vscode.WebviewView | undefined;

export function getWebviewView(): vscode.WebviewView | undefined {
  return webviewView;
}

export function setWebviewView(view: vscode.WebviewView | undefined): void {
  webviewView = view;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _outputChannel: vscode.OutputChannel
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

    this.setupMessageHandler(view);
  }

  private setupMessageHandler(view: vscode.WebviewView): void {
    view.webview.onDidReceiveMessage((message: any) => {
      switch (message.type) {
        case "ready":
          this.handleReady(view);
          break;
        case "sendMessage":
          this.handleSendMessage(message.payload);
          break;
        case "openImage":
          openImagePreview(message.payload.url);
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
    const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
    view.webview.postMessage({
      type: "setDisplayMode",
      payload: { mode: displayMode, serverUrl },
    });

    const cached = messageCache.getCachedMessages();
    if (cached.length > 0) {
      view.webview.postMessage({ type: "loadHistory", payload: cached });
    } else if (socketService.isConnected() && !socketService.isHistoryLoaded()) {
      socketService.getSocket()?.emit("load history", 50);
      socketService.setHistoryLoaded();
    }
  }

  private handleSendMessage(payload: any): void {
    const { text, attachments } = payload;
    if ((!text?.trim() && !attachments?.length) || !socketService.isConnected()) return;

    const config = vscode.workspace.getConfiguration("tsLint");
    const clickUrl = config.get<string>("serverUrl") || "http://localhost:3000";

    socketService.getSocket()?.emit("chat message", {
      text: text?.trim() || "",
      source: "vscode",
      clickUrl,
      attachments,
    });

    const timestamp = getCurrentTimestamp();
    const displayText = attachments?.length
      ? `[图片${text?.trim() ? ` + ${text.trim()}` : ""}]`
      : text.trim();
    this._outputChannel.appendLine(`[Info - ${timestamp}] Sent: ${displayText}`);

    const msg = {
      text: text?.trim() || "",
      source: "vscode" as const,
      timestamp: Date.now(),
      attachments,
    };
    webviewView?.webview.postMessage({ type: "addMessage", payload: msg });
    messageCache.addToCache(msg);
  }
}
