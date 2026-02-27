import "../webview/chat-core.css";
import "../webview/chat-bubble.css";
import "../webview/chat-log.css";
import "../webview/chat-gap.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Webview root element #app not found");
}

const app = new App({
  target,
});

export default app;
