const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const settings = require('../settings');

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
        apps: apps,
        dbPath: process.env.DB_PATH || 'default'
    });
});

// Create App
router.post('/apps', (req, res) => {
    const newApp = config.addApp(req.body);
    if (newApp) {
        res.json({ success: true, app: newApp });
    } else {
        res.status(400).json({ error: 'Failed to create app. ID might be duplicate or missing fields.' });
    }
});

// Update App
router.put('/apps/:id', (req, res) => {
    const updated = config.updateApp(req.params.id, req.body);
    if (updated) {
        res.json({ success: true, app: updated });
    } else {
        res.status(404).json({ error: 'App not found' });
    }
});

// Delete App
router.delete('/apps/:id', (req, res) => {
    const success = config.deleteApp(req.params.id);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'App not found' });
    }
});

// Change Admin Password
router.post('/password', (req, res) => {
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

    if (settings.setPassword(newPassword)) {
        res.json({ success: true, message: '密码已更新，请重新登录' });
    } else {
        res.status(500).json({ error: '保存密码失败' });
    }
});

module.exports = router;
