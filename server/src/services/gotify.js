const axios = require('axios');

const GOTIFY_URL = process.env.GOTIFY_URL || 'http://gotify:80/message';

/**
 * Send a notification via Gotify
 * @param {string} title 
 * @param {string} message 
 * @param {number} priority 
 * @param {string} clickUrl 
 */
async function sendNotification(title, message, priority = 5, clickUrl) {
    try {
        const token = process.env.GOTIFY_TOKEN;
        if (!token) {
            console.warn('[Gotify] Skipped: No token configured');
            return;
        }

        const payload = {
            title,
            message,
            priority,
            extras: {}
        };

        if (clickUrl) {
            payload.extras["android::action"] = {
                "onReceive": { "intentUrl": clickUrl }
            };
        }

        await axios.post(`${GOTIFY_URL}?token=${token}`, payload);
        console.log(`[Gotify] Notification sent: ${title}`);
    } catch (error) {
        console.error(`[Gotify] Failed to send notification: ${error.message}`);
    }
}

module.exports = { sendNotification };
