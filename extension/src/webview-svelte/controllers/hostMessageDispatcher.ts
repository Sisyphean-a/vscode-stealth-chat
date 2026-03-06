import type { HostMessage } from '../../webview-bridge/protocol';
import type { ChatMessage, Connection, GlobalSettings } from '../../types';
import type { SearchResult } from '../lib/messageStore';
import type { DisplayMode } from '../lib/messageStore';

export type HostMessageHandlers = {
  onAddMessage: (message: ChatMessage) => void;
  onLoadHistory: (payload: unknown) => void;
  onPrependHistory: (payload: { messages: unknown; hasMore: boolean }) => void;
  onAroundLoaded: (payload: { messages: unknown; targetMessageId: number | null; error?: string | null }) => void;
  onAroundArchivedLoaded: (payload: { messages: unknown; targetArchiveId: number | null; error?: string | null }) => void;
  onUpdateStatus: (connected: boolean) => void;
  onPresenceUpdate: (payload: { total: number; mobile: number }) => void;
  onReadReceipt: (payload: {
    clientType: 'mobile' | 'vscode' | 'unknown';
    lastReadTimestamp: number;
    lastReadMessageId: number | null;
  }) => void;
  onSendFailed: (payload: { clientMessageId: string | null; error: string }) => void;
  onSearchResults: (payload: { keyword: string; results: SearchResult[]; error: string | null }) => void;
  onRuntimeConfig: (payload: { mode: DisplayMode; serverUrl: string; token: string }) => void;
  onClearMessages: () => void;
  onConfigLoaded: (payload: {
    globalSettings: GlobalSettings;
    connections: Connection[];
    activeConnection: string;
  }) => void;
  onOperationResult: (payload: { success: boolean; message: string }) => void;
  onTestResult: (payload: { name: string; success: boolean; latency?: number }) => void;
};

export function dispatchHostMessage(message: HostMessage, handlers: HostMessageHandlers): void {
  if (message.type === 'addMessage') {
    handlers.onAddMessage(message.payload);
    return;
  }
  if (message.type === 'loadHistory') {
    handlers.onLoadHistory(message.payload);
    return;
  }
  if (message.type === 'prependHistory') {
    handlers.onPrependHistory(message.payload);
    return;
  }
  if (message.type === 'aroundMessagesLoaded') {
    handlers.onAroundLoaded(message.payload);
    return;
  }
  if (message.type === 'aroundArchivedMessagesLoaded') {
    handlers.onAroundArchivedLoaded(message.payload);
    return;
  }
  if (message.type === 'updateStatus') {
    handlers.onUpdateStatus(message.payload.connected);
    return;
  }
  if (message.type === 'presenceUpdate') {
    handlers.onPresenceUpdate({ total: message.payload.total, mobile: message.payload.mobile });
    return;
  }
  if (message.type === 'readReceipt') {
    handlers.onReadReceipt({
      clientType: message.payload.clientType,
      lastReadTimestamp: message.payload.lastReadTimestamp,
      lastReadMessageId: message.payload.lastReadMessageId,
    });
    return;
  }
  if (message.type === 'sendFailed') {
    handlers.onSendFailed({
      clientMessageId: message.payload.clientMessageId || null,
      error: message.payload.error || '发送失败',
    });
    return;
  }
  if (message.type === 'searchResults') {
    handlers.onSearchResults({
      keyword: message.payload.keyword,
      results: message.payload.results || [],
      error: message.payload.error,
    });
    return;
  }
  if (message.type === 'setDisplayMode') {
    handlers.onRuntimeConfig(message.payload);
    return;
  }
  if (message.type === 'clearMessages') {
    handlers.onClearMessages();
    return;
  }
  if (message.type === 'configLoaded') {
    handlers.onConfigLoaded(message.payload);
    return;
  }
  if (message.type === 'operationResult') {
    handlers.onOperationResult(message.payload);
    return;
  }
  if (message.type === 'testResult') {
    handlers.onTestResult({
      name: message.payload.name,
      success: message.payload.success,
      latency: message.payload.latency,
    });
  }
}
