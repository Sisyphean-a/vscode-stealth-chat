/**
 * VS Code 扩展入口
 * 重构后的精简版本
 */
import * as vscode from "vscode";
import { Connection } from "./types";
import { getActiveConnection, getCurrentTimestamp } from "./utils/helpers";
import * as socketService from "./services/socketService";
import * as messageCache from "./services/messageCache";
import * as statusBar from "./ui/statusBar";
import { ChatViewProvider, getWebviewView } from "./providers/chatViewProvider";
import { ensureDefaultConnection } from "./services/configService";

const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  // 创建输出通道
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  socketService.setOutputChannel(outputChannel);

  // 创建状态栏
  const statusBarItem = statusBar.createStatusBar();
  context.subscriptions.push(statusBarItem);

  // 确保默认连接配置存在
  await ensureDefaultConnection();

  // 获取配置并连接
  const config = vscode.workspace.getConfiguration("tsLint");
  const conn = getActiveConnection();
  const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

  // 连接服务器
  connectWithCallbacks(conn.serverUrl, conn.token, forceWebsocket);

  // 注册 WebView Provider
  const provider = new ChatViewProvider(context.extensionUri, outputChannel);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tsLintChat.chatView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 注册命令
  registerCommands(context);

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tsLint.activeConnection")) {
        handleConnectionChange();
      } else if (e.affectsConfiguration("tsLint.displayMode")) {
        const config = vscode.workspace.getConfiguration("tsLint");
        const displayMode = config.get<string>("displayMode") || "bubble";
        const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
        getWebviewView()?.webview.postMessage({
          type: "setDisplayMode",
          payload: { mode: displayMode, serverUrl },
        });
      }
    })
  );
}

function connectWithCallbacks(serverUrl: string, token: string, forceWebsocket: boolean): void {
  socketService.connectToServer(serverUrl, token, forceWebsocket, {
    onConnect: () => {
      statusBar.updateStatusBar();
      getWebviewView()?.webview.postMessage({
        type: "updateStatus",
        payload: { connected: true },
      });
    },
    onDisconnect: () => {
      getWebviewView()?.webview.postMessage({
        type: "updateStatus",
        payload: { connected: false },
      });
    },
    onMessage: (msg) => {
      handleIncomingMessage(msg);
    },
    onHistoryLoaded: (messages) => {
      socketService.setHistoryLoaded();
      const webview = getWebviewView();
      if (webview) {
        webview.webview.postMessage({
          type: "loadHistory",
          payload: messages,
        });
      }
    },
    onMoreHistoryLoaded: (messages, hasMore) => {
      getWebviewView()?.webview.postMessage({
        type: "prependHistory",
        payload: { messages, hasMore },
      });
    },
  });
}

function handleIncomingMessage(msg: any): void {
  if (!messageCache.addToCache(msg)) return;

  socketService.checkAndShowDateSeparator(msg.timestamp);

  const msgTime = new Date(msg.timestamp);
  const timestamp = `${msgTime.getHours().toString().padStart(2, "0")}:${msgTime.getMinutes().toString().padStart(2, "0")}:${msgTime.getSeconds().toString().padStart(2, "0")}`;
  outputChannel.appendLine(`[Info - ${timestamp}] Process: ${msg.text}`);

  const config = vscode.workspace.getConfiguration("tsLint");
  if (config.get<boolean>("autoReveal")) {
    outputChannel.show(true);
  }

  const webview = getWebviewView();
  if (webview?.visible) {
    webview.webview.postMessage({ type: "addMessage", payload: msg });
  } else {
    statusBar.incrementUnread();
  }
}

function handleConnectionChange(): void {
  messageCache.clearCache();
  socketService.resetHistoryLoaded();
  socketService.resetLastDisplayedDate();
  outputChannel.clear();

  getWebviewView()?.webview.postMessage({ type: "clearMessages" });
  statusBar.clearUnreadStatus();

  socketService.disconnectSocket();

  const config = vscode.workspace.getConfiguration("tsLint");
  const conn = getActiveConnection();
  const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

  connectWithCallbacks(conn.serverUrl, conn.token, forceWebsocket);
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Focus 命令
  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.focus", () => {
      vscode.commands.executeCommand("tsLintChat.chatView.focus");
      statusBar.clearUnreadStatus();
    })
  );

  // 切换连接命令
  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.switchConnection", async () => {
      const config = vscode.workspace.getConfiguration("tsLint");
      const connections = config.get<Connection[]>("connections") || [];

      if (connections.length === 0) {
        vscode.window.showInformationMessage("未配置任何连接。");
        return;
      }

      const currentActive = config.get<string>("activeConnection");
      const items = connections.map((c) => ({
        label: c.name,
        description: c.serverUrl || "default",
        picked: c.name === currentActive,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "选择连接配置",
      });

      if (selected && selected.label !== currentActive) {
        await config.update("activeConnection", selected.label, true);
      }
    })
  );

  // 发送消息命令
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.stealthSend", async () => {
      const message = await vscode.window.showInputBox({
        placeHolder: "Enter configuration parameters...",
        ignoreFocusOut: true,
      });

      if (message?.trim() && socketService.isConnected()) {
        const config = vscode.workspace.getConfiguration("tsLint");
        const clickUrl = config.get<string>("serverUrl") || "http://localhost:3000";

        socketService.getSocket()?.emit("chat message", {
          text: message.trim(),
          source: "vscode",
          clickUrl,
        });

        const timestamp = getCurrentTimestamp();
        outputChannel.appendLine(`[Info - ${timestamp}] Sent: ${message.trim()}`);

        const msg = { text: message.trim(), source: "vscode", timestamp: Date.now() };
        getWebviewView()?.webview.postMessage({ type: "addMessage", payload: msg });
        messageCache.addToCache(msg as any);
      }
    })
  );
}

export function deactivate() {
  socketService.disconnectSocket();
}
