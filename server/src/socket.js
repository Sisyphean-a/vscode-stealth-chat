const { Server } = require("socket.io");
const { sendNotification } = require('./services/gotify');

const CHAT_SECRET = process.env.STEALTH_SECRET || 'ChangeMeInProduction';
// External URL for the phone to open when clicking notification
const CLICK_URL = process.env.CLICK_URL || 'http://localhost:3000';

function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: "*" }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (token === CHAT_SECRET) {
            next();
        } else {
            console.log(`[Socket] Authorized access attempt: ${socket.id}`);
            next(new Error("Unauthorized"));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        socket.on('chat message', (msg) => {
            // Broadcast to all clients (VS Code & Mobile)
            io.emit('chat message', msg);

            // Handle VS Code -> Mobile Notification
            if (msg.source === 'vscode') {
                console.log("[Socket] Message from VS Code, triggering Gotify...");
                sendNotification(
                    "New Reply",
                    msg.text,
                    8,
                    CLICK_URL
                );
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
        });
    });

    return io;
}

module.exports = { initSocket };
