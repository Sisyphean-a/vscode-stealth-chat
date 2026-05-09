import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(currentDir, "..");
const packageJson = JSON.parse(
  await readFile(path.join(extensionDir, "package.json"), "utf8"),
);
const readme = await readFile(path.join(extensionDir, "README.md"), "utf8");

assert.equal(packageJson.name, "stealth-chat-client");
assert.equal(packageJson.displayName, "Stealth Chat Client");
assert.equal(packageJson.description, "A lightweight VS Code client for Stealth Chat.");
assert.equal(packageJson.icon, "media/icon.png");
assert.equal(packageJson.qna, false);
assert.equal(packageJson.contributes.viewsContainers.activitybar[0].title, "Bridge");
assert.equal(packageJson.contributes.viewsContainers.activitybar[0].icon, "$(check)");
assert.equal(packageJson.contributes.views.tsLintService[0].name, "Panel");
assert.equal(packageJson.contributes.configuration.title, "Stealth Chat Client");
assert.deepEqual(packageJson.galleryBanner, { color: "#E9E1D3", theme: "light" });
assert.ok(Array.isArray(packageJson.keywords) && packageJson.keywords.includes("chat client"));
assert.ok(
  Object.keys(packageJson.contributes.configuration.properties).every((key) => key.startsWith("stealthChat.")),
);

assert.ok(readme.includes("# Stealth Chat Client"));
assert.ok(readme.includes("stealthChat.serverUrl"));
assert.ok(readme.includes("`Bridge`"));
assert.ok(readme.includes("Legacy `tsLint.*` settings are migrated"));

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
  await access(path.join(extensionDir, file));
}

console.log("marketplace assets test passed");
