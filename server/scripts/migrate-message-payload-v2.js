#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { migrateDatabaseFile } = require("./lib/messagePayloadMigration");

const DEFAULT_DB_PATH = path.join(__dirname, "../data/messages.db");
const DEFAULT_ARCHIVE_DB_PATH = path.join(__dirname, "../data/messages.archive.db");
const DEFAULT_BACKUP_DIR = path.join(__dirname, "../data/backups");
const TABLES = [
  { tableName: "messages", idColumn: "id" },
  { tableName: "archived_messages", idColumn: "archive_id" },
];

function printUsage() {
  console.log(`
Usage:
  node server/scripts/migrate-message-payload-v2.js [options]

Options:
  --db-path <path>           主消息库路径 (默认: DB_PATH 或 server/data/messages.db)
  --archive-db-path <path>   归档库路径 (默认: ARCHIVE_DB_PATH 或 server/data/messages.archive.db)
  --backup-dir <path>        备份输出目录 (默认: server/data/backups)
  --dry-run                  只扫描并输出统计，不落盘
  --help                     显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    dbPath: process.env.DB_PATH || DEFAULT_DB_PATH,
    archiveDbPath: process.env.ARCHIVE_DB_PATH || DEFAULT_ARCHIVE_DB_PATH,
    backupDir: DEFAULT_BACKUP_DIR,
    dryRun: false,
  };
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--db-path" || arg === "--archive-db-path" || arg === "--backup-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Invalid value for ${arg}`);
      }
      if (arg === "--db-path") {
        options.dbPath = value;
      } else if (arg === "--archive-db-path") {
        options.archiveDbPath = value;
      } else {
        options.backupDir = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function resolveAbsolutePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function ensureReadableFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function buildTimestampTag() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function backupDatabaseFile(filePath, backupDir, timestampTag) {
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `${path.basename(filePath)}.${timestampTag}.bak`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function normalizeTargets(options) {
  const targets = [
    { label: "main-db", filePath: resolveAbsolutePath(options.dbPath) },
    { label: "archive-db", filePath: resolveAbsolutePath(options.archiveDbPath) },
  ];
  const seen = new Set();
  const unique = [];
  for (const target of targets) {
    if (seen.has(target.filePath)) {
      continue;
    }
    seen.add(target.filePath);
    unique.push(target);
  }
  return unique;
}

function splitExistingTargets(targets) {
  const executable = [];
  const skipped = [];
  for (const target of targets) {
    if (fs.existsSync(target.filePath)) {
      executable.push(target);
    } else {
      skipped.push(target);
    }
  }
  return { executable, skipped };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const targets = normalizeTargets(options);
  const mainTarget = targets.find((target) => target.label === "main-db");
  ensureReadableFile(mainTarget.filePath, "main database");

  const { executable, skipped } = splitExistingTargets(targets);
  for (const target of skipped) {
    console.log(`[Skip] ${target.label} not found: ${target.filePath}`);
  }

  if (!options.dryRun) {
    const backupDir = resolveAbsolutePath(options.backupDir);
    const timestampTag = buildTimestampTag();
    console.log(`[Backup] output dir: ${backupDir}`);
    for (const target of executable) {
      const backupPath = backupDatabaseFile(target.filePath, backupDir, timestampTag);
      console.log(`  - ${target.filePath} -> ${backupPath}`);
    }
  }

  const SQL = await initSqlJs();
  for (const target of executable) {
    await migrateDatabaseFile(SQL, {
      filePath: target.filePath,
      dryRun: options.dryRun,
      tables: TABLES,
      readFile: (filePath) => fs.readFileSync(filePath),
      writeFile: (filePath, content) => fs.writeFileSync(filePath, content),
    });
  }

  console.log(`\n[Done] ${options.dryRun ? "dry-run completed" : "migration completed"}`);
}

run().catch((error) => {
  console.error(`\n[Error] ${error.message}`);
  process.exit(1);
});
