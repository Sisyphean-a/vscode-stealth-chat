const DEFAULT_SEARCH_LIMIT = 50;
const SEARCH_SNIPPET_LENGTH = 120;
const SNIPPET_TAIL_ELLIPSIS = 3;

function buildSearchSnippet(message, keyword, maxLength = SEARCH_SNIPPET_LENGTH) {
  const lowerKeyword = keyword.toLowerCase();
  const text = typeof message.text === "string" ? message.text : "";
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const previewRaw = hasAttachments ? `[图片] ${text}`.trim() : text.trim();
  const preview = previewRaw || "(空消息)";
  const lowerPreview = preview.toLowerCase();
  const hitIndex = lowerPreview.indexOf(lowerKeyword);
  if (hitIndex < 0 || preview.length <= maxLength) {
    return preview.length <= maxLength
      ? preview
      : `${preview.slice(0, maxLength - SNIPPET_TAIL_ELLIPSIS)}...`;
  }

  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, hitIndex - half);
  const end = Math.min(preview.length, start + maxLength);
  const clipped = preview.slice(start, end);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < preview.length ? "..." : "";
  return `${prefix}${clipped}${suffix}`;
}

function normalizeSearchInput(options, parsePositiveInt) {
  const appId =
    typeof options.appId === "string" && options.appId.trim().length > 0
      ? options.appId.trim()
      : null;
  const keyword = typeof options.keyword === "string" ? options.keyword.trim() : "";
  const limit = parsePositiveInt(options.limit, DEFAULT_SEARCH_LIMIT);
  return { appId, keyword, limit };
}

function getHotSearchRows(database, appId, keyword, limit) {
  const stmt = database.prepare(`
    SELECT id, text, source, timestamp, client_message_id
    FROM messages
    WHERE app_id = ? AND text LIKE ?
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `);
  stmt.bind([appId, `%${keyword}%`, limit]);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function mapHotResults(rows, mapMessageRow, keyword) {
  const lowerKeyword = keyword.toLowerCase();
  return rows
    .map((row) => mapMessageRow(row))
    .filter((message) => {
      const content =
        `${message.text || ""} ${JSON.stringify(message.attachments || [])}`.toLowerCase();
      return content.includes(lowerKeyword);
    })
    .map((message) => ({
      targetType: "hot",
      messageId: message.id,
      archiveId: null,
      source: message.source,
      timestamp: message.timestamp,
      preview: buildSearchSnippet(message, keyword),
      restored: false,
    }));
}

function mapArchiveResults(rows, mapArchivedRow, keyword) {
  return rows.map((row) => {
    const message = mapArchivedRow(row);
    return {
      targetType: "archive",
      messageId: null,
      archiveId: Number.parseInt(String(message.archiveId), 10),
      source: message.source,
      timestamp: message.timestamp,
      preview: buildSearchSnippet(message, keyword),
      restored: false,
    };
  });
}

function sortAndLimitResults(results, limit) {
  return results
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        const aId = a.messageId || a.archiveId || 0;
        const bId = b.messageId || b.archiveId || 0;
        return bId - aId;
      }
      return b.timestamp - a.timestamp;
    })
    .slice(0, limit);
}

function createMessageSearchService(options) {
  const {
    ensureInitialized,
    getDatabase,
    parsePositiveInt,
    mapMessageRow,
    mapArchivedRow,
    archiveDb,
  } = options;

  function searchMessages(input = {}) {
    if (!ensureInitialized()) {
      return [];
    }

    const normalized = normalizeSearchInput(input, parsePositiveInt);
    if (!normalized.appId || normalized.keyword.length === 0) {
      return [];
    }

    const database = getDatabase();
    const hotRows = getHotSearchRows(
      database,
      normalized.appId,
      normalized.keyword,
      normalized.limit,
    );
    const hotResults = mapHotResults(hotRows, mapMessageRow, normalized.keyword);
    const archiveRows = archiveDb.searchArchivedMessages({
      appId: normalized.appId,
      keyword: normalized.keyword,
      limit: normalized.limit,
    });
    const archiveResults = mapArchiveResults(archiveRows, mapArchivedRow, normalized.keyword);
    return sortAndLimitResults([...hotResults, ...archiveResults], normalized.limit);
  }

  return { searchMessages };
}

module.exports = { createMessageSearchService };
