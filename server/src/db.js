const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

// 配置
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "../data/messages.db");
const MESSAGE_RETENTION_DAYS = parseInt(
  process.env.MESSAGE_RETENTION_DAYS || "30",
);
const MESSAGE_MAX_COUNT = parseInt(process.env.MESSAGE_MAX_COUNT || "1000"); // Per app limit

let db = null;
let isInitialized = false;

/**
 * 初始化数据库
 */
async function init() {
  try {
    // 确保数据目录存在
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 初始化 SQL.js
    const SQL = await initSqlJs();

    // 尝试加载现有数据库或创建新数据库
    let buffer = null;
    if (fs.existsSync(DB_PATH)) {
      buffer = fs.readFileSync(DB_PATH);
    }

    db = new SQL.Database(buffer);

    // 1. 创建表 (如果是新库)
    db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id TEXT DEFAULT 'default',
                text TEXT NOT NULL,
                source TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // 2. 检查并执行迁移 (如果是旧库，缺少 app_id)
    try {
        db.run("SELECT app_id FROM messages LIMIT 1");
    } catch (e) {
        console.log("[DB] Migrating schema: adding app_id column...");
        db.run("ALTER TABLE messages ADD COLUMN app_id TEXT DEFAULT 'default'");
        db.run("UPDATE messages SET app_id = 'default' WHERE app_id IS NULL");
        console.log("[DB] Migration completed.");
    }

    // 索引
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC);`,
    );
    db.run(
        `CREATE INDEX IF NOT EXISTS idx_app_id ON messages(app_id);`
    );

    isInitialized = true;
    console.log(`[DB] Initialized at ${DB_PATH}`);

    // 启动定期清理和保存任务
    startCleanupTask();
    startSaveTask();

    return true;
  } catch (error) {
    console.error(`[DB] Initialization failed: ${error.message}`);
    console.error("[DB] Falling back to memory-only mode");
    isInitialized = false;
    return false;
  }
}

/**
 * 保存数据库到文件
 */
function saveToFile() {
  if (!isInitialized || !db) {
    return false;
  }

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    return true;
  } catch (error) {
    console.error(`[DB] Failed to save to file: ${error.message}`);
    return false;
  }
}

/**
 * 保存消息
 * @param {string} text 消息内容
 * @param {string} source 消息来源 ('vscode' | 'mobile')
 * @param {number} timestamp 时间戳
 * @param {string} appId 应用ID
 */
function saveMessage(text, source, timestamp, appId = 'default') {
  if (!isInitialized || !db) {
    return false;
  }

  try {
    db.run("INSERT INTO messages (text, source, timestamp, app_id) VALUES (?, ?, ?, ?)", [
      text,
      source,
      timestamp,
      appId
    ]);
    return true;
  } catch (error) {
    console.error(`[DB] Failed to save message: ${error.message}`);
    return false;
  }
}

/**
 * 获取最近的消息
 * @param {number} limit 返回消息数量
 * @param {string} appId 应用ID
 * @returns {Array} 消息数组
 */
function getRecentMessages(limit = 50, appId = 'default') {
  if (!isInitialized || !db) {
    return [];
  }

  try {
    const stmt = db.prepare(`
            SELECT text, source, timestamp
            FROM messages
            WHERE app_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
    stmt.bind([appId, limit]);

    const messages = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();

      // Try to parse JSON (image messages), fallback to plain text
      let parsedText = row.text;
      let attachments = null;

      try {
        const parsed = JSON.parse(row.text);
        if (parsed.attachments) {
          parsedText = parsed.text;
          attachments = parsed.attachments;
        }
      } catch (e) {
        // Plain text message, keep as-is
      }

      messages.push({
        text: parsedText,
        source: row.source,
        timestamp: row.timestamp,
        attachments: attachments,
      });
    }
    stmt.free();

    // 反转顺序,使最旧的消息在前
    return messages.reverse();
  } catch (error) {
    console.error(`[DB] Failed to get messages: ${error.message}`);
    return [];
  }
}

/**
 * 获取消息总数 (Global or App specific? Currently global for simplicity in counting)
 * But cleanup should ideally be per app. 
 * For now let's keep it simple: Count ALL messages for stats if needed, or by App ID.
 * @param {string} [appId] Optional app ID
 * @returns {number} 消息数量
 */
function getMessageCount(appId) {
  if (!isInitialized || !db) {
    return 0;
  }

  try {
    let sql = "SELECT COUNT(*) as count FROM messages";
    let params = [];
    if (appId) {
        sql += " WHERE app_id = ?";
        params.push(appId);
    }

    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.count;
  } catch (error) {
    console.error(`[DB] Failed to get message count: ${error.message}`);
    return 0;
  }
}

/**
 * 清理过期消息
 */
function cleanupOldMessages() {
  if (!isInitialized || !db) {
    return;
  }

  try {
    const retentionTimestamp =
      Date.now() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // 1. 删除过期的 (Global)
    db.run("DELETE FROM messages WHERE timestamp < ?", [retentionTimestamp]);

    // 2. 数量限制 (Per App is better, but to save SQL performance, we can do a simplified versions)
    // We will do a generic clean up: distinct app_ids, then for each app, keep max.
    
    // Get distinct app_ids
    const appSmt = db.prepare("SELECT DISTINCT app_id FROM messages");
    const appIds = [];
    while(appSmt.step()) {
        appIds.push(appSmt.getAsObject().app_id);
    }
    appSmt.free();

    for (const appId of appIds) {
        const count = getMessageCount(appId);
        if (count > MESSAGE_MAX_COUNT) {
            const excess = count - MESSAGE_MAX_COUNT;
            // Delete oldest for this app
            db.run(
                `
                DELETE FROM messages 
                WHERE id IN (
                    SELECT id FROM messages 
                    WHERE app_id = ?
                    ORDER BY timestamp ASC 
                    LIMIT ?
                )
                `,
                [appId, excess]
            );
            console.log(`[DB] Cleaned up ${excess} excess messages for app ${appId}`);
        }
    }

    // 保存到文件
    saveToFile();
  } catch (error) {
    console.error(`[DB] Cleanup failed: ${error.message}`);
  }
}

/**
 * 启动定期清理任务
 */
function startCleanupTask() {
  // 每小时清理一次
  setInterval(cleanupOldMessages, 60 * 60 * 1000);
  console.log("[DB] Cleanup task started (runs every hour)");
}

/**
 * 启动定期保存任务
 */
function startSaveTask() {
  // 每 5 分钟保存一次
  setInterval(saveToFile, 5 * 60 * 1000);
  console.log("[DB] Auto-save task started (runs every 5 minutes)");
}

/**
 * 关闭数据库连接
 */
function close() {
  if (db) {
    saveToFile();
    db.close();
    console.log("[DB] Connection closed");
  }
}

module.exports = {
  init,
  saveMessage,
  getRecentMessages,
  getMessageCount,
  cleanupOldMessages,
  close,
};
