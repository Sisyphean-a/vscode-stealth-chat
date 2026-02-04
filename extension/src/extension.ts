import * as vscode from "vscode";
import { io, Socket } from "socket.io-client";
import { getChatHtml } from "./webview/chatContent";

// Channel name disguised as a linting service
const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
const STATUS_BAR_DEFAULT_TEXT = "$(check) TS-Lint";
const STATUS_BAR_ALERT_TEXT = "$(alert) TS-Lint";

let outputChannel: vscode.OutputChannel;
let webviewView: vscode.WebviewView | undefined;
let statusBarItem: vscode.StatusBarItem;
let socket: Socket | undefined;
let unreadCount = 0;
let historyLoaded = false;

// 缓存配置
const CACHE_MAX_SIZE = 200;

// 消息去重 Set
const processedMessageKeys = new Set<string>();

let cachedMessages: Array<{
  text: string;
  source: string;
  timestamp: number;
  attachments?: any[];
}> = [];

// 生成消息唯一键（用于去重）
function getMessageKey(msg: { text: string; source: string; timestamp: number }): string {
  // 使用时间戳 + 来源 + 内容前20字符作为唯一键
  const textKey = msg.text?.slice(0, 20) || '';
  return `${msg.timestamp}-${msg.source}-${textKey}`;
}

// 检查消息是否已处理（去重）
function isMessageDuplicate(msg: { text: string; source: string; timestamp: number }): boolean {
  const key = getMessageKey(msg);
  if (processedMessageKeys.has(key)) {
    return true;
  }
  processedMessageKeys.add(key);
  // 限制 Set 大小，防止内存泄漏
  if (processedMessageKeys.size > CACHE_MAX_SIZE * 2) {
    const keysToDelete = Array.from(processedMessageKeys).slice(0, CACHE_MAX_SIZE);
    keysToDelete.forEach(k => processedMessageKeys.delete(k));
  }
  return false;
}

// 添加消息到缓存（带去重和大小限制）
function addToCache(msg: { text: string; source: string; timestamp: number; attachments?: any[] }): boolean {
  if (isMessageDuplicate(msg)) {
    return false;
  }
  cachedMessages.push(msg);
  // 限制缓存大小
  if (cachedMessages.length > CACHE_MAX_SIZE) {
    cachedMessages = cachedMessages.slice(-CACHE_MAX_SIZE);
  }
  return true;
}

// 合并历史消息（保留本地未同步消息）
function mergeHistory(history: Array<{ text: string; source: string; timestamp: number; attachments?: any[] }>): void {
  // 获取本地消息的最大时间戳
  const localMaxTimestamp = cachedMessages.length > 0
    ? Math.max(...cachedMessages.map(m => m.timestamp))
    : 0;

  // 合并：历史消息 + 本地比历史更新的消息
  const localNewerMessages = cachedMessages.filter(m => m.timestamp > localMaxTimestamp - 1000);

  // 重建去重 Set
  processedMessageKeys.clear();

  // 先添加历史消息
  const merged: typeof cachedMessages = [];
  for (const msg of history) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      processedMessageKeys.add(key);
      merged.push(msg);
    }
  }

  // 再添加本地较新的消息（可能是断线期间发送的）
  for (const msg of localNewerMessages) {
    const key = getMessageKey(msg);
    if (!processedMessageKeys.has(key)) {
      processedMessageKeys.add(key);
      merged.push(msg);
    }
  }

  // 按时间排序
  merged.sort((a, b) => a.timestamp - b.timestamp);

  // 限制大小
  cachedMessages = merged.slice(-CACHE_MAX_SIZE);
}

