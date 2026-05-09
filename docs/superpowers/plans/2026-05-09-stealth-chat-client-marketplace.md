# Stealth Chat Client Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 VS Code 扩展整理成可公开发布的 `Stealth Chat Client`，补齐品牌文案、配置兼容迁移、商店文档与素材，并通过 VSIX 打包验证。

**Architecture:** 先抽出扩展公开品牌常量，统一替换所有用户可见名称；再引入新的 `stealthChat.*` 配置命名空间和只迁移不删除的兼容层，确保老用户升级不丢配置；最后补齐 Marketplace 元数据、文档和媒体资源，并用脚本验证商店必需文件与打包结果。

**Tech Stack:** TypeScript、Svelte Webview、VS Code Extension API、Node.js `assert` 测试脚本、VSIX (`vsce`)、PNG/SVG 商店素材

---

## File Structure

### Create

- `extension/src/constants/branding.ts`
- `extension/src/services/configNamespace.ts`
- `extension/src/services/configMigration.ts`
- `extension/scripts/publicBranding.test.mjs`
- `extension/scripts/configMigration.test.mjs`
- `extension/scripts/marketplaceAssets.test.mjs`
- `extension/README.md`
- `extension/CHANGELOG.md`
- `extension/SUPPORT.md`
- `extension/media/icon.png`
- `extension/media/activitybar-icon.svg`
- `extension/media/marketplace-cover.png`
- `extension/media/screenshot-chat.png`
- `extension/media/screenshot-settings.png`

### Modify

- `extension/package.json`
- `extension/.vscodeignore`
- `extension/src/extension.ts`
- `extension/src/runtime/extensionRuntime.ts`
- `extension/src/runtime/configWatcher.ts`
- `extension/src/runtime/registerCommands.ts`
- `extension/src/services/configService.ts`
- `extension/src/services/backgroundSyncService.ts`
- `extension/src/services/socketService.ts`
- `extension/src/providers/chatViewProvider.ts`
- `extension/src/ui/statusBar.ts`
- `extension/src/utils/helpers.ts`
- `extension/src/webview-bridge/chatContent.ts`
- `extension/src/webview-bridge/app.html`

---

### Task 1: 统一公开品牌与运行时文案

**Files:**
- Create: `extension/src/constants/branding.ts`
- Test: `extension/scripts/publicBranding.test.mjs`
- Modify: `extension/src/runtime/extensionRuntime.ts`
- Modify: `extension/src/services/socketService.ts`
- Modify: `extension/src/runtime/registerCommands.ts`
- Modify: `extension/src/ui/statusBar.ts`
- Modify: `extension/src/providers/chatViewProvider.ts`
- Modify: `extension/src/webview-bridge/chatContent.ts`
- Modify: `extension/src/webview-bridge/app.html`

