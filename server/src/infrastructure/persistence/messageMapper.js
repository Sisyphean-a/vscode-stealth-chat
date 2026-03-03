const VALID_QUOTE_SOURCES = new Set(["mobile", "vscode"]);

function parsePositiveMessageId(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCursor(cursor = {}) {
  const timestamp = Number.parseInt(String(cursor.timestamp ?? cursor.ts ?? ""), 10);
  const id = parsePositiveMessageId(cursor.id);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !id) {
    return { timestamp: 0, id: 0 };
  }
  return { timestamp, id };
}

function buildMessageRowLabel(rowId) {
  return `message#${parsePositiveMessageId(rowId) || "unknown"}`;
}

function normalizeAttachment(rawAttachment, rowLabel, index) {
  if (!rawAttachment || typeof rawAttachment !== "object" || Array.isArray(rawAttachment)) {
    throw new Error(`[DB] Invalid attachment at ${rowLabel}.attachments[${index}]`);
  }

  const type = typeof rawAttachment.type === "string" ? rawAttachment.type.trim() : "";
  if (!type) {
    throw new Error(`[DB] Invalid attachment type at ${rowLabel}.attachments[${index}]`);
  }

  const attachment = { type };
  copyAttachmentStringFields(rawAttachment, attachment, rowLabel, index);
  copyAttachmentSizeField(rawAttachment, attachment, rowLabel, index);
  return attachment;
}

function copyAttachmentStringFields(rawAttachment, attachment, rowLabel, index) {
  const keys = ["data", "url", "filename", "mimeType"];
  for (const key of keys) {
    if (rawAttachment[key] === undefined) {
      continue;
    }
    if (typeof rawAttachment[key] !== "string") {
      throw new Error(`[DB] Invalid attachment field ${key} at ${rowLabel}.attachments[${index}]`);
    }
    attachment[key] = rawAttachment[key];
  }
}

function copyAttachmentSizeField(rawAttachment, attachment, rowLabel, index) {
  if (rawAttachment.size === undefined) {
    return;
  }
  if (typeof rawAttachment.size !== "number" || !Number.isFinite(rawAttachment.size)) {
    throw new Error(`[DB] Invalid attachment size at ${rowLabel}.attachments[${index}]`);
  }
  attachment.size = rawAttachment.size;
}

function normalizeAttachments(rawAttachments, rowLabel) {
  if (rawAttachments === undefined) {
    return undefined;
  }
  if (!Array.isArray(rawAttachments)) {
    throw new Error(`[DB] Invalid attachments at ${rowLabel}.attachments`);
  }
  const normalized = [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    normalized.push(normalizeAttachment(rawAttachments[index], rowLabel, index));
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeQuote(quote, rowLabel) {
  if (quote === undefined) {
    return undefined;
  }
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) {
    throw new Error(`[DB] Invalid quote payload at ${rowLabel}.quote`);
  }
  const messageId = parsePositiveMessageId(quote.messageId);
  const source = typeof quote.source === "string" ? quote.source : "";
  const timestamp = Number.parseInt(String(quote.timestamp ?? ""), 10);
  if (!isValidQuotePayload(messageId, source, timestamp)) {
    throw new Error(`[DB] Invalid quote payload at ${rowLabel}.quote`);
  }
  if (typeof quote.textSnippet !== "string") {
    throw new Error(`[DB] Invalid quote textSnippet at ${rowLabel}.quote.textSnippet`);
  }
  return { messageId, source, timestamp, textSnippet: quote.textSnippet };
}

function isValidQuotePayload(messageId, source, timestamp) {
  return Boolean(
    messageId && VALID_QUOTE_SOURCES.has(source) && Number.isFinite(timestamp) && timestamp > 0,
  );
}

function parseMessageText(rowText, rowId) {
  const rowLabel = buildMessageRowLabel(rowId);
  if (typeof rowText !== "string") {
    throw new Error(`[DB] Invalid message text type at ${rowLabel}`);
  }
  const parsed = parseMessageJson(rowText, rowLabel);
  if (typeof parsed.text !== "string") {
    throw new Error(`[DB] Invalid message text field at ${rowLabel}.text`);
  }
  return {
    text: parsed.text,
    attachments: normalizeAttachments(parsed.attachments, rowLabel),
    quote: normalizeQuote(parsed.quote, rowLabel),
  };
}

function parseMessageJson(rowText, rowLabel) {
  let parsed;
  try {
    parsed = JSON.parse(rowText);
  } catch {
    throw new Error(`[DB] Invalid message payload JSON at ${rowLabel}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`[DB] Invalid message payload object at ${rowLabel}`);
  }
  return parsed;
}

function mapMessageRow(row) {
  const parsed = parseMessageText(row.text, row.id);
  const messageId = parsePositiveMessageId(row.id);
  const timestamp = Number.parseInt(String(row.timestamp ?? ""), 10);
  const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  const cursor =
    messageId && safeTimestamp > 0 ? { timestamp: safeTimestamp, id: messageId } : null;
  const mapped = {
    text: parsed.text,
    source: row.source,
    timestamp: safeTimestamp,
    attachments: parsed.attachments,
    quote: parsed.quote,
    serverMessageId: messageId,
    cursor,
    clientMessageId: typeof row.client_message_id === "string" ? row.client_message_id : null,
  };
  if (messageId) {
    mapped.id = messageId;
  }
  return mapped;
}

function mapArchivedRow(row) {
  const message = mapMessageRow(row);
  return {
    ...message,
    appId: row.app_id,
    archived: true,
    archiveId: parsePositiveMessageId(row.archive_id),
    originalMessageId: parsePositiveMessageId(row.original_message_id),
    serverMessageId: null,
    cursor: null,
    archivedAt: row.archived_at,
    archiveReason: row.archive_reason,
    restoredAt: row.restored_at,
  };
}

function mapArchivedRowToChatMessage(row) {
  const message = mapArchivedRow(row);
  return {
    id: null,
    text: message.text,
    source: message.source,
    timestamp: message.timestamp,
    attachments: message.attachments,
    quote: message.quote,
    archiveId: message.archiveId,
    archived: true,
    originalMessageId: message.originalMessageId,
  };
}

module.exports = {
  parsePositiveMessageId,
  normalizeCursor,
  mapMessageRow,
  mapArchivedRow,
  mapArchivedRowToChatMessage,
};