export function activate(context: vscode.ExtensionContext) {
  // Create output channel (disguised as lint service)
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  // Create status bar item on the right side
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = STATUS_BAR_DEFAULT_TEXT;
  statusBarItem.command = "tsLintService.focus"; // Focus on sidebar view
  statusBarItem.show();

  // Get configuration
  const config = vscode.workspace.getConfiguration("tsLint");
  const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
  const secret = config.get<string>("secret") || "ChangeMeInProduction";
  const forceWebsocket = config.get<boolean>("forceWebsocket") || false;

  // Connect to Socket.io server
  connectToServer(serverUrl, secret, forceWebsocket);

  // Register WebView Provider for sidebar
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("tsLintChat.chatView", provider)
  );

  // Register command: Focus on sidebar view
  const focusCommand = vscode.commands.registerCommand(
    "tsLintService.focus",
    () => {
      vscode.commands.executeCommand("tsLintChat.chatView.focus");
      clearUnreadStatus();
    }
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

        // Show in Output Channel
        const timestamp = getCurrentTimestamp();
        outputChannel.appendLine(
          `[Info - ${timestamp}] Sent: ${message.trim()}`,
        );

        // Send message to WebView
        if (webviewView) {
          webviewView.webview.postMessage({
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

      // Handle displayMode changes
      if (e.affectsConfiguration("tsLint.displayMode")) {
        const newConfig = vscode.workspace.getConfiguration("tsLint");
        const displayMode = newConfig.get<string>("displayMode") || "bubble";
        const serverUrlForWebview = newConfig.get<string>("serverUrl") || "http://localhost:3000";
        if (webviewView) {
          webviewView.webview.postMessage({
            type: "setDisplayMode",
            payload: { mode: displayMode, serverUrl: serverUrlForWebview },
          });
        }
      }
    },
  );

  context.subscriptions.push(
    focusCommand,
    sendCommand,
    configChangeDisposable,
    outputChannel,
    statusBarItem,
  );
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    view: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    console.log('[ChatViewProvider] resolveWebviewView called, socket connected:', socket?.connected);

    // Store reference to global webviewView
    webviewView = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "src", "webview"),
      ],
    };

    // Check if HTML is already set
    console.log('[ChatViewProvider] view.webview.html length:', view.webview.html?.length || 0);
    console.log('[ChatViewProvider] context.state:', context.state);

    // Only set HTML if it's empty (first time or after being destroyed)
    if (!view.webview.html || view.webview.html.length === 0) {
      console.log('[ChatViewProvider] Setting HTML for the first time');
      const nonce = getNonce();
      view.webview.html = getChatHtml(view.webview, this._extensionUri, nonce);
    } else {
      console.log('[ChatViewProvider] WebView already has content, skipping HTML setup');
      // Just update the status since WebView is already initialized
      if (socket?.connected) {
        view.webview.postMessage({
          type: "updateStatus",
          payload: { connected: true },
        });
      }
    }

    // Listen for messages from WebView
    view.webview.onDidReceiveMessage((message: any) => {
      switch (message.type) {
        case "ready":
          console.log('[ChatViewProvider] WebView ready, socket connected:', socket?.connected);
          console.log('[ChatViewProvider] Cached messages count:', cachedMessages.length);

          // WebView is ready, send current connection status
          view.webview.postMessage({
            type: "updateStatus",
            payload: { connected: socket?.connected || false },
          });

          // Send current display mode
          const displayModeConfig = vscode.workspace.getConfiguration("tsLint");
          const currentDisplayMode = displayModeConfig.get<string>("displayMode") || "bubble";
          const currentServerUrl = displayModeConfig.get<string>("serverUrl") || "http://localhost:3000";
          view.webview.postMessage({
            type: "setDisplayMode",
            payload: { mode: currentDisplayMode, serverUrl: currentServerUrl },
          });

          // Send cached messages to WebView
          if (cachedMessages.length > 0) {
            console.log('[ChatViewProvider] Sending cached messages to WebView');
            view.webview.postMessage({
              type: "loadHistory",
              payload: cachedMessages,
            });
          } else if (socket?.connected && !historyLoaded) {
            // Only load from server if cache is empty and not loaded yet
            console.log('[ChatViewProvider] Loading history from server');
            socket.emit("load history", 50);
            historyLoaded = true;
          }
          break;
        case "sendMessage":
          // Handle message sent from WebView
          const text = message.payload.text;
          const attachments = message.payload.attachments;
          if ((text && text.trim()) || (attachments && attachments.length > 0)) {
            if (socket?.connected) {
              const config = vscode.workspace.getConfiguration("tsLint");
              const clickUrl = config.get<string>("serverUrl") || "http://localhost:3000";

              // Send to server
              socket.emit("chat message", {
                text: text?.trim() || "",
                source: "vscode",
                clickUrl: clickUrl,
                attachments: attachments,
              });

              // Show in Output Channel
              const timestamp = getCurrentTimestamp();
              const displayText = attachments && attachments.length > 0
                ? `[图片${text?.trim() ? ` + ${text.trim()}` : ""}]`
                : text.trim();
              outputChannel.appendLine(
                `[Info - ${timestamp}] Sent: ${displayText}`,
              );

              // Echo back to WebView
              webviewView?.webview.postMessage({
                type: "addMessage",
                payload: {
                  text: text?.trim() || "",
                  source: "vscode",
                  timestamp: Date.now(),
                  attachments: attachments,
                },
              });

              // Add to cache (使用去重机制)
              addToCache({
                text: text?.trim() || "",
                source: "vscode",
                timestamp: Date.now(),
                attachments: attachments,
              });
              console.log('[sendMessage] Added to cache, total:', cachedMessages.length);
            }
          }
          break;
        case "openImage":
          // Open image in a new WebView panel
          openImagePreview(message.payload.url, this._extensionUri);
          break;
      }
    });
  }
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
    // 显示"正在连接"状态
    statusBarItem.text = "$(sync~spin) TS-Lint";
    statusBarItem.tooltip = "正在连接服务器...";

    // 通知 WebView 正在连接
    if (webviewView) {
      webviewView.webview.postMessage({
        type: "updateStatus",
        payload: { connected: false, connecting: true },
      });
    }

    socket = io(serverUrl, {
      auth: {
        token: secret,
      },
      transports: forceWebsocket ? ["websocket"] : ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Info - ${timestamp}] TS-Lint Service connected`,
      );

      // 恢复状态栏
      statusBarItem.tooltip = "TS-Lint Service 已连接";
      updateStatusBar();

      // Update WebView status
      if (webviewView) {
        webviewView.webview.postMessage({
          type: "updateStatus",
          payload: { connected: true, connecting: false },
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

      // 更新状态栏
      statusBarItem.tooltip = "TS-Lint Service 已断开";

      // Update WebView status
      if (webviewView) {
        webviewView.webview.postMessage({
          type: "updateStatus",
          payload: { connected: false, connecting: false },
        });
      }
    });

    socket.on("connect_error", (error: Error) => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Error - ${timestamp}] Connection failed: ${error.message}`,
      );

      // 更新状态栏显示错误
      statusBarItem.tooltip = `连接失败: ${error.message}`;

      // Update WebView status with error
      if (webviewView) {
        webviewView.webview.postMessage({
          type: "updateStatus",
          payload: { connected: false, connecting: false, error: error.message },
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
          // 合并历史消息和本地缓存（保留断线期间的本地消息）
          mergeHistory(messages);
          console.log('[Socket] Merged history, total:', cachedMessages.length);

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

          // Send merged cache to WebView
          if (webviewView) {
            webviewView.webview.postMessage({
              type: "loadHistory",
              payload: cachedMessages,
            });
          }
        }
      },
    );

    // Listen for chat messages
    socket.on(
      "chat message",
      (data: {
        text: string;
        source: "mobile" | "vscode";
        timestamp?: number;
        attachments?: Array<{
          type: string;
          data?: string;
          url?: string;
          filename?: string;
          size?: number;
        }>;
      }) => {
        if (data.source === "mobile") {
          handleIncomingMessage(data.text, data.timestamp, data.attachments);
        }
      },
    );
  } catch (error) {
    // Silent error handling
  }
}


