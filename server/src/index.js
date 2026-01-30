const express = require("express");
const http = require("http");
const path = require("path");
const { initSocket } = require("./socket");
const db = require("./db");

const app = express();
const server = http.createServer(app);

// Initialize Database (async)
db.init()
  .then(() => {
    console.log("[Server] Database initialized");
  })
  .catch((err) => {
    console.error("[Server] Database initialization failed:", err);
  });

// Initialize Socket.io
initSocket(server);

// Serve static files (Mobile Client)
app.use(express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    messageCount: db.getMessageCount(),
    database: "connected",
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] running on port ${PORT}`);
  console.log(
    `[Server] Secret: ${process.env.STEALTH_SECRET ? "***" : "Default (ChangeMeInProduction)"}`,
  );
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[Server] Shutting down gracefully...");
  db.close();
  process.exit(0);
});
