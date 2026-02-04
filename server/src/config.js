const fs = require('fs');
const path = require('path');

// Constants
const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'apps.json');

// Legacy/Env Defaults
const GLOBAL_GOTIFY_URL = process.env.GOTIFY_URL || 'http://gotify:80/message';
const CLICK_URL = process.env.CLICK_URL || "http://localhost:3000";

// In-memory cache
let appsCache = [];

/**
 * Initialize Config System
 */
function init() {
    // Ensure data dir exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Load or Seed
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            appsCache = JSON.parse(data);
            console.log(`[Config] Loaded ${appsCache.length} apps from ${CONFIG_FILE}`);
        } catch (e) {
            console.error('[Config] Failed to read config file, falling back to ENV:', e.message);
            seedFromEnv();
        }
    } else {
        seedFromEnv();
    }
}

/**
 * Seed configuration from Environment Variables (Legacy/Docker mode)
 */
function seedFromEnv() {
    const appAppsEnv = process.env.APP_APPS;
    const legacySecret = process.env.STEALTH_SECRET || "ChangeMeInProduction";
    const legacyGotifyToken = process.env.GOTIFY_TOKEN;

    if (appAppsEnv) {
        try {
            const apps = JSON.parse(appAppsEnv);
            if (Array.isArray(apps) && apps.length > 0) {
                appsCache = apps.map(app => ({
                    id: app.id || 'default',
                    name: app.name || 'Default App',
                    token: app.token,
                    gotifyToken: app.gotifyToken,
                    gotifyUrl: app.gotifyUrl || GLOBAL_GOTIFY_URL
                }));
            }
        } catch (e) {
            console.error('[Config] Failed to parse APP_APPS:', e.message);
        }
    }

    // If still empty, use legacy single mode
    if (appsCache.length === 0) {
        appsCache = [{
            id: 'default',
            name: 'Default App',
            token: legacySecret,
            gotifyToken: legacyGotifyToken,
            gotifyUrl: GLOBAL_GOTIFY_URL
        }];
    }

    // Save initialized state to file
    saveConfig();
}

/**
 * Save current cache to file
 */
function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(appsCache, null, 2));
        console.log('[Config] Configuration saved to disk');
        return true;
    } catch (e) {
        console.error('[Config] Failed to save config:', e.message);
        return false;
    }
}

// --- CRUD Operations ---

function getApps() {
    return appsCache; // Return reference or clone? cache is fine for read-mostly
}

function findAppById(id) {
    return appsCache.find(app => app.id === id) || null;
}

function findAppByToken(token) {
    return appsCache.find(app => app.token === token) || null;
}

function addApp(appData) {
    if (!appData.id || !appData.token) return false;
    
    // Check duplicate ID
    if (findAppById(appData.id)) return false;

    // Default values
    const newApp = {
        id: appData.id,
        name: appData.name || appData.id,
        token: appData.token,
        gotifyToken: appData.gotifyToken || '',
        gotifyUrl: appData.gotifyUrl || GLOBAL_GOTIFY_URL
    };

    appsCache.push(newApp);
    saveConfig();
    return newApp;
}

function updateApp(id, updates) {
    const idx = appsCache.findIndex(a => a.id === id);
    if (idx === -1) return false;

    appsCache[idx] = { ...appsCache[idx], ...updates };
    saveConfig();
    return appsCache[idx];
}

function deleteApp(id) {
    const initialLen = appsCache.length;
    appsCache = appsCache.filter(a => a.id !== id);
    if (appsCache.length !== initialLen) {
        saveConfig();
        return true;
    }
    return false;
}

// Auto-init on load
init();

module.exports = {
    getApps,
    addApp,
    updateApp,
    deleteApp,
    findAppById,
    findAppByToken,
    CLICK_URL
};
