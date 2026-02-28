import type { ChatMessage, MessageQuote } from "../../types";
import { ACK_TIMEOUT_MS, MAX_SEND_RETRIES, RETRY_DELAY_MS } from "../../../../packages/chat-core/index.js";
import { SOCKET_EVENTS, getAckData, getAckErrorMessage, isAckOk } from "../../../../packages/protocol/socket-events.js";

export type SendMessageInput = {
  text: string;
  source: "mobile" | "vscode";
  clickUrl?: string;
  attachments?: Array<{
    type: string;
    data?: string;
    url?: string;
    filename?: string;
    size?: number;
  }>;
  quote?: MessageQuote;
  clientMessageId?: string;
};

type EmitWithAck = (
  event: string,
  payload: unknown,
  handler: (ack: unknown) => void
) => void;

type SendTask = {
  payload: SendMessageInput;
  retriesLeft: number;
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
};

function parseAckChatMessage(payload: unknown): ChatMessage | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const wrapped = getAckData<{ message?: ChatMessage }>(payload);
  if (wrapped && typeof wrapped === "object" && wrapped.message) {
    return wrapped.message;
  }
  const legacy = payload as { message?: ChatMessage };
  return legacy.message ?? null;
}

export class OutboxService {
  private readonly queue: SendTask[] = [];
  private emitWithAck: EmitWithAck | undefined;
  private timer: NodeJS.Timeout | undefined;
  private sending = false;

  public bindEmitter(emitWithAck: EmitWithAck | undefined): void {
    this.emitWithAck = emitWithAck;
  }

  public enqueue(payload: SendMessageInput): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        payload,
        retriesLeft: MAX_SEND_RETRIES,
        resolve,
        reject,
      });
      this.scheduleFlush(0);
    });
  }

  public scheduleFlush(delayMs = 0): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delayMs);
  }

  public async flush(): Promise<void> {
    if (!this.emitWithAck || this.sending || this.queue.length === 0) {
      return;
    }
    this.sending = true;
    try {
      while (this.queue.length > 0) {
        const task = this.queue[0];
        try {
          const sent = await this.sendWithAck(this.emitWithAck, task.payload);
          this.queue.shift();
          task.resolve(sent);
        } catch (error) {
          if (task.retriesLeft <= 0) {
            this.queue.shift();
            task.reject(error instanceof Error ? error : new Error(String(error)));
            continue;
          }
          task.retriesLeft -= 1;
          this.scheduleFlush(RETRY_DELAY_MS);
          return;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  private sendWithAck(emitWithAck: EmitWithAck, payload: SendMessageInput): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("消息确认超时"));
      }, ACK_TIMEOUT_MS);

      emitWithAck(SOCKET_EVENTS.CHAT_MESSAGE, payload, (ack: unknown) => {
        if (timedOut) {
          return;
        }
        clearTimeout(timer);
        if (!isAckOk(ack)) {
          reject(new Error(getAckErrorMessage(ack, "发送失败")));
          return;
        }
        const message = parseAckChatMessage(ack);
        if (!message) {
          reject(new Error("发送响应缺少消息内容"));
          return;
        }
        resolve(message);
      });
    });
  }
}
