const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'apps.json');

const GLOBAL_GOTIFY_URL = process.env.GOTIFY_URL || 'http://gotify:80/message';
const CLICK_URL = process.env.CLICK_URL || 'https://chat.sisyphean.top';

let appsCache = [];
let writeQueue = Promise.resolve(true);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeApp(appData) {
  return {
    id: appData.id || 'default',
    name: appData.name || appData.id,
    token: appData.token,
    gotifyToken: appData.gotifyToken || '',
    gotifyUrl: appData.gotifyUrl || GLOBAL_GOTIFY_URL,
    gotifyPriority: appData.gotifyPriority ?? 10,
    clickUrl: appData.clickUrl || '',
  };
}

function saveConfigSync() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appsCache, null, 2));
    console.log('[Config] Configuration saved to disk');
    return true;
  } catch (error) {
    console.error('[Config] Failed to save config:', error.message);
    return false;
  }
}

function enqueueSave() {
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(appsCache, null, 2));
      console.log('[Config] Configuration saved to disk');
      return true;
    })
    .catch((error) => {
      console.error('[Config] Failed to save config:', error.message);
      return false;
    });

  return writeQueue;
}

function seedFromEnv() {
  const appAppsEnv = process.env.APP_APPS;
  const legacySecret = process.env.STEALTH_SECRET || 'ChangeMeInProduction';
  const legacyGotifyToken = process.env.GOTIFY_TOKEN;

  if (appAppsEnv) {
    try {
      const apps = JSON.parse(appAppsEnv);
      if (Array.isArray(apps) && apps.length > 0) {
        appsCache = apps.map((app) => normalizeApp({
          id: app.id || 'default',
          name: app.name || 'Default App',
          token: app.token,
          gotifyToken: app.gotifyToken,
          gotifyUrl: app.gotifyUrl,
          gotifyPriority: app.gotifyPriority,
          clickUrl: app.clickUrl,
        }));
      }
    } catch (error) {
      console.error('[Config] Failed to parse APP_APPS:', error.message);
    }
  }

  if (appsCache.length === 0) {
    appsCache = [normalizeApp({
      id: 'default',
      name: 'Default App',
      token: legacySecret,
      gotifyToken: legacyGotifyToken,
      gotifyUrl: GLOBAL_GOTIFY_URL,
    })];
  }

  saveConfigSync();
}

function init() {
  ensureDataDir();

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      appsCache = Array.isArray(parsed) ? parsed.map(normalizeApp) : [];
      console.log(`[Config] Loaded ${appsCache.length} apps from ${CONFIG_FILE}`);
      return;
    } catch (error) {
      console.error('[Config] Failed to read config file, using environment seed:', error.message);
    }
  }

  seedFromEnv();
}

function getApps() {
  return appsCache.map((app) => ({ ...app }));
}

function findAppById(id) {
  return appsCache.find((app) => app.id === id) || null;
}

function findAppByToken(token) {
  return appsCache.find((app) => app.token === token) || null;
}

async function addApp(appData) {
  if (!appData.id || !appData.token) {
    return false;
  }

  if (findAppById(appData.id)) {
    return false;
  }

  const newApp = normalizeApp(appData);
  appsCache.push(newApp);
  const saved = await enqueueSave();
  if (!saved) {
    appsCache.pop();
    return false;
  }

  return { ...newApp };
}

async function updateApp(id, updates) {
  const index = appsCache.findIndex((app) => app.id === id);
  if (index === -1) {
    return false;
  }

  const previous = appsCache[index];
  appsCache[index] = normalizeApp({ ...appsCache[index], ...updates, id: previous.id });

  const saved = await enqueueSave();
  if (!saved) {
    appsCache[index] = previous;
    return false;
  }

  return { ...appsCache[index] };
}

async function deleteApp(id) {
  const index = appsCache.findIndex((app) => app.id === id);
  if (index === -1) {
    return false;
  }

  const [removed] = appsCache.splice(index, 1);
  const saved = await enqueueSave();
  if (!saved) {
    appsCache.splice(index, 0, removed);
    return false;
  }

  return true;
}

init();

module.exports = {
  getApps,
  addApp,
  updateApp,
  deleteApp,
  findAppById,
  findAppByToken,
  CLICK_URL,
};
