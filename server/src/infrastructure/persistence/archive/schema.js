function applyColumnMigration(database, column, callback) {
  try {
    database.run(`SELECT ${column} FROM archived_messages LIMIT 1`);
  } catch {
    callback();
  }
}

function createArchiveSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS archived_messages (
      archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      original_message_id INTEGER NOT NULL,
      archived_at INTEGER NOT NULL,
      archive_reason TEXT NOT NULL,
      quote_message_id INTEGER,
      client_message_id TEXT,
      restored_at INTEGER
    );
  `);
  applyColumnMigration(database, "quote_message_id", () => {
    console.log("[ArchiveDB] Migrating schema: adding quote_message_id column...");
    database.run("ALTER TABLE archived_messages ADD COLUMN quote_message_id INTEGER");
  });
  applyColumnMigration(database, "client_message_id", () => {
    console.log("[ArchiveDB] Migrating schema: adding client_message_id column...");
    database.run("ALTER TABLE archived_messages ADD COLUMN client_message_id TEXT");
  });
  createIndexes(database);
}

function createIndexes(database) {
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_app_time ON archived_messages(app_id, timestamp DESC);",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_archived_at ON archived_messages(archived_at DESC);",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_restored_at ON archived_messages(restored_at);",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_client_message_id ON archived_messages(app_id, source, client_message_id);",
  );
}

module.exports = { createArchiveSchema };
