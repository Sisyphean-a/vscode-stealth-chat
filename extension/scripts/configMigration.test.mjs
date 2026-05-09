import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(currentDir, "../src/services");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "config-migration-test-"));

async function transpileModule(filename) {
  const sourcePath = path.join(sourceDir, filename);
  const source = await readFile(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  });
  await writeFile(path.join(tempDir, filename.replace(/\.ts$/, ".js")), transpiled.outputText, "utf8");
}

try {
  await transpileModule("configNamespace.ts");
  await transpileModule("configMigration.ts");

  const modulePath = path.join(tempDir, "configMigration.js");
  const migrationModule = await import(`file://${modulePath.replace(/\\/g, "/")}`);
  const {
    buildConfigMigrationUpdates,
    buildCursorStateMigrationUpdate,
  } = migrationModule;

  assert.deepEqual(
    buildConfigMigrationUpdates({
      currentValues: {
        serverUrl: "",
        secret: "",
        forceWebsocket: undefined,
        autoReveal: false,
        displayMode: "",
        connections: [],
        activeConnection: "",
        backgroundSyncEnabled: undefined,
        backgroundSyncIntervalMs: undefined,
      },
      legacyValues: {
        serverUrl: "http://legacy.example",
        secret: "legacy-secret",
        forceWebsocket: false,
        autoReveal: true,
        displayMode: "log",
        connections: [{ name: "legacy", token: "t" }],
        activeConnection: "legacy",
        backgroundSyncEnabled: false,
        backgroundSyncIntervalMs: 5000,
      },
      legacyExists: {
        serverUrl: true,
        secret: true,
        forceWebsocket: true,
        autoReveal: true,
        displayMode: true,
        connections: true,
        activeConnection: true,
        backgroundSyncEnabled: true,
        backgroundSyncIntervalMs: true,
      },
    }),
    [
      { key: "serverUrl", value: "http://legacy.example" },
      { key: "secret", value: "legacy-secret" },
      { key: "forceWebsocket", value: false },
      { key: "displayMode", value: "log" },
      { key: "connections", value: [{ name: "legacy", token: "t" }] },
      { key: "activeConnection", value: "legacy" },
      { key: "backgroundSyncEnabled", value: false },
      { key: "backgroundSyncIntervalMs", value: 5000 },
    ],
  );

  assert.deepEqual(
    buildConfigMigrationUpdates({
      currentValues: {
        serverUrl: "http://current.example",
        connections: [{ name: "current", token: "x" }],
        backgroundSyncEnabled: true,
      },
      legacyValues: {
        serverUrl: "http://legacy.example",
        connections: [{ name: "legacy", token: "t" }],
        backgroundSyncEnabled: false,
      },
      legacyExists: {
        serverUrl: true,
        connections: true,
        backgroundSyncEnabled: true,
      },
    }),
    [],
  );

  assert.deepEqual(
    buildCursorStateMigrationUpdate(
      {},
      { alpha: { timestamp: 1, id: 2 } },
    ),
    { alpha: { timestamp: 1, id: 2 } },
  );

  assert.equal(
    buildCursorStateMigrationUpdate(
      { alpha: { timestamp: 2, id: 3 } },
      { beta: { timestamp: 1, id: 2 } },
    ),
    undefined,
  );

  console.log("configMigration test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
