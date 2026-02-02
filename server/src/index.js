const express = require("express");
const http = require("http");
const path = require("path");
const { initSocket } = require("./socket");
const db = require("./db");

const { setupGotify } = require("./services/gotify-setup");

const app = express();
const server = http.createServer(app);

// Start Server Sequence
(async () => {
  try {
    // 1. Auto-configure Gotify Token
    await setupGotify();

    // 2. Initialize Database
    await db.init();
    console.log("[Server] Database initialized");

    // 3. Initialize Socket.io
    initSocket(server);

    // 4. Serve static files (Mobile Client)
    app.use(express.static(path.join(__dirname, "public")));

    // 5. Start Listening
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`[Server] running on port ${PORT}`);
      console.log(
        `[Server] Secret: ${process.env.STEALTH_SECRET ? "***" : "Default (ChangeMeInProduction)"}`,
      );
    });

  } catch (err) {
    console.error("[Server] Startup failed:", err);
    process.exit(1);
  }
})();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    messageCount: db.getMessageCount(),
    database: "connected",
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[Server] Shutting down gracefully...");
  db.close();
  process.exit(0);
});
