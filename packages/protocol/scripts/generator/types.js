function toTsType(node) {
  if (!node || typeof node !== "object") {
    return "unknown";
  }
  if (node.kind === "ref") {
    return node.name;
  }
  if (node.kind === "unknown") {
    return "unknown";
  }
  if (node.kind === "string") {
    return "string";
  }
  if (node.kind === "number") {
    return "number";
  }
  if (node.kind === "boolean") {
    return "boolean";
  }
  if (node.kind === "literal") {
    return node.value === null ? "null" : JSON.stringify(node.value);
  }
  if (node.kind === "enum") {
    return node.values.map((item) => JSON.stringify(item)).join(" | ");
  }
  if (node.kind === "array") {
    return `Array<${toTsType(node.items)}>`;
  }
  if (node.kind === "union") {
    return node.anyOf.map((item) => toTsType(item)).join(" | ");
  }
  if (node.kind !== "object") {
    return "unknown";
  }

  const requiredSet = new Set(node.required || []);
  const entries = Object.entries(node.properties || {});
  if (entries.length === 0) {
    return "Record<string, never>";
  }

  const fields = entries.map(([name, schema]) => {
    const isRequired = requiredSet.has(name);
    const safeName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    const optionalFlag = isRequired ? "" : "?";
    return `${safeName}${optionalFlag}: ${toTsType(schema)};`;
  });

  return `{ ${fields.join(" ")} }`;
}

function emitSharedTypes(schema) {
  const lines = [];
  for (const [name, node] of Object.entries(schema.defs)) {
    lines.push(`export type ${name} = ${toTsType(node)};`);
  }
  return lines.join("\n");
}

function emitMessageBodyUnion(name, items) {
  const variants = items.map((item) => {
    if (!Object.prototype.hasOwnProperty.call(item, "payload")) {
      return `{ type: ${JSON.stringify(item.type)} }`;
    }
    return `{ type: ${JSON.stringify(item.type)}; payload: ${toTsType(item.payload)} }`;
  });
  return `export type ${name} =\n  | ${variants.join("\n  | ")};`;
}

function emitEnvelopeUnion(name, discriminatorKey, items) {
  const variants = items.map((item) => {
    const prefix = `v: 2; traceId: string; sentAt: number; ${discriminatorKey}: ${JSON.stringify(item.type)}`;
    if (!Object.prototype.hasOwnProperty.call(item, "payload")) {
      return `{ ${prefix} }`;
    }
    return `{ ${prefix}; payload: ${toTsType(item.payload)} }`;
  });
  return `export type ${name} =\n  | ${variants.join("\n  | ")};`;
}

function emitTupleConst(name, values) {
  const rendered = values.map((value) => JSON.stringify(value)).join(", ");
  return `export const ${name}: readonly [${rendered}];`;
}

function emitHostWebviewDts(schema, generatedNote) {
  const shared = emitSharedTypes(schema);
  const webviewBodyUnion = emitMessageBodyUnion("WebviewMessageBody", schema.webviewMessages);
  const hostBodyUnion = emitMessageBodyUnion("HostMessageBody", schema.hostMessages);
  const webviewUnion = emitEnvelopeUnion("WebviewMessage", "type", schema.webviewMessages);
  const hostUnion = emitEnvelopeUnion("HostMessage", "type", schema.hostMessages);
  const webviewTypes = schema.webviewMessages.map((item) => item.type);
  const hostTypes = schema.hostMessages.map((item) => item.type);

  return `${generatedNote}${shared}

${emitTupleConst("KNOWN_WEBVIEW_TYPES", webviewTypes)}
${emitTupleConst("KNOWN_HOST_TYPES", hostTypes)}

${webviewBodyUnion}

${hostBodyUnion}

${webviewUnion}

${hostUnion}

export function isMessageEnvelope(value: unknown): value is {
  v: 2;
  type: string;
  traceId: string;
  sentAt: number;
  payload?: unknown;
};
export function parseWebviewMessage(raw: unknown): WebviewMessage;
export function parseHostMessage(raw: unknown): HostMessage;
export function isWebviewMessage(raw: unknown): raw is WebviewMessage;
export function isHostMessage(raw: unknown): raw is HostMessage;
export function buildWebviewMessage(
  message: WebviewMessageBody,
  options?: { traceId?: string; sentAt?: number }
): WebviewMessage;
export function buildHostMessage(
  message: HostMessageBody,
  options?: { traceId?: string; sentAt?: number }
): HostMessage;
`;
}

