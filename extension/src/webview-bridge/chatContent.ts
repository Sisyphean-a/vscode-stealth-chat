import * as vscode from "vscode";
import * as fs from "fs";
import { PUBLIC_WEBVIEW_BUILD_TITLE } from "../constants/branding";

const TEMPLATE_SEGMENTS = ["src", "webview-bridge", "app.html"] as const;
const BUNDLE_CSS_SEGMENTS = ["dist", "webview", "main.css"] as const;
const BUNDLE_JS_SEGMENTS = ["dist", "webview", "main.js"] as const;

type AssetUris = {
  template: vscode.Uri;
  css: vscode.Uri;
  js: vscode.Uri;
};

function getMissingAssetHtml(missingFiles: string[]): string {
  const list = missingFiles.map((file) => `<li><code>${file}</code></li>`).join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${PUBLIC_WEBVIEW_BUILD_TITLE}</title>
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

function resolveAssetUris(extensionUri: vscode.Uri): AssetUris {
  return {
    template: vscode.Uri.joinPath(extensionUri, ...TEMPLATE_SEGMENTS),
    css: vscode.Uri.joinPath(extensionUri, ...BUNDLE_CSS_SEGMENTS),
    js: vscode.Uri.joinPath(extensionUri, ...BUNDLE_JS_SEGMENTS),
  };
}

function collectMissingFiles(paths: vscode.Uri[]): string[] {
  return paths
    .map((path) => path.fsPath)
    .filter((path) => !fs.existsSync(path));
}

function applyHtmlPlaceholders(
  html: string,
  nonce: string,
  cspSource: string,
  styleUri: string,
  scriptUri: string
): string {
  return html
    .replace(/{{appTitle}}/g, PUBLIC_WEBVIEW_BUILD_TITLE)
    .replace(/{{nonce}}/g, nonce)
    .replace(/{{cspSource}}/g, cspSource)
    .replace(/{{styleUri}}/g, styleUri)
    .replace(/{{scriptUri}}/g, scriptUri);
}

/**
 * Get the WebView HTML content by loading external files
 */
export function getChatHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
): string {
  const assets = resolveAssetUris(extensionUri);
  const missingFiles = collectMissingFiles([assets.css, assets.js]);
  if (missingFiles.length > 0) {
    return getMissingAssetHtml(missingFiles);
  }

  const styleUri = webview.asWebviewUri(assets.css).toString();
  const scriptUri = webview.asWebviewUri(assets.js).toString();
  const template = fs.readFileSync(assets.template.fsPath, "utf8");

  return applyHtmlPlaceholders(template, nonce, webview.cspSource, styleUri, scriptUri);
}
