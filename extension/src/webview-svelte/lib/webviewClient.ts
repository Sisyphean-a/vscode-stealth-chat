import {
  buildWebviewMessage,
  parseHostMessage,
  type HostMessage,
  type WebviewMessageBody,
} from "../../webview-bridge/protocol";

type VsCodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

const vscode = acquireVsCodeApi();

export function postToHost(message: WebviewMessageBody): void {
  vscode.postMessage(buildWebviewMessage(message));
}

export function listenHostMessages(handler: (message: HostMessage) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    try {
      handler(parseHostMessage(event.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[WebView] Invalid host message:", message, event.data);
      return;
    }
  };
  window.addEventListener("message", listener);
  return () => {
    window.removeEventListener("message", listener);
  };
}
