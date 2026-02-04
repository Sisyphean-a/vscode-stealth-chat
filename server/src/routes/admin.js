const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../db');
const { initSocket } = require('../socket'); // We might need this to reload namespaces if we were using namespaces, but we are using Rooms in Main namespace. Config changes affect next auth attempt immediately.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Middleware to check admin password
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <password>"
    if (token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

// Login check
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: password });
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

module.exports = router;
