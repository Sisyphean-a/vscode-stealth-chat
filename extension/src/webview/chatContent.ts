import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Get the WebView HTML content by loading external files
 */
export function getChatHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
): string {
  // Get file URIs
  const htmlPath = vscode.Uri.joinPath(
    extensionUri,
    "src",
    "webview",
    "chat.html",
  );
  const cssPath = vscode.Uri.joinPath(
    extensionUri,
    "src",
    "webview",
    "chat.css",
  );
  const coreCssPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-core.css");
  const bubbleCssPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-bubble.css");
  const logCssPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-log.css");
  const jsPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat.js");
  const utilsJsPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-utils.js");
  const rendererJsPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-renderer.js");
  const settingsJsPath = vscode.Uri.joinPath(extensionUri, "src", "webview", "chat-settings.js");

  // Convert to webview URIs
  const coreStyleUri = webview.asWebviewUri(coreCssPath);
  const bubbleStyleUri = webview.asWebviewUri(bubbleCssPath);
  const logStyleUri = webview.asWebviewUri(logCssPath);
  const scriptUri = webview.asWebviewUri(jsPath);
  const utilsScriptUri = webview.asWebviewUri(utilsJsPath);
  const rendererScriptUri = webview.asWebviewUri(rendererJsPath);
  const settingsScriptUri = webview.asWebviewUri(settingsJsPath);
  const cspSource = webview.cspSource;

  // Read HTML template
  let html = fs.readFileSync(htmlPath.fsPath, "utf8");

  // Replace placeholders
  html = html.replace(/{{nonce}}/g, nonce);
  html = html.replace(/{{cspSource}}/g, cspSource);
  html = html.replace(/{{coreStyleUri}}/g, coreStyleUri.toString());
  html = html.replace(/{{bubbleStyleUri}}/g, bubbleStyleUri.toString());
  html = html.replace(/{{logStyleUri}}/g, logStyleUri.toString());
  html = html.replace(/{{utilsScriptUri}}/g, utilsScriptUri.toString());
  html = html.replace(/{{rendererScriptUri}}/g, rendererScriptUri.toString());
  html = html.replace(/{{settingsScriptUri}}/g, settingsScriptUri.toString());
  html = html.replace(/{{scriptUri}}/g, scriptUri.toString());

  return html;
}
