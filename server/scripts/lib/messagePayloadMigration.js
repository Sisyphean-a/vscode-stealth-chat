const VALID_SOURCE_SET = new Set(["mobile", "vscode"]);

function tableExists(database, tableName) {
  const stmt = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  );
  stmt.bind([tableName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function readTableRows(database, tableName, idColumn) {
  const stmt = database.prepare(
    `SELECT ${idColumn} AS row_id, text FROM ${tableName} ORDER BY ${idColumn} ASC`,
  );
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function parsePositiveInt(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAttachment(rawAttachment, rowRef, index) {
  if (!rawAttachment || typeof rawAttachment !== "object" || Array.isArray(rawAttachment)) {
    throw new Error(`${rowRef}.attachments[${index}] must be object`);
  }

  const type = typeof rawAttachment.type === "string" ? rawAttachment.type.trim() : "";
  if (!type) {
    throw new Error(`${rowRef}.attachments[${index}].type must be non-empty string`);
  }

  const attachment = { type };
  for (const key of ["data", "url", "filename", "mimeType"]) {
    if (rawAttachment[key] === undefined) {
      continue;
    }
    if (typeof rawAttachment[key] !== "string") {
      throw new Error(`${rowRef}.attachments[${index}].${key} must be string`);
    }
    attachment[key] = rawAttachment[key];
  }
  if (rawAttachment.size !== undefined) {
    if (typeof rawAttachment.size !== "number" || !Number.isFinite(rawAttachment.size)) {
      throw new Error(`${rowRef}.attachments[${index}].size must be finite number`);
    }
    attachment.size = rawAttachment.size;
  }
  return attachment;
}

function normalizeAttachments(rawAttachments, rowRef) {
  if (rawAttachments === undefined || rawAttachments === null) {
    return undefined;
  }
  if (!Array.isArray(rawAttachments)) {
    throw new Error(`${rowRef}.attachments must be array`);
  }

  const normalized = [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    normalized.push(normalizeAttachment(rawAttachments[index], rowRef, index));
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeQuote(rawQuote, rowRef) {
  if (rawQuote === undefined || rawQuote === null) {
    return undefined;
  }
  if (!rawQuote || typeof rawQuote !== "object" || Array.isArray(rawQuote)) {
    throw new Error(`${rowRef}.quote must be object`);
  }

  const messageId = parsePositiveInt(rawQuote.messageId);
  const source = typeof rawQuote.source === "string" ? rawQuote.source : "";
  const timestamp = Number.parseInt(String(rawQuote.timestamp ?? ""), 10);
  if (!messageId || !VALID_SOURCE_SET.has(source) || !Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error(`${rowRef}.quote has invalid messageId/source/timestamp`);
  }
  if (typeof rawQuote.textSnippet !== "string") {
    throw new Error(`${rowRef}.quote.textSnippet must be string`);
  }
  return { messageId, source, timestamp, textSnippet: rawQuote.textSnippet };
}

function normalizeRowPayload(rawText, rowRef) {
  if (typeof rawText !== "string") {
    throw new Error(`${rowRef}.text must be string`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return JSON.stringify({ text: rawText });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${rowRef}.text JSON must be object`);
  }

  const text = typeof parsed.text === "string" ? parsed.text : "";
  const attachments = normalizeAttachments(parsed.attachments, rowRef);
  const quote = normalizeQuote(parsed.quote, rowRef);
  const normalized = { text };
  if (attachments) {
    normalized.attachments = attachments;
  }
  if (quote) {
    normalized.quote = quote;
  }
  return JSON.stringify(normalized);
}

function buildMigrationPlan(database, tableName, idColumn) {
  const summary = {
    tableName,
    idColumn,
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: false,
    errors: [],
    updates: [],
  };

  if (!tableExists(database, tableName)) {
    summary.skipped = true;
    return summary;
  }

  const rows = readTableRows(database, tableName, idColumn);
  summary.scanned = rows.length;
  for (const row of rows) {
    const rowId = parsePositiveInt(row.row_id) || "unknown";
    const rowRef = `${tableName}#${rowId}`;
    try {
      const normalized = normalizeRowPayload(row.text, rowRef);
      if (normalized === row.text) {
        summary.unchanged += 1;
      } else {
        summary.updated += 1;
        summary.updates.push({ id: row.row_id, text: normalized });
      }
    } catch (error) {
      summary.errors.push(error.message);
    }
  }
  return summary;
}

function applyMigrationPlans(database, plans) {
  database.run("BEGIN TRANSACTION");
  try {
    for (const plan of plans) {
      if (plan.skipped || plan.updates.length === 0) {
        continue;
      }
      for (const update of plan.updates) {
        database.run(
          `UPDATE ${plan.tableName} SET text = ? WHERE ${plan.idColumn} = ?`,
          [update.text, update.id],
        );
      }
    }
    database.run("COMMIT");
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

function logPlanResult(filePath, plan) {
  if (plan.skipped) {
    console.log(`  - ${plan.tableName}: skipped (table not found)`);
    return;
  }

  console.log(`  - ${plan.tableName}: scanned=${plan.scanned}, updated=${plan.updated}, unchanged=${plan.unchanged}, errors=${plan.errors.length}`);
  if (plan.errors.length === 0) {
    return;
  }
  for (const error of plan.errors.slice(0, 10)) {
    console.log(`    * ${error}`);
  }
  if (plan.errors.length > 10) {
    console.log(`    * ... and ${plan.errors.length - 10} more errors`);
  }
  throw new Error(`Migration failed for ${filePath}:${plan.tableName} due to validation errors`);
}

async function migrateDatabaseFile(SQL, options) {
  const filePath = options.filePath;
  const dryRun = options.dryRun === true;
  const tableDefs = Array.isArray(options.tables) ? options.tables : [];
  const buffer = options.readFile(filePath);
  const database = new SQL.Database(buffer);
  try {
    const plans = tableDefs.map((tableDef) => buildMigrationPlan(database, tableDef.tableName, tableDef.idColumn));
    console.log(`\n[Scan] ${filePath}`);
    for (const plan of plans) {
      logPlanResult(filePath, plan);
    }
    if (!dryRun) {
      applyMigrationPlans(database, plans);
      options.writeFile(filePath, Buffer.from(database.export()));
    }
    return plans;
  } finally {
    database.close();
  }
}

module.exports = {
  migrateDatabaseFile,
};