function emitSocketDts(schema, generatedNote) {
  const shared = emitSharedTypes(schema);
  const socketEventEntries = Object.entries(schema.socketEvents)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)};`)
    .join("\n");
  const clientMap = Object.entries(schema.socketClientPayloads)
    .map(([event, node]) => `  ${JSON.stringify(event)}: ${toTsType(node)};`)
    .join("\n");
  const serverMap = Object.entries(schema.socketServerPayloads)
    .map(([event, node]) => `  ${JSON.stringify(event)}: ${toTsType(node)};`)
    .join("\n");
  const clientEnvelopeMap = Object.entries(schema.socketClientPayloads)
    .map(([event, node]) => `  ${JSON.stringify(event)}: SocketEnvelope<${JSON.stringify(event)}, ${toTsType(node)}>;`)
    .join("\n");
  const serverEnvelopeMap = Object.entries(schema.socketServerPayloads)
    .map(([event, node]) => `  ${JSON.stringify(event)}: SocketEnvelope<${JSON.stringify(event)}, ${toTsType(node)}>;`)
    .join("\n");
  const ackMap = Object.entries(schema.socketAckData)
    .map(([event, node]) => `  ${JSON.stringify(event)}: ${toTsType(node)};`)
    .join("\n");

  return `${generatedNote}${shared}

export const SOCKET_EVENTS: Readonly<{
${socketEventEntries}
}>;

export type SocketClientPayloadMap = {
${clientMap}
};

export type SocketServerPayloadMap = {
${serverMap}
};

export type SocketEnvelope<E extends string, P> = {
  v: 2;
  event: E;
  traceId: string;
  sentAt: number;
  sessionId?: string;
  payload: P;
};

export type SocketClientEnvelopeMap = {
${clientEnvelopeMap}
};

export type SocketServerEnvelopeMap = {
${serverEnvelopeMap}
};

export type SocketAckDataMap = {
${ackMap}
};

export type SocketAckMeta = {
  code: string;
  message: string;
  traceId: string;
  serverTime: number;
};
export type SocketAckOk<T> = SocketAckMeta & { ok: true; data: T };
export type SocketAckError = SocketAckMeta & { ok: false; data?: unknown };
export type SocketAck<T> = SocketAckOk<T> | SocketAckError;

export function parseSocketClientPayload<E extends keyof SocketClientPayloadMap>(
  event: E,
  payload: unknown
): SocketClientEnvelopeMap[E];

export function parseSocketServerPayload<E extends keyof SocketServerPayloadMap>(
  event: E,
  payload: unknown
): SocketServerEnvelopeMap[E];

export function parseSocketAck<E extends keyof SocketAckDataMap>(
  event: E,
  ack: unknown
): SocketAck<SocketAckDataMap[E]>;

export function buildSocketClientEnvelope<E extends keyof SocketClientPayloadMap>(
  event: E,
  payload: SocketClientPayloadMap[E],
  options?: { traceId?: string; sentAt?: number; sessionId?: string }
): SocketClientEnvelopeMap[E];

export function buildSocketServerEnvelope<E extends keyof SocketServerPayloadMap>(
  event: E,
  payload: SocketServerPayloadMap[E],
  options?: { traceId?: string; sentAt?: number; sessionId?: string }
): SocketServerEnvelopeMap[E];

export function buildAckOk<T>(options: {
  traceId: string;
  data: T;
  message?: string;
  serverTime?: number;
}): SocketAckOk<T>;
export function buildAckError(options: {
  traceId: string;
  code: string;
  message: string;
  data?: unknown;
  serverTime?: number;
}): SocketAckError;
export function isAckOk<T = unknown>(ack: unknown): ack is SocketAckOk<T>;
export function getAckData<T = unknown>(ack: unknown): T | null;
export function getAckErrorMessage(ack: unknown, fallback?: string): string;
`;
}

module.exports = {
  emitHostWebviewDts,
  emitSocketDts,
};
