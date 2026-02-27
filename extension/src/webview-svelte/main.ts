import "./styles/shell.css";
import "./styles/composer.css";
import "./styles/panels.css";
import "./styles/bubble.css";
import "./styles/log.css";
import "./styles/gap.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Webview root element #app not found");
}

const app = new App({
  target,
});

export default app;
