const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const IMAGE_SIZE_THRESHOLD = 100 * 1024; // 100KB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMAGES_DIR = path.join(__dirname, '../../data/images');
const IMAGE_RETENTION_DAYS = 30;

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log('[ImageStorage] Created images directory:', IMAGES_DIR);
}

/**
 * Process uploaded image - small images become Base64, large images are saved to disk
 * @param {string} base64Data - Base64 encoded image data (without data URL prefix)
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @param {string} originalFilename - Original filename from client
 * @returns {Object} - { type: 'inline'|'file', data?: string, url?: string, size: number, filename: string }
 * @throws {Error} - If validation fails
 */
function processImage(base64Data, mimeType, originalFilename) {
  // Validate MIME type
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }

  // Decode and validate size
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
  }

  // Determine file extension
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp'
  };
  const ext = extMap[mimeType] || 'png';

  // Small image: return data URL
  if (buffer.length < IMAGE_SIZE_THRESHOLD) {
    return {
      type: 'inline',
      data: `data:${mimeType};base64,${base64Data}`,
      size: buffer.length,
      filename: originalFilename
    };
  }

  // Large image: save to disk
  // Generate secure filename: timestamp-hash.ext
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString('hex');
  const filename = `${timestamp}-${hash}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);

  try {
    fs.writeFileSync(filepath, buffer);
    console.log(`[ImageStorage] Saved large image: ${filename} (${(buffer.length / 1024).toFixed(2)}KB)`);

    return {
      type: 'file',
      url: `/uploads/${filename}`,
      size: buffer.length,
      filename: originalFilename
    };
  } catch (error) {
    console.error('[ImageStorage] Failed to save image:', error);
    throw new Error('Failed to save image to disk');
  }
}

/**
 * Clean up images older than retention period
 * @returns {Object} - { deleted: number, errors: number }
 */
function cleanupOldImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('[ImageStorage] Images directory does not exist, skipping cleanup');
    return { deleted: 0, errors: 0 };
  }

  const now = Date.now();
  const maxAge = IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(IMAGES_DIR);

    for (const file of files) {
      // Extract timestamp from filename (format: timestamp-hash.ext)
      const match = file.match(/^(\d+)-[a-f0-9]+\.\w+$/);
      if (!match) {
        console.warn(`[ImageStorage] Skipping non-standard filename: ${file}`);
        continue;
      }

      const fileTimestamp = parseInt(match[1], 10);
      const age = now - fileTimestamp;

      if (age > maxAge) {
        try {
          const filepath = path.join(IMAGES_DIR, file);
          fs.unlinkSync(filepath);
          deleted++;
          console.log(`[ImageStorage] Deleted old image: ${file} (age: ${Math.floor(age / 86400000)} days)`);
        } catch (err) {
          console.error(`[ImageStorage] Failed to delete ${file}:`, err);
          errors++;
        }
      }
    }

    if (deleted > 0 || errors > 0) {
      console.log(`[ImageStorage] Cleanup complete: deleted ${deleted}, errors ${errors}`);
    }
  } catch (error) {
    console.error('[ImageStorage] Cleanup failed:', error);
    errors++;
  }

  return { deleted, errors };
}

/**
 * Get storage statistics
 * @returns {Object} - { totalFiles: number, totalSize: number, oldestFile: number }
 */
function getStorageStats() {
  if (!fs.existsSync(IMAGES_DIR)) {
    return { totalFiles: 0, totalSize: 0, oldestFile: null };
  }

  const files = fs.readdirSync(IMAGES_DIR);
  let totalSize = 0;
  let oldestTimestamp = Date.now();

  for (const file of files) {
    const filepath = path.join(IMAGES_DIR, file);
    const stats = fs.statSync(filepath);
    totalSize += stats.size;

    // Extract timestamp from filename
    const match = file.match(/^(\d+)-/);
    if (match) {
      const fileTimestamp = parseInt(match[1], 10);
      if (fileTimestamp < oldestTimestamp) {
        oldestTimestamp = fileTimestamp;
      }
    }
  }

  return {
    totalFiles: files.length,
    totalSize,
    oldestFile: files.length > 0 ? oldestTimestamp : null
  };
}

module.exports = {
  processImage,
  cleanupOldImages,
  getStorageStats,
  IMAGES_DIR,
  IMAGE_SIZE_THRESHOLD,
  MAX_IMAGE_SIZE
};
