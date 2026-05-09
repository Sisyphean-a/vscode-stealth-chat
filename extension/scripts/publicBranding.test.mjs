import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const brandingModulePath = path.resolve(currentDir, "../src/constants/branding.ts");
const runtimeFiles = [
  "../src/runtime/extensionRuntime.ts",
  "../src/services/socketService.ts",
  "../src/runtime/registerCommands.ts",
  "../src/ui/statusBar.ts",
  "../src/providers/chatViewProvider.ts",
  "../src/webview-bridge/chatContent.ts",
  "../src/webview-bridge/app.html",
];
const appHtmlPath = path.resolve(currentDir, "../src/webview-bridge/app.html");
const chatContentPath = path.resolve(currentDir, "../src/webview-bridge/chatContent.ts");

async function importTypeScriptModule(modulePath) {
  const source = await readFile(modulePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`;
  return import(moduleUrl);
}

const branding = await importTypeScriptModule(brandingModulePath);

assert.equal(branding.PUBLIC_BRAND_NAME, "Stealth Chat Client");
assert.equal(branding.PUBLIC_SHORT_DESCRIPTION, "A lightweight VS Code client for Stealth Chat.");
assert.equal(branding.PUBLIC_VIEW_TITLE, "Stealth Chat");
assert.equal(branding.PUBLIC_OUTPUT_CHANNEL_NAME, "Stealth Chat Client");
assert.equal(branding.PUBLIC_COMMAND_CATEGORY, "Stealth Chat");
assert.equal(branding.PUBLIC_CONNECTED_LOG, "Stealth Chat Client connected");
assert.equal(branding.PUBLIC_DISCONNECTED_LOG, "Stealth Chat Client disconnected");
assert.equal(branding.PUBLIC_CONNECTED_TOOLTIP, "Stealth Chat Client 已连接");
assert.equal(branding.PUBLIC_DISCONNECTED_TOOLTIP, "Stealth Chat Client 已断开");
assert.equal(branding.PUBLIC_CONNECTING_TOOLTIP, "Stealth Chat Client 连接中...");
assert.equal(branding.PUBLIC_WEBVIEW_BUILD_TITLE, "Stealth Chat");

for (const relativePath of runtimeFiles) {
  const filePath = path.resolve(currentDir, relativePath);
  const source = await readFile(filePath, "utf8");
  assert.equal(
    source.includes("TS-Lint Service"),
    false,
    `${relativePath} still contains legacy public brand text`,
  );
}

const appHtml = await readFile(appHtmlPath, "utf8");
assert.equal(appHtml.includes("<title>{{appTitle}}</title>"), true, "app.html should use appTitle placeholder");

const chatContentSource = await readFile(chatContentPath, "utf8");
assert.equal(
  chatContentSource.includes('.replace(/{{appTitle}}/g, PUBLIC_WEBVIEW_BUILD_TITLE)'),
  true,
  "chatContent.ts should inject appTitle from PUBLIC_WEBVIEW_BUILD_TITLE",
);

console.log("publicBranding test passed");
