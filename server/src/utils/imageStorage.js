const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { scanReferencedImageFiles } = require("../application/services/imageReferenceScanner");

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const IMAGE_SIZE_THRESHOLD = 100 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IMAGE_RETENTION_DAYS = 30;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const IMAGES_DIR = path.join(__dirname, "../../data/images");
const DEFAULT_DB_PATH = path.join(__dirname, "../../data/messages.db");
const DEFAULT_ARCHIVE_DB_PATH = path.join(__dirname, "../../data/messages.archive.db");

ensureImagesDir(IMAGES_DIR);

async function processImage(base64Data, mimeType, originalFilename) {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  }
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`,
    );
  }
  if (buffer.length < IMAGE_SIZE_THRESHOLD) {
    return buildInlineImageResult(buffer.length, mimeType, base64Data, originalFilename);
  }
  return saveImageToDisk(buffer, mimeType, originalFilename);
}

function ensureImagesDir(imagesDir) {
  if (fs.existsSync(imagesDir)) {
    return;
  }
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log("[ImageStorage] Created images directory:", imagesDir);
}

function buildInlineImageResult(size, mimeType, base64Data, originalFilename) {
  return {
    type: "inline",
    data: `data:${mimeType};base64,${base64Data}`,
    size,
    filename: originalFilename,
  };
}

async function saveImageToDisk(buffer, mimeType, originalFilename) {
  const filename = buildStoredFilename(mimeType);
  const filepath = path.join(IMAGES_DIR, filename);
  try {
    await fs.promises.writeFile(filepath, buffer);
    console.log(
      `[ImageStorage] Saved large image: ${filename} (${(buffer.length / 1024).toFixed(2)}KB)`,
    );
    return {
      type: "file",
      url: `/uploads/${filename}`,
      size: buffer.length,
      filename: originalFilename,
    };
  } catch (error) {
    console.error("[ImageStorage] Failed to save image:", error);
    throw new Error("Failed to save image to disk");
  }
}

function buildStoredFilename(mimeType) {
  const extMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extMap[mimeType] || "png"}`;
}

async function cleanupOldImages(options = {}) {
  const settings = resolveCleanupOptions(options);
  if (!fs.existsSync(settings.imagesDir)) {
    console.log("[ImageStorage] Images directory does not exist, skipping cleanup");
    return { deleted: 0, errors: 0, skippedReferenced: 0 };
  }
  const referencedFiles = await scanReferencedImageFiles({
    hotDbPath: settings.hotDbPath,
    archiveDbPath: settings.archiveDbPath,
  });
  return deleteExpiredImages(settings, referencedFiles);
}

function resolveCleanupOptions(options) {
  return {
    imagesDir: options.imagesDir || IMAGES_DIR,
    hotDbPath: options.hotDbPath || process.env.DB_PATH || DEFAULT_DB_PATH,
    archiveDbPath: options.archiveDbPath || process.env.ARCHIVE_DB_PATH || DEFAULT_ARCHIVE_DB_PATH,
    retentionDays: normalizeRetentionDays(options.retentionDays),
    now: typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now(),
  };
}

function normalizeRetentionDays(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : IMAGE_RETENTION_DAYS;
}

function deleteExpiredImages(settings, referencedFiles) {
  const result = { deleted: 0, errors: 0, skippedReferenced: 0 };
  const maxAge = settings.retentionDays * DAY_IN_MS;
  const files = fs.readdirSync(settings.imagesDir);
  for (const file of files) {
    const age = settings.now - readTimestampFromFilename(file);
    if (!Number.isFinite(age) || age <= maxAge) {
      continue;
    }
    if (referencedFiles.has(file)) {
      result.skippedReferenced += 1;
      continue;
    }
    deleteImageFile(path.join(settings.imagesDir, file), file, age, result);
  }
  logCleanupSummary(result);
  return result;
}

function readTimestampFromFilename(filename) {
  const match = filename.match(/^(\d+)-[a-f0-9]+\.\w+$/);
  if (!match) {
    console.warn(`[ImageStorage] Skipping non-standard filename: ${filename}`);
    return Number.NaN;
  }
  return Number.parseInt(match[1], 10);
}

function deleteImageFile(filepath, filename, age, result) {
  try {
    fs.unlinkSync(filepath);
    result.deleted += 1;
    console.log(
      `[ImageStorage] Deleted old image: ${filename} (age: ${Math.floor(age / DAY_IN_MS)} days)`,
    );
  } catch (error) {
    result.errors += 1;
    console.error(`[ImageStorage] Failed to delete ${filename}:`, error);
  }
}

function logCleanupSummary(result) {
  if (result.deleted === 0 && result.errors === 0 && result.skippedReferenced === 0) {
    return;
  }
  console.log(
    `[ImageStorage] Cleanup complete: deleted ${result.deleted}, errors ${result.errors}, skippedReferenced ${result.skippedReferenced}`,
  );
}

function getStorageStats() {
  if (!fs.existsSync(IMAGES_DIR)) {
    return { totalFiles: 0, totalSize: 0, oldestFile: null };
  }
  const files = fs.readdirSync(IMAGES_DIR);
  let totalSize = 0;
  let oldestTimestamp = Date.now();
  for (const file of files) {
    totalSize += fs.statSync(path.join(IMAGES_DIR, file)).size;
    const timestamp = readStatsTimestamp(file);
    if (timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
    }
  }
  return {
    totalFiles: files.length,
    totalSize,
    oldestFile: files.length > 0 ? oldestTimestamp : null,
  };
}

function readStatsTimestamp(filename) {
  const match = filename.match(/^(\d+)-/);
  return match ? Number.parseInt(match[1], 10) : Date.now();
}

module.exports = {
  processImage,
  cleanupOldImages,
  getStorageStats,
  IMAGES_DIR,
  IMAGE_SIZE_THRESHOLD,
  MAX_IMAGE_SIZE,
};
