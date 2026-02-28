import type { ChatMessage, MessageQuote } from "../../types";
import { ACK_TIMEOUT_MS, MAX_SEND_RETRIES, RETRY_DELAY_MS } from "../../../../packages/chat-core/index.js";
import { SOCKET_EVENTS, type SocketClientPayloadMap } from "../../../../packages/protocol/socket-events.js";
import { parseChatMessageAck } from "./payloadParser";

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

type NormalizedSendMessageInput = SendMessageInput & {
  clientMessageId: string;
};

type EmitWithAck = (
  event: keyof SocketClientPayloadMap,
  payload: SocketClientPayloadMap[keyof SocketClientPayloadMap],
  handler: (ack: unknown) => void,
  options?: { traceId?: string; sessionId?: string }
) => void;

type SendTask = {
  payload: NormalizedSendMessageInput;
  traceId: string;
  retriesLeft: number;
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
};

export class OutboxService {
  private readonly queue: SendTask[] = [];
  private emitWithAck: EmitWithAck | undefined;
  private timer: NodeJS.Timeout | undefined;
  private sending = false;

  public bindEmitter(emitWithAck: EmitWithAck | undefined): void {
    this.emitWithAck = emitWithAck;
  }

  public enqueue(payload: NormalizedSendMessageInput, traceId: string): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        payload,
        traceId,
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
          const sent = await this.sendWithAck(this.emitWithAck, task);
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

  private sendWithAck(emitWithAck: EmitWithAck, task: SendTask): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("消息确认超时"));
      }, ACK_TIMEOUT_MS);

      emitWithAck(SOCKET_EVENTS.CHAT_MESSAGE, task.payload, (ack: unknown) => {
        if (timedOut) {
          return;
        }
        clearTimeout(timer);
        try {
          resolve(parseChatMessageAck(ack));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, {
        traceId: task.traceId,
      });
    });
  }
}
