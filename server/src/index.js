const express = require("express");
const http = require("http");
const path = require("path");
const { initSocket } = require("./socket");
const db = require("./db");
const { IMAGES_DIR, cleanupOldImages } = require("./utils/imageStorage");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

// Parser middleware
app.use(express.json());

// Start Server Sequence
(async () => {
  try {
    // 1. Initialize Database
    await db.init();
    console.log("[Server] Database initialized");

    // 2. Initialize Socket.io
    initSocket(server);

    // 3. Admin Routes
    app.use("/api/admin", adminRoutes);

    // 4. Serve static files (Mobile Client & Admin UI)
    app.use(express.static(path.join(__dirname, "public")));

    // 5. Serve uploaded images
    app.use("/uploads", express.static(IMAGES_DIR));
    console.log(`[Server] Serving uploaded images from ${IMAGES_DIR}`);

    // 6. Start periodic image cleanup (daily)
    setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);
    console.log("[Server] Image cleanup scheduled (daily)");

    // 7. Start Listening
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`[Server] running on port ${PORT}`);
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
