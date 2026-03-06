import * as conversationStore from "./conversationStore";
import * as statusBar from "../ui/statusBar";

function refreshStatusBarUnread(): void {
  statusBar.setUnreadCount(conversationStore.getTotalUnread());
}

export function clearUnreadForConnection(connectionName: string): void {
  const safeName = connectionName.trim();
  if (!safeName) {
    return;
  }
  conversationStore.clearUnread(safeName);
  refreshStatusBarUnread();
}

export function clearUnreadForActiveConversation(): void {
  const activeConnection = conversationStore.getActiveConversationName();
  if (!activeConnection) {
    return;
  }
  clearUnreadForConnection(activeConnection);
}

export function clearUnreadForAppId(appId: string): void {
  const safeAppId = appId.trim();
  if (!safeAppId) {
    return;
  }
  const connectionName = conversationStore.getConnectionByAppId(safeAppId);
  if (!connectionName) {
    return;
  }
  clearUnreadForConnection(connectionName);
}
