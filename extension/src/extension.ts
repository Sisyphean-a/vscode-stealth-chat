import * as vscode from "vscode";
import { io, Socket } from "socket.io-client";

// Channel name disguised as a linting service
const OUTPUT_CHANNEL_NAME = "TS-Lint Service";
const STATUS_BAR_DEFAULT_TEXT = "$(check) TS-Lint";
const STATUS_BAR_ALERT_TEXT = "$(alert) TS-Lint";

let outputChannel: vscode.OutputChannel;
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
  statusBarItem.command = "extension.stealthSend";
  statusBarItem.show();

  // Get configuration
  const config = vscode.workspace.getConfiguration("tsLint");
  const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
  const secret = config.get<string>("secret") || "ChangeMeInProduction";

  // Connect to Socket.io server
  connectToServer(serverUrl, secret);

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
        socket.emit("chat message", {
          text: message.trim(),
          source: "vscode",
        });

        // Show sent message in output channel
        const timestamp = getCurrentTimestamp();
        outputChannel.appendLine(
          `[Info - ${timestamp}] Sent: ${message.trim()}`,
        );
      }
    },
  );

  // Register command: Open output channel and clear unread status
  const openOutputCommand = vscode.commands.registerCommand(
    "extension.openOutputChannel",
    () => {
      outputChannel.show();
      clearUnreadStatus();
    },
  );

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (e: vscode.ConfigurationChangeEvent) => {
      if (
        e.affectsConfiguration("tsLint.serverUrl") ||
        e.affectsConfiguration("tsLint.secret")
      ) {
        const newConfig = vscode.workspace.getConfiguration("tsLint");
        const newServerUrl =
          newConfig.get<string>("serverUrl") || "http://localhost:3000";
        const newSecret =
          newConfig.get<string>("secret") || "ChangeMeInProduction";

        // Reconnect with new URL
        socket?.disconnect();
        connectToServer(newServerUrl, newSecret);
      }
    },
  );

  context.subscriptions.push(
    sendCommand,
    openOutputCommand,
    configChangeDisposable,
    outputChannel,
    statusBarItem,
  );
}

function connectToServer(serverUrl: string, secret: string): void {
  try {
    socket = io(serverUrl, {
      auth: {
        token: secret,
      },
    });

    socket.on("connect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Info - ${timestamp}] TS-Lint Service connected`,
      );

      // Request history messages after connection
      socket?.emit("load history", 50);
    });

    socket.on("disconnect", () => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Info - ${timestamp}] TS-Lint Service disconnected`,
      );
    });

    socket.on("connect_error", (error: Error) => {
      const timestamp = getCurrentTimestamp();
      outputChannel.appendLine(
        `[Error - ${timestamp}] Connection failed: ${error.message}`,
      );
    });

    // Listen for history loaded event
    socket.on(
      "history loaded",
      (
        messages: Array<{ text: string; source: string; timestamp: number }>,
      ) => {
        if (messages.length > 0) {
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
        }
      },
    );

    // Listen for chat messages
    socket.on(
      "chat message",
      (data: { text: string; source: "mobile" | "vscode" }) => {
        if (data.source === "mobile") {
          handleIncomingMessage(data.text);
        }
      },
    );
  } catch (error) {
    const timestamp = getCurrentTimestamp();
    outputChannel.appendLine(
      `[Error - ${timestamp}] Failed to initialize: ${error}`,
    );
  }
}

function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function handleIncomingMessage(text: string): void {
  const timestamp = getCurrentTimestamp();

  // Append message to output channel (disguised as process log)
  outputChannel.appendLine(`[Info - ${timestamp}] Process: ${text}`);

  // Update unread count and status bar
  unreadCount++;
  updateStatusBar();
}

function updateStatusBar(): void {
  if (unreadCount > 0) {
    statusBarItem.text = `${STATUS_BAR_ALERT_TEXT} (${unreadCount})`;
    statusBarItem.command = "extension.openOutputChannel";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
  } else {
    statusBarItem.text = STATUS_BAR_DEFAULT_TEXT;
    statusBarItem.command = "extension.stealthSend";
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

export function deactivate() {
  socket?.disconnect();
}
