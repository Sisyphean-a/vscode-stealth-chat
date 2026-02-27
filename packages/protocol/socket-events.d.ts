export const SOCKET_EVENTS: Readonly<{
  CHAT_MESSAGE: "chat message";
  LOAD_HISTORY: "load history";
  HISTORY_LOADED: "history loaded";
  LOAD_MORE_HISTORY: "load more history";
  MORE_HISTORY_LOADED: "more history loaded";
  LOAD_AROUND_MESSAGE: "load around message";
  AROUND_MESSAGE_LOADED: "around message loaded";
  LOAD_AROUND_ARCHIVED_MESSAGE: "load around archived message";
  AROUND_ARCHIVED_MESSAGE_LOADED: "around archived message loaded";
  SEARCH_MESSAGES: "search messages";
  MARK_READ: "mark read";
  PRESENCE_UPDATE: "presence update";
  READ_RECEIPT: "read receipt";
}>;

export type AckOk<T = unknown> = {
  ok: true;
  data: T;
};

export type AckError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  data?: unknown;
};

export function buildAckOk<T>(data: T): AckOk<T>;
export function buildAckError(code: string, message: string, data?: unknown): AckError;
export function isAckOk<T = unknown>(ack: unknown): ack is AckOk<T>;
export function getAckData<T = unknown>(ack: unknown): T | null;
export function getAckErrorMessage(ack: unknown, fallback?: string): string;
