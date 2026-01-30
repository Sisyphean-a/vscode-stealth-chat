const express = require('express');
const http = require('http');
const path = require('path');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Serve static files (Mobile Client)
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] running on port ${PORT}`);
    console.log(`[Server] Secret: ${process.env.STEALTH_SECRET ? '***' : 'Default (ChangeMeInProduction)'}`);
});