function handleIncomingMessage(
  text: string,
  timestamp?: number,
  attachments?: Array<{
    type: string;
    data?: string;
    url?: string;
    filename?: string;
    size?: number;
  }>,
): void {
  const msgTimestamp = timestamp || Date.now();
  const msg = {
    text,
    source: "mobile",
    timestamp: msgTimestamp,
    attachments,
  };

  // 去重检查
  if (!addToCache(msg)) {
    console.log('[handleIncomingMessage] Duplicate message, skipping');
    return;
  }
  console.log('[handleIncomingMessage] Added to cache, total:', cachedMessages.length);

  // Show in Output Channel (degraded for images)
  const ts = getCurrentTimestamp();
  const displayText =
    attachments && attachments.length > 0 ? `[图片消息] ${text}` : text;
  outputChannel.appendLine(`[Info - ${ts}] Process: ${displayText}`);

  // Send message to WebView (full data including images)
  if (webviewView) {
    webviewView.webview.postMessage({
      type: "addMessage",
      payload: {
        text: text,
        source: "mobile",
        timestamp: msgTimestamp,
        attachments: attachments,
      },
    });
  }

  const config = vscode.workspace.getConfiguration("tsLint");
  const autoReveal = config.get<boolean>("autoReveal") || false;

  if (autoReveal) {
    // If autoReveal is on, show WebView and don't increment unread count
    if (webviewView) {
      webviewView.show();
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
    statusBarItem.command = "tsLintService.focus";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
  } else {
    statusBarItem.text = STATUS_BAR_DEFAULT_TEXT;
    statusBarItem.command = "tsLintService.focus";
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

function openImagePreview(imageUrl: string, extensionUri: vscode.Uri): void {
  const panel = vscode.window.createWebviewPanel(
    "imagePreview",
    "Image Preview",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const nonce = getNonce();

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Image Preview</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      overflow: auto;
    }
    .toolbar {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }
    .toolbar button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .toolbar button:hover {
      opacity: 0.9;
    }
    img {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
      transition: transform 0.2s ease;
      cursor: grab;
    }
    img:active {
      cursor: grabbing;
    }
    .zoom-info {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="zoom-in" title="放大 (+)">+</button>
    <button id="zoom-out" title="缩小 (-)">−</button>
    <button id="reset" title="重置 (0)">⟲</button>
  </div>
  <img id="preview-img" src="${imageUrl}" alt="Preview">
  <div class="zoom-info" id="zoom-info">100%</div>
  <script nonce="${nonce}">
    const img = document.getElementById('preview-img');
    const zoomInfo = document.getElementById('zoom-info');
    let scale = 1;

    function updateZoom() {
      img.style.transform = 'scale(' + scale + ')';
      zoomInfo.textContent = Math.round(scale * 100) + '%';
    }

    document.getElementById('zoom-in').addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 5);
      updateZoom();
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.25);
      updateZoom();
    });

    document.getElementById('reset').addEventListener('click', () => {
      scale = 1;
      updateZoom();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') {
        scale = Math.min(scale + 0.25, 5);
        updateZoom();
      } else if (e.key === '-') {
        scale = Math.max(scale - 0.25, 0.25);
        updateZoom();
      } else if (e.key === '0') {
        scale = 1;
        updateZoom();
      }
    });

    // Mouse wheel zoom
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          scale = Math.min(scale + 0.1, 5);
        } else {
          scale = Math.max(scale - 0.1, 0.25);
        }
        updateZoom();
      }
    }, { passive: false });
  </script>
</body>
</html>`;
}

export function deactivate() {
  socket?.disconnect();
}