- [ ] **Step 1: 写公开品牌回归测试**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const brandingPath = path.resolve(currentDir, "../src/constants/branding.ts");
const source = await readFile(brandingPath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`;
const branding = await import(moduleUrl);

assert.equal(branding.PUBLIC_BRAND_NAME, "Stealth Chat Client");
assert.equal(branding.PUBLIC_SHORT_DESCRIPTION, "A lightweight VS Code client for Stealth Chat.");
assert.equal(branding.PUBLIC_VIEW_TITLE, "Stealth Chat");
assert.equal(branding.PUBLIC_OUTPUT_CHANNEL_NAME, "Stealth Chat Client");

console.log("public branding test passed");
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node ./scripts/publicBranding.test.mjs`

Expected: `ENOENT` 或导出断言失败，因为 `extension/src/constants/branding.ts` 还不存在。

- [ ] **Step 3: 实现品牌常量文件**

```ts
export const PUBLIC_BRAND_NAME = "Stealth Chat Client";
export const PUBLIC_SHORT_DESCRIPTION = "A lightweight VS Code client for Stealth Chat.";
export const PUBLIC_VIEW_TITLE = "Stealth Chat";
export const PUBLIC_OUTPUT_CHANNEL_NAME = PUBLIC_BRAND_NAME;
export const PUBLIC_COMMAND_CATEGORY = "Stealth Chat";
export const PUBLIC_CONNECTED_LOG = `${PUBLIC_BRAND_NAME} connected`;
export const PUBLIC_DISCONNECTED_LOG = `${PUBLIC_BRAND_NAME} disconnected`;
export const PUBLIC_CONNECTED_TOOLTIP = `${PUBLIC_BRAND_NAME} 已连接`;
export const PUBLIC_DISCONNECTED_TOOLTIP = `${PUBLIC_BRAND_NAME} 已断开`;
export const PUBLIC_CONNECTING_TOOLTIP = "正在连接 Stealth Chat 服务端...";
export const PUBLIC_WEBVIEW_BUILD_TITLE = PUBLIC_BRAND_NAME;
```

- [ ] **Step 4: 把公开文案统一切到品牌常量**

```ts
// extension/src/runtime/extensionRuntime.ts
import { PUBLIC_OUTPUT_CHANNEL_NAME } from "../constants/branding";

const OUTPUT_CHANNEL_NAME = PUBLIC_OUTPUT_CHANNEL_NAME;
```

```ts
// extension/src/services/socketService.ts
import {
  PUBLIC_CONNECTED_LOG,
  PUBLIC_CONNECTED_TOOLTIP,
  PUBLIC_DISCONNECTED_LOG,
  PUBLIC_DISCONNECTED_TOOLTIP,
} from "../constants/branding";

historyLogger.logInfo(PUBLIC_CONNECTED_LOG);
statusBar.setTooltip(PUBLIC_CONNECTED_TOOLTIP);
historyLogger.logInfo(PUBLIC_DISCONNECTED_LOG);
statusBar.setTooltip(PUBLIC_DISCONNECTED_TOOLTIP);
```

```ts
// extension/src/runtime/registerCommands.ts
const selected = await vscode.window.showQuickPick(items, {
  placeHolder: "选择 Stealth Chat 连接",
});

const message = await vscode.window.showInputBox({
  placeHolder: "发送一条消息...",
  ignoreFocusOut: true,
});
```

```ts
// extension/src/webview-bridge/chatContent.ts + app.html
<title>Stealth Chat Client</title>
```

- [ ] **Step 5: 重新运行品牌测试**

Run: `node ./scripts/publicBranding.test.mjs`

Expected: `public branding test passed`

- [ ] **Step 6: 提交这一任务**

```bash
git add extension/src/constants/branding.ts \
  extension/scripts/publicBranding.test.mjs \
  extension/src/runtime/extensionRuntime.ts \
  extension/src/services/socketService.ts \
  extension/src/runtime/registerCommands.ts \
  extension/src/ui/statusBar.ts \
  extension/src/providers/chatViewProvider.ts \
  extension/src/webview-bridge/chatContent.ts \
  extension/src/webview-bridge/app.html
git commit -m "refactor: rebrand extension public copy"
```

---

### Task 2: 迁移配置命名空间到 `stealthChat.*`

**Files:**
- Create: `extension/src/services/configNamespace.ts`
- Create: `extension/src/services/configMigration.ts`
- Test: `extension/scripts/configMigration.test.mjs`
- Modify: `extension/src/extension.ts`
- Modify: `extension/src/services/configService.ts`
- Modify: `extension/src/utils/helpers.ts`
- Modify: `extension/src/runtime/configWatcher.ts`
- Modify: `extension/src/runtime/registerCommands.ts`
- Modify: `extension/src/runtime/extensionRuntime.ts`
- Modify: `extension/src/providers/chatViewProvider.ts`
- Modify: `extension/src/services/backgroundSyncService.ts`

- [ ] **Step 1: 写配置迁移的纯逻辑测试**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(currentDir, "../src/services/configMigration.ts");
const source = await readFile(modulePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`;
const migration = await import(moduleUrl);

const next = migration.buildConfigMigrationUpdates(
  {
    serverUrl: undefined,
    secret: undefined,
    activeConnection: "",
  },
  {
    serverUrl: "http://localhost:3000",
    secret: "token-1",
    activeConnection: "本地默认",
  },
);

assert.deepEqual(next, [
  ["serverUrl", "http://localhost:3000"],
  ["secret", "token-1"],
  ["activeConnection", "本地默认"],
]);

assert.equal(
  migration.resolveCursorStateForMigration(undefined, { demo: { timestamp: 1, id: 2 } }).demo.id,
  2,
);

console.log("config migration test passed");
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node ./scripts/configMigration.test.mjs`

Expected: `ENOENT` 或模块导出缺失，因为迁移模块尚不存在。

- [ ] **Step 3: 实现命名空间常量和迁移助手**

```ts
// extension/src/services/configNamespace.ts
export const CURRENT_CONFIG_NAMESPACE = "stealthChat";
export const LEGACY_CONFIG_NAMESPACE = "tsLint";
export const CURRENT_CURSOR_STATE_KEY = "stealthChat.backgroundSyncCursors";
export const LEGACY_CURSOR_STATE_KEY = "tsLint.backgroundSyncCursors";

export const CONFIG_KEYS = [
  "serverUrl",
  "secret",
  "forceWebsocket",
  "autoReveal",
  "displayMode",
  "connections",
  "activeConnection",
  "backgroundSyncEnabled",
  "backgroundSyncIntervalMs",
] as const;
```

```ts
// extension/src/services/configMigration.ts
export function buildConfigMigrationUpdates(
  current: Partial<Record<string, unknown>>,
  legacy: Partial<Record<string, unknown>>,
): Array<[string, unknown]> {
  return Object.keys(legacy).flatMap((key) => {
    const nextValue = legacy[key];
    const currentValue = current[key];
    if (currentValue !== undefined && currentValue !== "") {
      return [];
    }
    if (nextValue === undefined || nextValue === "") {
      return [];
    }
    return [[key, nextValue]];
  });
}

export function resolveCursorStateForMigration<T>(
  currentValue: T | undefined,
  legacyValue: T | undefined,
): T | undefined {
  return currentValue ?? legacyValue;
}
```

- [ ] **Step 4: 在运行时引入迁移并统一读取新前缀**

```ts
// extension/src/extension.ts
import { migrateLegacyConfiguration } from "./services/configMigration";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateLegacyConfiguration(context.globalState);
  runtime = new ExtensionRuntime(context);
  await runtime.activate();
}
```

```ts
// extension/src/services/configService.ts
const config = vscode.workspace.getConfiguration(CURRENT_CONFIG_NAMESPACE);
const legacy = vscode.workspace.getConfiguration(LEGACY_CONFIG_NAMESPACE);
const serverUrl = normalizeServerUrl(
  config.get<string>("serverUrl")
  || legacy.get<string>("serverUrl")
  || DEFAULT_SERVER_URL,
);
```

```ts
// extension/src/runtime/configWatcher.ts
event.affectsConfiguration("stealthChat.activeConnection")
|| event.affectsConfiguration("tsLint.activeConnection")
```

```ts
// extension/src/services/backgroundSyncService.ts
const CURSOR_STATE_KEY = CURRENT_CURSOR_STATE_KEY;
```

- [ ] **Step 5: 运行迁移测试并做类型检查**

Run: `node ./scripts/configMigration.test.mjs`

Expected: `config migration test passed`

Run: `npm run check-types`

Expected: `protocol` smoke tests 全部通过，`tsc --noEmit` 通过。

- [ ] **Step 6: 提交这一任务**

```bash
git add extension/src/services/configNamespace.ts \
  extension/src/services/configMigration.ts \
  extension/scripts/configMigration.test.mjs \
  extension/src/extension.ts \
  extension/src/services/configService.ts \
  extension/src/utils/helpers.ts \
  extension/src/runtime/configWatcher.ts \
  extension/src/runtime/registerCommands.ts \
  extension/src/runtime/extensionRuntime.ts \
  extension/src/providers/chatViewProvider.ts \
  extension/src/services/backgroundSyncService.ts
git commit -m "feat: migrate extension settings namespace"
```

---

### Task 3: 补齐 Marketplace 元数据、文档与媒体资源

**Files:**
- Test: `extension/scripts/marketplaceAssets.test.mjs`
- Create: `extension/README.md`
- Create: `extension/CHANGELOG.md`
- Create: `extension/SUPPORT.md`
- Create: `extension/media/icon.png`
- Create: `extension/media/activitybar-icon.svg`
- Create: `extension/media/marketplace-cover.png`
- Create: `extension/media/screenshot-chat.png`
- Create: `extension/media/screenshot-settings.png`
- Modify: `extension/package.json`
- Modify: `extension/.vscodeignore`

- [ ] **Step 1: 写 Marketplace 资产检查脚本**

```js
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const pkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));

assert.equal(pkg.name, "stealth-chat-client");
assert.equal(pkg.displayName, "Stealth Chat Client");
assert.equal(pkg.icon, "media/icon.png");
assert.deepEqual(pkg.galleryBanner, { color: "#E9E1D3", theme: "light" });
assert.equal(pkg.qna, false);
assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.includes("chat client"));

for (const file of [
  "README.md",
  "CHANGELOG.md",
  "SUPPORT.md",
  "media/icon.png",
  "media/activitybar-icon.svg",
  "media/marketplace-cover.png",
  "media/screenshot-chat.png",
  "media/screenshot-settings.png",
]) {
  await access(path.join(rootDir, file));
}

console.log("marketplace assets test passed");
```

- [ ] **Step 2: 运行检查，确认当前失败**

Run: `node ./scripts/marketplaceAssets.test.mjs`

Expected: manifest 字段断言失败或文件不存在。

- [ ] **Step 3: 更新扩展 manifest 与 `.vscodeignore`**

```json
{
  "name": "stealth-chat-client",
  "displayName": "Stealth Chat Client",
  "description": "A lightweight VS Code client for Stealth Chat.",
  "icon": "media/icon.png",
  "galleryBanner": {
    "color": "#E9E1D3",
    "theme": "light"
  },
  "keywords": ["stealth chat", "chat client", "messages", "socket.io", "companion"],
  "bugs": {
    "url": "https://github.com/Sisyphean-a/vscode-stealth-chat/issues"
  },
  "homepage": "https://github.com/Sisyphean-a/vscode-stealth-chat/tree/master/extension",
  "qna": false
}
```

```txt
# extension/.vscodeignore
*.md
!README.md
!CHANGELOG.md
!SUPPORT.md
```

- [ ] **Step 4: 写扩展专用文档**

```md
# Stealth Chat Client

A lightweight VS Code client for Stealth Chat.

## Features

- Real-time messaging inside VS Code
- Inline image messages and preview
- Multiple connections with quick switching
- Optional background sync

## Quick Start

1. Make sure your Stealth Chat server is already running.
2. Open the Stealth Chat view in the Activity Bar.
3. Set `stealthChat.serverUrl` and `stealthChat.connections`.
4. Start chatting.
```

```md
# Changelog

## 1.0.0

- Rebrand the extension as Stealth Chat Client
- Add Marketplace-ready docs and media assets
- Migrate public settings from `tsLint.*` to `stealthChat.*`
```

```md
# Support

Report issues at:

- https://github.com/Sisyphean-a/vscode-stealth-chat/issues

Please include:

- VS Code version
- Extension version
- Active server URL
- Relevant logs or screenshots
```

- [ ] **Step 5: 生成和保存商店素材**

Use `imagegen` skill with this exact prompt for `extension/media/icon.png`:

```text
Create a 256x256 PNG icon for a VS Code extension named "Stealth Chat Client".
Style: extremely minimal, quiet, low-profile companion tool.
Composition: warm off-white background, one thin dark graphite chat bubble outline, one short horizontal line inside the bubble, generous whitespace, no gradients, no 3D, no gloss, no emoji, no extra symbols, no text.
```

Use `imagegen` skill with this exact prompt for `extension/media/marketplace-cover.png`:

```text
Create a 1280x640 PNG marketplace cover for a VS Code extension named "Stealth Chat Client".
Style: minimalist product banner, warm beige background, dark graphite typography, one simple framed interface silhouette, no marketing badges, no loud colors.
Text on image:
Stealth Chat Client
A lightweight VS Code client for Stealth Chat
```

Create `extension/media/activitybar-icon.svg` manually:

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 7.5C6 6.119 7.119 5 8.5 5H15.5C16.881 5 18 6.119 18 7.5V12.5C18 13.881 16.881 15 15.5 15H11L7.5 18V15.75C6.672 15.389 6 14.55 6 13.5V7.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9 9.75H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

Capture two real screenshots after branding changes:

Run: `npm run compile`

Then launch the Extension Development Host, open the chat view and settings view, and save screenshots to:

- `extension/media/screenshot-chat.png`
- `extension/media/screenshot-settings.png`

- [ ] **Step 6: 重新运行 Marketplace 检查**

Run: `node ./scripts/marketplaceAssets.test.mjs`

Expected: `marketplace assets test passed`

- [ ] **Step 7: 提交这一任务**

```bash
git add extension/package.json \
  extension/.vscodeignore \
  extension/README.md \
  extension/CHANGELOG.md \
  extension/SUPPORT.md \
  extension/media \
  extension/scripts/marketplaceAssets.test.mjs
git commit -m "feat: add marketplace metadata and assets"
```

---

### Task 4: 验证 VSIX 打包结果并收尾

**Files:**
- Verify: `extension/package.json`
- Verify: `extension/.vscodeignore`
- Verify: `extension/dist/**`
- Verify: `extension/stealth-chat-client-1.0.0.vsix`

- [ ] **Step 1: 运行扩展级完整验证**

Run: `npm run check-types`

Expected:

- `[protocol] generated successfully`
- `All protocol boundary smoke tests passed`
- `tsc --noEmit` exit code `0`

- [ ] **Step 2: 重新生成 VSIX**

Run: `npm run vsix:package`

Expected:

- `Packaged: .../extension/stealth-chat-client-1.0.0.vsix`
- 输出树里包含 `README.md`、`CHANGELOG.md`、`SUPPORT.md`、`media/`
- 不包含 `src/**`、测试脚本和多余开发文件

- [ ] **Step 3: 检查 VSIX 文件清单**

Run: `npm run vsix:list`

Expected: 树状输出中至少出现：

- `extension/README.md`
- `extension/CHANGELOG.md`
- `extension/SUPPORT.md`
- `extension/media/icon.png`
- `extension/media/activitybar-icon.svg`
- `extension/media/marketplace-cover.png`

- [ ] **Step 4: 检查工作区状态**

Run: `git status --short`

Expected: 只剩下本轮实现相关改动；没有意外生成物或未跟踪垃圾文件。

- [ ] **Step 5: 提交最终收尾**

```bash
git add extension
git commit -m "chore: prepare extension for marketplace release"
```

- [ ] **Step 6: 准备发布说明**

```md
## Summary

- rebrand the public extension as Stealth Chat Client
- migrate settings from `tsLint.*` to `stealthChat.*` with compatibility
- add Marketplace-ready docs, icon, cover image, and screenshots

## Verification

- `node extension/scripts/publicBranding.test.mjs`
- `node extension/scripts/configMigration.test.mjs`
- `node extension/scripts/marketplaceAssets.test.mjs`
- `npm run -w extension check-types`
- `npm run -w extension vsix:package`
- `npm run -w extension vsix:list`
```

---

## Self-Review

- 覆盖 spec 的 3 个核心要求：去伪装命名、配置兼容迁移、商店资产补齐。
- 计划没有使用占位词。
- 每个任务都给出了明确文件路径、测试命令和提交边界。
