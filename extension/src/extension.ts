import * as vscode from "vscode";
import { io, Socket } from "socket.io-client";
import { getChatHtml } from "./webview/chatContent";

// Channel name disguised as a linting service
const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
const STATUS_BAR_DEFAULT_TEXT = "$(check) TS-Lint";
const STATUS_BAR_ALERT_TEXT = "$(alert) TS-Lint";

let outputChannel: vscode.OutputChannel;
let webviewPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let socket: Socket | undefined;
let unreadCount = 0;

export function activate(context: vscode.ExtensionContext) {
  // Create output channel (disguised as lint service)
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  // Create status bar item on the right side
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = STATUS_BAR_DEFAULT_TEXT;
  statusBarItem.command = "extension.toggleWebView";
  statusBarItem.show();

  // Get configuration
  const config = vscode.workspace.getConfiguration("tsLint");
  const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
  const secret = config.get<string>("secret") || "ChangeMeInProduction";
  const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

  // Connect to Socket.io server
  connectToServer(serverUrl, secret, forceWebsocket);

  // Register command: Toggle WebView visibility
  const toggleWebViewCommand = vscode.commands.registerCommand(
    "extension.toggleWebView",
    () => {
      if (webviewPanel) {
        webviewPanel.reveal(vscode.ViewColumn.One);
        clearUnreadStatus();
      } else {
        createWebView(context);
        clearUnreadStatus();
      }
    },
  );

  // Register command: Send message (disguised as configuration input)
  const sendCommand = vscode.commands.registerCommand(
    "extension.stealthSend",
    async () => {
      const message = await vscode.window.showInputBox({
        prompt: "",
        placeHolder: "Enter configuration parameters...",
        ignoreFocusOut: true,
      });

      if (message && message.trim() && socket?.connected) {
        // Get latest configuration for click URL
        const config = vscode.workspace.getConfiguration("tsLint");
        const clickUrl =
          config.get<string>("serverUrl") || "http://localhost:3000";

        socket.emit("chat message", {
          text: message.trim(),
          source: "vscode",
          clickUrl: clickUrl,
        });

        // Send message to WebView
        if (webviewPanel) {
          webviewPanel.webview.postMessage({
            type: "addMessage",
            payload: {
              text: message.trim(),
              source: "vscode",
              timestamp: Date.now(),
            },
          });
        }
      }

      // Clear unread status when sending message
      clearUnreadStatus();
    },
  );

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (e: vscode.ConfigurationChangeEvent) => {
      if (
        e.affectsConfiguration("tsLint.serverUrl") ||
        e.affectsConfiguration("tsLint.secret") ||
        e.affectsConfiguration("tsLint.forceWebsocket")
      ) {
        const newConfig = vscode.workspace.getConfiguration("tsLint");
        const newServerUrl =
          newConfig.get<string>("serverUrl") || "http://localhost:3000";
        const newSecret =
          newConfig.get<string>("secret") || "ChangeMeInProduction";
        const newForceWebsocket =
          newConfig.get<boolean>("forceWebsocket") || false;

        // Reconnect with new URL
        socket?.disconnect();
        connectToServer(newServerUrl, newSecret, newForceWebsocket);
      }
    },
  );

  context.subscriptions.push(
    toggleWebViewCommand,
    sendCommand,
    configChangeDisposable,
    outputChannel,
    statusBarItem,
  );
}

