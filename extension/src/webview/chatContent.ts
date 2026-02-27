import * as vscode from "vscode";
import * as fs from "fs";

function getMissingAssetHtml(missingFiles: string[]): string {
  const list = missingFiles.map((file) => `<li><code>${file}</code></li>`).join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>TS-Lint Service</title>
    <style>
      body { font-family: sans-serif; padding: 16px; line-height: 1.5; }
      h1 { font-size: 16px; margin: 0 0 8px; }
      p { margin: 0 0 10px; }
      code { background: #f3f3f3; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Webview 构建产物缺失</h1>
    <p>当前界面空白通常是因为 Svelte Webview 资源还没构建完成。</p>
    <p>缺失文件：</p>
    <ul>${list}</ul>
    <p>请在 <code>extension/</code> 目录执行 <code>npm run compile</code> 或等待 <code>npm run watch</code> 首轮构建完成后刷新视图。</p>
  </body>
</html>`;
}

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
    "app.html",
  );
  const cssPath = vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css");
  const jsPath = vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js");

  const missingFiles: string[] = [];
  if (!fs.existsSync(cssPath.fsPath)) {
    missingFiles.push(cssPath.fsPath);
  }
  if (!fs.existsSync(jsPath.fsPath)) {
    missingFiles.push(jsPath.fsPath);
  }
  if (missingFiles.length > 0) {
    return getMissingAssetHtml(missingFiles);
  }

  // Convert to webview URIs
  const styleUri = webview.asWebviewUri(cssPath);
  const scriptUri = webview.asWebviewUri(jsPath);
  const cspSource = webview.cspSource;

  // Read HTML template
  let html = fs.readFileSync(htmlPath.fsPath, "utf8");

  // Replace placeholders
  html = html.replace(/{{nonce}}/g, nonce);
  html = html.replace(/{{cspSource}}/g, cspSource);
  html = html.replace(/{{styleUri}}/g, styleUri.toString());
  html = html.replace(/{{scriptUri}}/g, scriptUri.toString());

  return html;
}
