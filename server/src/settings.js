const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Constants
const DATA_DIR = path.join(__dirname, '../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ENV_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// In-memory cache
let settingsCache = null;

// Session tokens (in-memory only, cleared on restart)
const sessionTokens = new Set();

/**
 * Initialize Settings System
 */
function init() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            settingsCache = JSON.parse(data);
            console.log('[Settings] Loaded settings from disk');
        } catch (e) {
            console.error('[Settings] Failed to read settings file:', e.message);
            settingsCache = null;
        }
    }
}

/**
 * Save settings to file
 */
function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
        console.log('[Settings] Settings saved to disk');
        return true;
    } catch (e) {
        console.error('[Settings] Failed to save settings:', e.message);
        return false;
    }
}

/**
 * Hash password using scrypt
 */
function hashPassword(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify password against stored hash
 */
function verifyStoredHash(plain, stored) {
    const [salt, hash] = stored.split(':');
    const testHash = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

/**
 * Verify password (checks settings.json first, then env)
 */
function verifyPassword(plain) {
    if (settingsCache && settingsCache.adminPasswordHash) {
        return verifyStoredHash(plain, settingsCache.adminPasswordHash);
    }
    // Fallback to env password
    return plain === ENV_PASSWORD;
}

/**
 * Set new admin password
 */
function setPassword(plain) {
    const hash = hashPassword(plain);
    settingsCache = {
        ...settingsCache,
        adminPasswordHash: hash,
        updatedAt: new Date().toISOString()
    };
    // Clear all existing session tokens
    sessionTokens.clear();
    return saveSettings();
}

/**
 * Generate random session token
 */
function generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    sessionTokens.add(token);
    return token;
}

/**
 * Verify session token
 */
function verifyToken(token) {
    return sessionTokens.has(token);
}

/**
 * Invalidate session token
 */
function invalidateToken(token) {
    sessionTokens.delete(token);
}

/**
 * Check if custom password is set
 */
function hasCustomPassword() {
    return !!(settingsCache && settingsCache.adminPasswordHash);
}

// Auto-init on load
init();

module.exports = {
    verifyPassword,
    setPassword,
    generateToken,
    verifyToken,
    invalidateToken,
    hasCustomPassword
};