function createWebView(context: vscode.ExtensionContext): void {
  // Create WebView panel
  webviewPanel = vscode.window.createWebviewPanel(
    "tsLintChat",
    "TS-Lint Service",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    },
  );

  // Generate nonce for CSP
  const nonce = getNonce();
  webviewPanel.webview.html = getChatHtml(nonce);

  // Update connection status
  if (socket?.connected) {
    webviewPanel.webview.postMessage({
      type: "updateStatus",
      payload: { connected: true },
    });
    
    // Request history for the newly created WebView
    socket.emit("load history", 50);
  }

  // Listen for messages from WebView
  webviewPanel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.type) {
        case "ready":
          // WebView is ready, can send initial data if needed
          break;
        case "sendMessage":
          // Handle message sent from WebView
          const text = message.payload.text;
          if (text && text.trim() && socket?.connected) {
            const config = vscode.workspace.getConfiguration("tsLint");
            const clickUrl = config.get<string>("serverUrl") || "http://localhost:3000";

            // Send to server
            socket.emit("chat message", {
              text: text.trim(),
              source: "vscode",
              clickUrl: clickUrl,
            });

            // Show in Output Channel
            const timestamp = getCurrentTimestamp();
            outputChannel.appendLine(
              `[Info - ${timestamp}] Sent: ${text.trim()}`,
            );

            // Echo back to WebView
            webviewPanel?.webview.postMessage({
              type: "addMessage",
              payload: {
                text: text.trim(),
                source: "vscode",
                timestamp: Date.now(),
              },
            });
          }
          break;
      }
    },
    undefined,
    context.subscriptions,
  );

  // Handle WebView disposal
  webviewPanel.onDidDispose(
    () => {
      webviewPanel = undefined;
    },
    undefined,
    context.subscriptions,
  );
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function connectToServer(
  serverUrl: string,
  secret: string,
  forceWebsocket: boolean,
): void {
  try {
    socket = io(serverUrl, {
      auth: {
        token: secret,
      },
      transports: forceWebsocket ? ["websocket"] : ["polling", "websocket"],
    });

    socket.on("connect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Info - ${timestamp}] TS-Lint Service connected`,
      );

      // Update WebView status
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          type: "updateStatus",
          payload: { connected: true },
        });
      }

      // Request history messages after connection
      socket?.emit("load history", 50);
    });

    socket.on("disconnect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Info - ${timestamp}] TS-Lint Service disconnected`,
      );

      // Update WebView status
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          type: "updateStatus",
          payload: { connected: false },
        });
      }
    });

    socket.on("connect_error", (error: Error) => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Error - ${timestamp}] Connection failed: ${error.message}`,
      );

      // Update WebView status
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          type: "updateStatus",
          payload: { connected: false },
        });
      }
    });

    // Listen for history loaded event
    socket.on(
      "history loaded",
      (
        messages: Array<{ text: string; source: string; timestamp: number }>,
      ) => {
        if (messages.length > 0) {
          // Show in Output Channel
          const timestamp = getCurrentTimestamp();
          outputChannel.appendLine(
            `[Info - ${timestamp}] Loading ${messages.length} historical messages...`,
          );

          messages.forEach((msg) => {
            const msgTime = new Date(msg.timestamp);
            const formattedTime = formatTimestamp(msgTime);
            const prefix = msg.source === "mobile" ? "Process" : "Sent";
            outputChannel.appendLine(
              `[Info - ${formattedTime}] ${prefix}: ${msg.text}`,
            );
          });

          outputChannel.appendLine(
            `[Info - ${timestamp}] History loaded successfully`,
          );

          // Send to WebView
          if (webviewPanel) {
            webviewPanel.webview.postMessage({
              type: "loadHistory",
              payload: messages,
            });
          }
        }
      },
    );

    // Listen for chat messages
    socket.on(
      "chat message",
      (data: { text: string; source: "mobile" | "vscode"; timestamp?: number }) => {
        if (data.source === "mobile") {
          handleIncomingMessage(data.text, data.timestamp);
        }
      },
    );
  } catch (error) {
    // Silent error handling
  }
}


function handleIncomingMessage(text: string, timestamp?: number): void {
  // Show in Output Channel
  const ts = getCurrentTimestamp();
  outputChannel.appendLine(`[Info - ${ts}] Process: ${text}`);

  // Send message to WebView
  if (webviewPanel) {
    webviewPanel.webview.postMessage({
      type: "addMessage",
      payload: {
        text: text,
        source: "mobile",
        timestamp: timestamp || Date.now(),
      },
    });
  }

  const config = vscode.workspace.getConfiguration("tsLint");
  const autoReveal = config.get<boolean>("autoReveal") || false;

  if (autoReveal) {
    // If autoReveal is on, show WebView and don't increment unread count
    if (webviewPanel) {
      webviewPanel.reveal(vscode.ViewColumn.One, true);
    }
  } else {
    // Update unread count and status bar
    unreadCount++;
    updateStatusBar();
  }
}

function updateStatusBar(): void {
  if (unreadCount > 0) {
    statusBarItem.text = `${STATUS_BAR_ALERT_TEXT} (${unreadCount})`;
    statusBarItem.command = "extension.toggleWebView";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
  } else {
    statusBarItem.text = STATUS_BAR_DEFAULT_TEXT;
    statusBarItem.command = "extension.toggleWebView";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.color = undefined;
  }
}

function clearUnreadStatus(): void {
  unreadCount = 0;
  updateStatusBar();
}

function getCurrentTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function deactivate() {
  socket?.disconnect();
}
