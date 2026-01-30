const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

// 配置
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "../data/messages.db");
const MESSAGE_RETENTION_DAYS = parseInt(
  process.env.MESSAGE_RETENTION_DAYS || "30",
);
const MESSAGE_MAX_COUNT = parseInt(process.env.MESSAGE_MAX_COUNT || "1000");

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

    // 创建消息表
    db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                source TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    db.run(
      `CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC);`,
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
 */
function saveMessage(text, source, timestamp) {
  if (!isInitialized || !db) {
    return false;
  }

  try {
    db.run("INSERT INTO messages (text, source, timestamp) VALUES (?, ?, ?)", [
      text,
      source,
      timestamp,
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
 * @returns {Array} 消息数组
 */
function getRecentMessages(limit = 50) {
  if (!isInitialized || !db) {
    return [];
  }

  try {
    const stmt = db.prepare(`
            SELECT text, source, timestamp 
            FROM messages 
            ORDER BY timestamp DESC 
            LIMIT ?
        `);
    stmt.bind([limit]);

    const messages = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      messages.push(row);
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
 * 获取消息总数
 * @returns {number} 消息数量
 */
function getMessageCount() {
  if (!isInitialized || !db) {
    return 0;
  }

  try {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM messages");
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

    // 删除过期消息
    db.run("DELETE FROM messages WHERE timestamp < ?", [retentionTimestamp]);

    // 如果消息数量超过限制,删除最旧的消息
    const count = getMessageCount();

    if (count > MESSAGE_MAX_COUNT) {
      const excess = count - MESSAGE_MAX_COUNT;
      db.run(
        `
                DELETE FROM messages 
                WHERE id IN (
                    SELECT id FROM messages 
                    ORDER BY timestamp ASC 
                    LIMIT ?
                )
            `,
        [excess],
      );
      console.log(`[DB] Cleaned up ${excess} excess messages`);
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
