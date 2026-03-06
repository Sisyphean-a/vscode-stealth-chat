import type { ChatMessage } from '../../types';
import { derivePeerReadState } from '../../../../packages/chat-core/index.js';

type SummaryKind = 'none' | 'summaryOnly' | 'earlier' | 'latest';

export type PeerReadReceipt = {
  clientType: 'mobile' | 'vscode' | 'unknown';
  lastReadTimestamp: number;
  lastReadMessageId: number | null;
};

function formatClock(timestamp: number | null): string {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatSummaryText(kind: SummaryKind, timestamp: number | null, readerLabel: string): string {
  const timeText = formatClock(timestamp);
  if (!timeText || kind === 'none') {
    return '';
  }
  if (kind === 'summaryOnly') {
    return `${readerLabel}读到 ${timeText}`;
  }
  if (kind === 'earlier') {
    return `${readerLabel}读到较早消息 ${timeText}`;
  }
  return `${readerLabel}最新已读 ${timeText}`;
}

export function derivePeerReadMeta(options: {
  messages: ChatMessage[];
  ownSource: 'mobile' | 'vscode';
  readerLabel: string;
  receipt: PeerReadReceipt | null;
}): { anchorMessageId: number | null; summaryText: string } {
  const state = derivePeerReadState({
    messages: options.messages,
    ownSource: options.ownSource,
    receipt: options.receipt,
  });
  return {
    anchorMessageId: state.anchorMessageId,
    summaryText: formatSummaryText(state.summaryKind, state.timestamp, options.readerLabel),
  };
}
