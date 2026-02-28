import type { ChatMessage } from "../../types";

type FlushBatch = (messages: ChatMessage[]) => void;

export class IncomingBatcher {
  private readonly flushBatch: FlushBatch;
  private queue: ChatMessage[] = [];
  private frameId: number | undefined;

  public constructor(flushBatch: FlushBatch) {
    this.flushBatch = flushBatch;
  }

  public enqueue(message: ChatMessage): void {
    this.queue.push(message);
    this.scheduleFlush();
  }

  public drain(): ChatMessage[] {
    const next = [...this.queue];
    this.queue = [];
    return next;
  }

  public clear(): void {
    this.queue = [];
    this.cancelFrame();
  }

  public dispose(): void {
    this.cancelFrame();
  }

  private scheduleFlush(): void {
    if (this.frameId !== undefined) {
      return;
    }
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = undefined;
      const batch = this.drain();
      if (batch.length > 0) {
        this.flushBatch(batch);
      }
    });
  }

  private cancelFrame(): void {
    if (this.frameId === undefined) {
      return;
    }
    window.cancelAnimationFrame(this.frameId);
    this.frameId = undefined;
  }
}
