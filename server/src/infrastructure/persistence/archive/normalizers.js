function parsePositiveInt(input, fallback) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveMessageId(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeClientMessageId(input) {
  const normalized = typeof input === "string" ? input.trim() : "";
  return normalized || null;
}

function normalizeArchiveReason(reason, validReasons) {
  if (!validReasons.has(reason)) {
    throw new Error(`[ArchiveDB] Unsupported archive reason: ${reason}`);
  }
  return reason;
}

function normalizeArchiveIds(archiveIds) {
  if (!Array.isArray(archiveIds)) {
    return [];
  }
  const normalized = [];
  for (const id of archiveIds) {
    const parsed = Number.parseInt(String(id), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      normalized.push(parsed);
    }
  }
  return Array.from(new Set(normalized));
}

function normalizeTimestamp(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[ArchiveDB] Invalid timestamp: ${input}`);
  }
  return parsed;
}

function normalizeAppId(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const appId = String(input).trim();
  return appId.length > 0 ? appId : null;
}

function buildPlaceholders(count) {
  return new Array(count).fill("?").join(", ");
}

function validateMessageRow(row, normalizeAppIdFn, normalizeTimestampFn) {
  const messageId = parsePositiveMessageId(row?.id);
  const appId = normalizeAppIdFn(row?.app_id);
  const text = row?.text;
  const source = row?.source;
  const timestamp = normalizeTimestampFn(row?.timestamp);
  if (!messageId) {
    throw new Error(`[ArchiveDB] Invalid source message id: ${row?.id}`);
  }
  if (!appId) {
    throw new Error("[ArchiveDB] Missing app_id in archived message");
  }
  if (typeof text !== "string") {
    throw new Error("[ArchiveDB] Invalid text field in archived message");
  }
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("[ArchiveDB] Invalid source field in archived message");
  }
  return {
    messageId,
    appId,
    text,
    source,
    timestamp,
    quoteMessageId: parsePositiveMessageId(row?.quote_message_id),
    clientMessageId: normalizeClientMessageId(row?.client_message_id),
  };
}

module.exports = {
  parsePositiveInt,
  normalizeArchiveReason,
  normalizeArchiveIds,
  normalizeTimestamp,
  normalizeAppId,
  buildPlaceholders,
  validateMessageRow,
};
