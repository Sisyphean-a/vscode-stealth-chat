const express = require('express');
const router = express.Router();
const config = require('../config');
const { processImage } = require('../utils/imageStorage');

// 提升 JSON body 限制到 10MB（图片 base64）
router.use(express.json({ limit: '10mb' }));

// App token 认证中间件
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const app = config.findAppByToken(token);
    if (!app) {
        return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    req.app_context = app;
    next();
};

router.use(authMiddleware);

/**
 * POST /api/upload
 * Body: { data: "data:image/png;base64,...", filename: "image.png", mimeType: "image/png" }
 * Returns: { success: true, attachment: { type, data?, url?, size, filename } }
 */
router.post('/', async (req, res) => {
    try {
        const { data, filename, mimeType } = req.body;

        if (!data) {
            return res.status(400).json({ success: false, error: 'Missing image data' });
        }

        // 提取 base64 数据（去掉 data URL 前缀）
        let base64Data = data;
        let detectedMime = mimeType || 'image/png';

        if (base64Data.startsWith('data:')) {
            const match = base64Data.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (match) {
                detectedMime = match[1];
                base64Data = match[2];
            } else {
                return res.status(400).json({ success: false, error: 'Invalid data URL format' });
            }
        }

        const result = await processImage(base64Data, detectedMime, filename || 'image.png');

        const attachment = {
            type: 'image',
            data: result.data,
            url: result.url,
            filename: filename || 'image.png',
            size: result.size
        };

        res.json({ success: true, attachment });
    } catch (error) {
        console.error('[Upload] Failed:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
