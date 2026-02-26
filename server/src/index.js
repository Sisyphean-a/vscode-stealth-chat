const express = require("express");
const http = require("http");
const path = require("path");
const { initSocket } = require("./socket");
const db = require("./db");
const { IMAGES_DIR, cleanupOldImages } = require("./utils/imageStorage");
const adminRoutes = require("./routes/admin");
const uploadRoutes = require("./routes/upload");

const app = express();
const server = http.createServer(app);

app.use("/api/upload", express.json({ limit: "10mb" }));
app.use(express.json());

async function startServer() {
  await db.init();
  console.log("[Server] Database initialized");

  initSocket(server);

  app.use("/api/admin", adminRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use(express.static(path.join(__dirname, "public")));

  app.use("/uploads", express.static(IMAGES_DIR));
  console.log(`[Server] Serving uploaded images from ${IMAGES_DIR}`);

  setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);
  console.log("[Server] Image cleanup scheduled (daily)");

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`[Server] running on port ${PORT}`);
  });
}

void startServer().catch((error) => {
  console.error("[Server] Startup failed:", error);
  process.exit(1);
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    messageCount: db.getMessageCount(),
    archiveMessageCount: db.getArchiveMessageCount(),
    database: db.getDatabaseStatus(),
  });
});

let shutdownStarted = false;
process.on("SIGINT", async () => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  console.log("[Server] Shutting down gracefully...");
  try {
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error("[Server] Shutdown failed:", error);
    process.exit(1);
  }
});
