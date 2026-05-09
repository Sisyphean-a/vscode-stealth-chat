import * as vscode from "vscode";
import * as socketService from "../services/socketService";
import * as configService from "../services/configService";
import * as unreadStateService from "../services/unreadStateService";
import { getActiveConnection } from "../utils/helpers";

type RegisterCommandOptions = {
  readonly refreshUnreadStatus: () => void;
};

async function switchConnection(): Promise<void> {
  const connections = configService.getConnections();
  if (connections.length === 0) {
    vscode.window.showInformationMessage("还没有可用连接。");
    return;
  }

  const currentActive = configService.getActiveConnectionName();
  const items = connections.map((connection) => ({
    label: connection.name,
    description: connection.serverUrl || "default",
    picked: connection.name === currentActive,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "切换连接",
  });
  if (selected && selected.label !== currentActive) {
    await configService.setActiveConnection(selected.label);
  }
}

async function sendMessageFromQuickInput(): Promise<void> {
  const message = await vscode.window.showInputBox({
    placeHolder: "发送一条消息",
    ignoreFocusOut: true,
  });
  if (!message?.trim() || !socketService.isConnected()) {
    return;
  }

  const clickUrl = getActiveConnection().serverUrl;
  await socketService.sendChatMessage({
    text: message.trim(),
    source: "vscode",
    clickUrl,
  });
}

export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  options: RegisterCommandOptions
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.focus", () => {
      void vscode.commands.executeCommand("tsLintChat.chatView.focus");
      unreadStateService.clearUnreadForActiveConversation();
      options.refreshUnreadStatus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tsLintService.switchConnection", () => {
      return switchConnection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.stealthSend", async () => {
      try {
        await sendMessageFromQuickInput();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`发送失败: ${errorMessage}`);
      }
    }),
  );
}
