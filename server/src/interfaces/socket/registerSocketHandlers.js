const { registerChatMessageHandler } = require("./handlers/chatMessageHandler");
const { registerHistoryHandlers } = require("./handlers/historyHandler");
const { registerAroundHandlers } = require("./handlers/aroundHandler");
const { registerSearchHandler } = require("./handlers/searchHandler");
const { registerReadReceiptHandler } = require("./handlers/readReceiptHandler");

function registerSocketHandlers(options) {
  registerChatMessageHandler(options);
  registerHistoryHandlers(options);
  registerAroundHandlers(options);
  registerSearchHandler(options);
  registerReadReceiptHandler(options);
}

module.exports = { registerSocketHandlers };
