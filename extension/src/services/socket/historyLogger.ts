import type { ChatMessage } from "../../types";
import { formatTimestamp, getCurrentTimestamp, getDateKey } from "../../utils/helpers";

const DAY_SEPARATOR_TIME = "00:00:00";

export class HistoryLogger {
  private outputChannel: import("vscode").OutputChannel | undefined;
  private lastDisplayedDate = "";

  public setOutputChannel(channel: import("vscode").OutputChannel): void {
    this.outputChannel = channel;
  }

  public logInfo(message: string): void {
    this.outputChannel?.appendLine(`[Info - ${getCurrentTimestamp()}] ${message}`);
  }

  public logError(message: string): void {
    this.outputChannel?.appendLine(`[Error - ${getCurrentTimestamp()}] ${message}`);
  }

  public logHistoryLoaded(messages: readonly ChatMessage[]): void {
    if (messages.length === 0) {
      this.logInfo("No historical messages found");
      return;
    }

    this.logInfo(`Loading ${messages.length} historical messages...`);
    this.lastDisplayedDate = "";

    for (const message of messages) {
      this.showDateSeparator(message.timestamp);
      const msgTime = new Date(message.timestamp);
      const prefix = message.source === "mobile" ? "Process" : "Sent";
      this.outputChannel?.appendLine(
        `[Info - ${formatTimestamp(msgTime)}] ${prefix}: ${message.text}`,
      );
    }
    this.logInfo("History loaded successfully");
  }

  public showDateSeparator(timestamp: number): void {
    const date = getDateKey(timestamp);
    if (date === this.lastDisplayedDate) {
      return;
    }
    this.outputChannel?.appendLine(`[Info - ${DAY_SEPARATOR_TIME}] ═══════════ ${date} ═══════════`);
    this.lastDisplayedDate = date;
  }

  public resetDateSeparator(): void {
    this.lastDisplayedDate = "";
  }
}
