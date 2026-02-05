/**
 * Settings WebView Provider
 */
import * as vscode from "vscode";
import { getSettingsHtml } from "../webview/settingsContent";
import { getNonce } from "../utils/helpers";
import * as configService from "../services/configService";
import * as socketService from "../services/socketService";

export class SettingsViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "src", "webview"),
      ],
    };

    const nonce = getNonce();
    view.webview.html = getSettingsHtml(view.webview, this._extensionUri, nonce);

    this.setupMessageHandler(view);
  }

  private setupMessageHandler(view: vscode.WebviewView): void {
    view.webview.onDidReceiveMessage(async (message: any) => {
      switch (message.type) {
        case "getConfig":
          this.sendConfig(view);
          break;
        case "saveGlobalSettings":
          await this.handleSaveGlobalSettings(view, message.payload);
          break;
        case "saveConnection":
          await this.handleSaveConnection(view, message.payload);
          break;
        case "deleteConnection":
          await this.handleDeleteConnection(view, message.payload);
          break;
        case "setActiveConnection":
          await this.handleSetActiveConnection(view, message.payload);
          break;
        case "testConnection":
          await this.handleTestConnection(view, message.payload);
          break;
      }
    });
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
    payload: any
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
        payload: { success: false, message: "Failed to save settings" },
      });
    }
  }

  private async handleSaveConnection(
    view: vscode.WebviewView,
    payload: any
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
        payload: { success: false, message: "Failed to save connection" },
      });
    }
  }

  private async handleDeleteConnection(
    view: vscode.WebviewView,
    payload: any
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
        payload: { success: false, message: "Failed to delete connection" },
      });
    }
  }

  private async handleSetActiveConnection(
    view: vscode.WebviewView,
    payload: any
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
        payload: { success: false, message: "Failed to change connection" },
      });
    }
  }

  private async handleTestConnection(
    view: vscode.WebviewView,
    payload: any
  ): Promise<void> {
    const { name, serverUrl, token } = payload;
    const result = await socketService.testConnection(serverUrl, token);
    view.webview.postMessage({
      type: "testResult",
      payload: { name, ...result },
    });
  }
}