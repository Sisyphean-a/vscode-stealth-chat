#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  emitRuntimeJs,
  emitProtocolRuntimeCjs,
  collapseBlankLines,
} = require("./generator/runtime");
const { emitHostWebviewDts, emitSocketDts } = require("./generator/types");
const {
  emitHostWebviewJs,
  emitSocketEventsJs,
  emitSocketEventsCjs,
} = require("./generator/wrappers");

const rootDir = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDir, "schema", "schema-source.json");
const generatedNote = "// AUTO-GENERATED FILE. DO NOT EDIT.\n";
const checkOnly = process.argv.includes("--check");

function readSchema() {
  const raw = fs.readFileSync(schemaPath, "utf8");
  return JSON.parse(raw);
}

function writeFile(targetPath, content) {
  const fullPath = path.join(rootDir, targetPath);
  if (checkOnly) {
    const current = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
    if (current !== content) {
      throw new Error(`Outdated generated file: ${targetPath}`);
    }
    return;
  }
  fs.writeFileSync(fullPath, content, "utf8");
}

function buildOutputs(schema) {
  return {
    "protocol-runtime.js": collapseBlankLines(emitRuntimeJs(schema, generatedNote)),
    "protocol-runtime.cjs": collapseBlankLines(emitProtocolRuntimeCjs(schema, generatedNote)),
    "host-webview.js": emitHostWebviewJs(generatedNote),
    "socket-events.js": emitSocketEventsJs(generatedNote),
    "socket-events.cjs": emitSocketEventsCjs(generatedNote),
    "host-webview.d.ts": emitHostWebviewDts(schema, generatedNote),
    "socket-events.d.ts": emitSocketDts(schema, generatedNote),
  };
}

function main() {
  const schema = readSchema();
  const outputs = buildOutputs(schema);
  for (const [targetPath, content] of Object.entries(outputs)) {
    writeFile(targetPath, content);
  }
  if (!checkOnly) {
    console.log("[protocol] generated successfully");
  }
}

try {
  main();
} catch (error) {
  console.error(`[protocol] generation failed: ${error.message}`);
  process.exit(1);
}
