const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ENV_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

let settingsCache = null;
let writeQueue = Promise.resolve(true);
const sessionTokens = new Set();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function init() {
  ensureDataDir();

  if (!fs.existsSync(SETTINGS_FILE)) {
    return;
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    settingsCache = JSON.parse(data);
    console.log('[Settings] Loaded settings from disk');
  } catch (error) {
    console.error('[Settings] Failed to read settings file:', error.message);
    settingsCache = null;
  }
}

function enqueueSaveSettings() {
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
      console.log('[Settings] Settings saved to disk');
      return true;
    })
    .catch((error) => {
      console.error('[Settings] Failed to save settings:', error.message);
      return false;
    });

  return writeQueue;
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyStoredHash(plain, stored) {
  const [salt, hash] = stored.split(':');
  const testHash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

function verifyPassword(plain) {
  if (settingsCache && settingsCache.adminPasswordHash) {
    return verifyStoredHash(plain, settingsCache.adminPasswordHash);
  }

  return plain === ENV_PASSWORD;
}

async function setPassword(plain) {
  const previous = settingsCache;
  settingsCache = {
    ...settingsCache,
    adminPasswordHash: hashPassword(plain),
    updatedAt: new Date().toISOString(),
  };
  sessionTokens.clear();

  const saved = await enqueueSaveSettings();
  if (!saved) {
    settingsCache = previous;
    return false;
  }

  return true;
}

function generateToken() {
  const token = crypto.randomBytes(32).toString('hex');
  sessionTokens.add(token);
  return token;
}

function verifyToken(token) {
  return sessionTokens.has(token);
}

function invalidateToken(token) {
  sessionTokens.delete(token);
}

function hasCustomPassword() {
  return !!(settingsCache && settingsCache.adminPasswordHash);
}

init();

module.exports = {
  verifyPassword,
  setPassword,
  generateToken,
  verifyToken,
  invalidateToken,
  hasCustomPassword,
};
