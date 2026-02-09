/**
 * 图片预览面板
 */
import * as vscode from "vscode";
import { getNonce } from "../utils/helpers";

let currentPanel: vscode.WebviewPanel | undefined;

function escapeAttribute(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 打开图片预览面板（复用已有面板）
 */
export function openImagePreview(imageUrl: string): void {
  if (currentPanel) {
    const nonce = getNonce();
    currentPanel.webview.html = getImagePreviewHtml(imageUrl, nonce);
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "imagePreview",
    "Image Preview",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    }
  );

  const nonce = getNonce();
  currentPanel.webview.html = getImagePreviewHtml(imageUrl, nonce);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

function getImagePreviewHtml(imageUrl: string, nonce: string): string {
  return `<!DOCTYPE html>
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
    }
    img {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
      transition: transform 0.2s ease;
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
    <button id="zoom-in" title="放大">+</button>
    <button id="zoom-out" title="缩小">−</button>
    <button id="reset" title="重置">⟲</button>
  </div>
  <img id="preview-img" src="${escapeAttribute(imageUrl)}" alt="Preview">
  <div class="zoom-info" id="zoom-info">100%</div>
  <script nonce="${nonce}">
    const img = document.getElementById('preview-img');
    const zoomInfo = document.getElementById('zoom-info');
    let scale = 1;
    function updateZoom() {
      img.style.transform = 'scale(' + scale + ')';
      zoomInfo.textContent = Math.round(scale * 100) + '%';
    }
    document.getElementById('zoom-in').onclick = () => { scale = Math.min(scale + 0.25, 5); updateZoom(); };
    document.getElementById('zoom-out').onclick = () => { scale = Math.max(scale - 0.25, 0.25); updateZoom(); };
    document.getElementById('reset').onclick = () => { scale = 1; updateZoom(); };
  </script>
</body>
</html>`;
}
