const axios = require('axios');

const GOTIFY_TIMEOUT_MS = 3000;

/**
 * Send a notification via Gotify
 * @param {string} title 
 * @param {string} message 
 * @param {number} priority 
 * @param {string} clickUrl 
 * @param {Object} appConfig - App specific config { gotifyToken: string, gotifyUrl: string }
 */
async function sendNotification(title, message, priority = 5, clickUrl, appConfig) {
    try {
        if (!appConfig || !appConfig.gotifyToken) {
            console.warn('[Gotify] Skipped: No token configured for this app');
            return;
        }

        const token = appConfig.gotifyToken;
        const url = appConfig.gotifyUrl; // Config module ensures this has a value/default

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

        await axios.post(`${url}?token=${token}`, payload, {
            timeout: GOTIFY_TIMEOUT_MS,
        });
        console.log(`[Gotify] Notification sent: ${title} (App: ${appConfig.name})`);
    } catch (error) {
        console.error(`[Gotify] Failed to send notification: ${error.message}`);
    }
}

module.exports = { sendNotification };
