import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(currentDir, "../src/webview-svelte/lib/logLayout.ts");
const source = await readFile(modulePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`;
const { LOG_IMAGE_FILENAME_MAX_LENGTH, buildLogImageTagTitle, formatLogImageLabel } = await import(
  moduleUrl
);

assert.equal(formatLogImageLabel("photo.jpg"), "[IMG:photo.jpg]");
assert.equal(formatLogImageLabel(), "[IMG:image.png]");

const longFilename = "Screenshot_2026-05-08-10-58-30-413_com.tencent.mm.jpg";
const longLabel = formatLogImageLabel(longFilename);

assert.ok(longLabel.startsWith("[IMG:"));
assert.ok(longLabel.endsWith("]"));
assert.ok(longLabel.includes("..."));
assert.ok(longLabel.length <= LOG_IMAGE_FILENAME_MAX_LENGTH + 6);
assert.equal(buildLogImageTagTitle(longFilename), longFilename);

console.log("logLayout test passed");
