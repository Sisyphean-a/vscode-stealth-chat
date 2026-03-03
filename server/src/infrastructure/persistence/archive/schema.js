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
      restored_at INTEGER
    );
  `);
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_app_time ON archived_messages(app_id, timestamp DESC);",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_archived_at ON archived_messages(archived_at DESC);",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_archive_restored_at ON archived_messages(restored_at);",
  );
}

module.exports = { createArchiveSchema };
