const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const settings = require('../settings');

const DEFAULT_ARCHIVE_LIMIT = 50;
const MAX_ARCHIVE_LIMIT = 500;

// Middleware to check session token
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <token>"
    if (!settings.verifyToken(token)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArchiveLimit(rawLimit) {
    const limit = parsePositiveInt(rawLimit, DEFAULT_ARCHIVE_LIMIT);
    return Math.min(limit, MAX_ARCHIVE_LIMIT);
}

function parseOptionalTimestamp(rawValue, fieldName) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return null;
    }
    const parsed = Number.parseInt(String(rawValue), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} 必须是正整数时间戳`);
    }
    return parsed;
}

function parseOptionalAppId(rawValue) {
    if (typeof rawValue !== 'string') {
        return null;
    }
    const appId = rawValue.trim();
    return appId.length > 0 ? appId : null;
}

function parseBoolean(rawValue) {
    return String(rawValue).toLowerCase() === 'true';
}

// Login check
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (settings.verifyPassword(password)) {
        const token = settings.generateToken();
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Protected Routes
router.use(authMiddleware);

// Get System Status & Apps
router.get('/status', (req, res) => {
    const apps = config.getApps();
    
    // Return full config to admin (including secrets, as they are admin)
    // Security Note: In high security env, mask tokens. But Admin needs to see/edit them.
    
    res.json({
        uptime: process.uptime(),
        totalMessages: db.getMessageCount(),
        archivedMessages: db.getArchiveMessageCount(),
        apps: apps,
        dbPath: process.env.DB_PATH || 'default'
    });
});

router.get('/archive/messages', (req, res) => {
    try {
        const limit = parseArchiveLimit(req.query.limit);
        const appId = parseOptionalAppId(req.query.appId);
        const beforeTimestamp = parseOptionalTimestamp(req.query.beforeTimestamp, 'beforeTimestamp');
        const includeRestored = parseBoolean(req.query.includeRestored);
        const messages = db.getArchivedMessages(limit, appId, beforeTimestamp, includeRestored);
        res.json({
            messages,
            hasMore: messages.length === limit,
            limit
        });
    } catch (error) {
        res.status(400).json({ error: error.message || '参数错误' });
    }
});

router.post('/archive/restore', async (req, res) => {
    try {
        const archiveIds = req.body?.archiveIds;
        if (!Array.isArray(archiveIds) || archiveIds.length === 0) {
            return res.status(400).json({ error: 'archiveIds 不能为空数组' });
        }

        const result = await db.restoreArchivedMessages(archiveIds);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: error.message || '恢复失败' });
    }
});

// Create App
router.post('/apps', async (req, res) => {
    const newApp = await config.addApp(req.body);
    if (newApp) {
        res.json({ success: true, app: newApp });
    } else {
        res.status(400).json({ error: 'Failed to create app. ID might be duplicate or missing fields.' });
    }
});

// Update App
router.put('/apps/:id', async (req, res) => {
    const updated = await config.updateApp(req.params.id, req.body);
    if (updated) {
        res.json({ success: true, app: updated });
    } else {
        res.status(404).json({ error: 'App not found' });
    }
});

// Delete App
router.delete('/apps/:id', async (req, res) => {
    const success = await config.deleteApp(req.params.id);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'App not found' });
    }
});

// Change Admin Password
router.post('/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '请提供当前密码和新密码' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度至少 6 位' });
    }

    if (!settings.verifyPassword(currentPassword)) {
        return res.status(401).json({ error: '当前密码错误' });
    }

    if (await settings.setPassword(newPassword)) {
        res.json({ success: true, message: '密码已更新，请重新登录' });
    } else {
        res.status(500).json({ error: '保存密码失败' });
    }
});

module.exports = router;
