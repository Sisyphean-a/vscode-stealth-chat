const { Server } = require("socket.io");
const db = require("./db");
const config = require("./config");
const { sendNotification } = require("./services/gotify");
const { processImage } = require("./utils/imageStorage");
const runtime = require("./interfaces/socket/runtime");
const { registerSocketHandlers } = require("./interfaces/socket/registerSocketHandlers");

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const app = config.findAppByToken(token);
    const clientType = runtime.normalizeClientType(socket.handshake.auth.clientType);

    if (app) {
      socket.data.app = app;
      socket.data.appId = app.id;
      socket.data.clientType = clientType;
      next();
    } else {
      console.log(`[Socket] Unauthorized access attempt: ${socket.id}`);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { app, appId } = socket.data;
    console.log(`[Socket] Client connected: ${socket.id} (App: ${app.name})`);
    socket.join(appId);
    runtime.emitPresenceUpdate(io, appId);
    registerSocketHandlers({
      io,
      socket,
      app,
      appId,
      runtime,
      db,
      config,
      processImage,
      sendNotification,
      clickUrl: config.CLICK_URL,
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      runtime.emitPresenceUpdate(io, appId);
    });
  });

  return io;
}

module.exports = { initSocket };
