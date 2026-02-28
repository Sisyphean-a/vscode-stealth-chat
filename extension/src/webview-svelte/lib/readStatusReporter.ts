import { parsePositiveInt } from "./messageStore";

type PostReadPayload = (payload: {
  lastReadTimestamp: number;
  lastReadMessageId?: number;
}) => void;

const DEFAULT_THROTTLE_MS = 300;

export class ReadStatusReporter {
  private readonly postPayload: PostReadPayload;
  private readonly throttleMs: number;
  private lastSentTimestamp = 0;
  private pendingTimestamp = 0;
  private pendingMessageId: number | undefined;
  private timer: number | undefined;

  public constructor(postPayload: PostReadPayload, throttleMs = DEFAULT_THROTTLE_MS) {
    this.postPayload = postPayload;
    this.throttleMs = throttleMs;
  }

  public report(timestamp: number, messageId: unknown): void {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastSentTimestamp) {
      return;
    }
    this.pendingTimestamp = Number(timestamp);
    this.pendingMessageId = parsePositiveInt(messageId) || undefined;
    this.scheduleFlush();
  }

  public reset(): void {
    this.lastSentTimestamp = 0;
    this.pendingTimestamp = 0;
    this.pendingMessageId = undefined;
    this.clearTimer();
  }

  public dispose(): void {
    this.clearTimer();
  }

  private scheduleFlush(): void {
    if (this.timer !== undefined) {
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.throttleMs);
  }

  private flush(): void {
    if (this.pendingTimestamp <= this.lastSentTimestamp) {
      return;
    }
    this.lastSentTimestamp = this.pendingTimestamp;
    this.postPayload({
      lastReadTimestamp: this.pendingTimestamp,
      lastReadMessageId: this.pendingMessageId,
    });
  }

  private clearTimer(): void {
    if (this.timer === undefined) {
      return;
    }
    window.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
