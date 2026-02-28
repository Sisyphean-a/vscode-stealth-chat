const fs = require("fs");
const path = require("path");

const runtimeTemplate = fs.readFileSync(path.join(__dirname, "runtime-template.txt"), "utf8");

function createObjectMap(items) {
  const map = {};
  for (const item of items) {
    map[item.type] = Object.prototype.hasOwnProperty.call(item, "payload")
      ? { payload: item.payload }
      : {};
  }
  return map;
}

function buildRuntimePayload(schema) {
  return {
    defs: schema.defs,
    webviewMap: createObjectMap(schema.webviewMessages),
    hostMap: createObjectMap(schema.hostMessages),
    socketEvents: schema.socketEvents,
    socketClientPayloads: schema.socketClientPayloads,
    socketServerPayloads: schema.socketServerPayloads,
    socketAckData: schema.socketAckData,
  };
}

function emitRuntimeJs(schema, generatedNote) {
  const body = runtimeTemplate.replace("__SCHEMA_JSON__", JSON.stringify(buildRuntimePayload(schema)));
  return `${generatedNote}${body}`;
}

function emitProtocolRuntimeCjs(schema, generatedNote) {
  const esm = emitRuntimeJs(schema, generatedNote);
  return esm.replace(/export \{([\s\S]*?)\};\s*$/m, "module.exports = {$1};");
}

function collapseBlankLines(content) {
  return content.replace(/\n{2,}/g, "\n");
}

module.exports = {
  emitRuntimeJs,
  emitProtocolRuntimeCjs,
  collapseBlankLines,
};
