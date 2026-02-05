import * as vscode from "vscode";
import * as fs from "fs";

/**
 * Get the Settings WebView HTML content
 */
export function getSettingsHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string
): string {
  const htmlPath = vscode.Uri.joinPath(
    extensionUri,
    "src",
    "webview",
    "settings.html"
  );
  const cssPath = vscode.Uri.joinPath(
    extensionUri,
    "src",
    "webview",
    "settings.css"
  );
  const jsPath = vscode.Uri.joinPath(
    extensionUri,
    "src",
    "webview",
    "settings.js"
  );

  const styleUri = webview.asWebviewUri(cssPath);
  const scriptUri = webview.asWebviewUri(jsPath);
  const cspSource = webview.cspSource;

  let html = fs.readFileSync(htmlPath.fsPath, "utf8");

  html = html.replace(/{{nonce}}/g, nonce);
  html = html.replace(/{{cspSource}}/g, cspSource);
  html = html.replace(/{{styleUri}}/g, styleUri.toString());
  html = html.replace(/{{scriptUri}}/g, scriptUri.toString());

  return html;
}
