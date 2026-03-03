function applyColumnMigration(database, column, sql) {
  try {
    database.run(`SELECT ${column} FROM messages LIMIT 1`);
  } catch {
    sql();
  }
}

function createSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT DEFAULT 'default',
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      quote_message_id INTEGER,
      client_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  applyColumnMigration(database, "app_id", () => {
    console.log("[DB] Migrating schema: adding app_id column...");
    database.run("ALTER TABLE messages ADD COLUMN app_id TEXT DEFAULT 'default'");
    database.run("UPDATE messages SET app_id = 'default' WHERE app_id IS NULL");
    console.log("[DB] Migration completed.");
  });
  applyColumnMigration(database, "quote_message_id", () => {
    console.log("[DB] Migrating schema: adding quote_message_id column...");
    database.run("ALTER TABLE messages ADD COLUMN quote_message_id INTEGER");
    console.log("[DB] Migration completed.");
  });
  applyColumnMigration(database, "client_message_id", () => {
    console.log("[DB] Migrating schema: adding client_message_id column...");
    database.run("ALTER TABLE messages ADD COLUMN client_message_id TEXT");
    console.log("[DB] Migration completed.");
  });
  createIndexes(database);
}

function createIndexes(database) {
  database.run("CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC);");
  database.run("CREATE INDEX IF NOT EXISTS idx_app_id ON messages(app_id);");
  database.run("CREATE INDEX IF NOT EXISTS idx_app_timestamp ON messages(app_id, timestamp DESC);");
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_app_timestamp_id ON messages(app_id, timestamp ASC, id ASC);",
  );
  database.run("CREATE INDEX IF NOT EXISTS idx_quote_message_id ON messages(quote_message_id);");
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_client_message_id ON messages(app_id, source, client_message_id);",
  );
}

module.exports = { createSchema };
