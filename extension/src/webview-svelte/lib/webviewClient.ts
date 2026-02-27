import { isHostMessage, type HostMessage, type WebviewMessage } from "../../webview-bridge/protocol";

type VsCodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

const vscode = acquireVsCodeApi();

export function postToHost(message: WebviewMessage): void {
  vscode.postMessage(message);
}

export function listenHostMessages(handler: (message: HostMessage) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (!isHostMessage(event.data)) {
      console.error("[WebView] Invalid host message", event.data);
      return;
    }
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => {
    window.removeEventListener("message", listener);
  };
}
