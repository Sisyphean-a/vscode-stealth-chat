import * as vscode from "vscode";

const DEFAULT_DEBOUNCE_MS = 200;

export type ConfigChangeKind = "connection" | "backgroundSync" | "display";

type ConfigWatcherOptions = {
  readonly debounceMs?: number;
  readonly onChange: (kinds: ReadonlySet<ConfigChangeKind>) => void;
};

function collectKinds(event: vscode.ConfigurationChangeEvent): ConfigChangeKind[] {
  const kinds: ConfigChangeKind[] = [];
  if (
    event.affectsConfiguration("tsLint.activeConnection")
    || event.affectsConfiguration("tsLint.connections")
    || event.affectsConfiguration("tsLint.serverUrl")
    || event.affectsConfiguration("tsLint.secret")
  ) {
    kinds.push("connection");
  }
  if (
    event.affectsConfiguration("tsLint.backgroundSyncEnabled")
    || event.affectsConfiguration("tsLint.backgroundSyncIntervalMs")
  ) {
    kinds.push("backgroundSync");
  }
  if (event.affectsConfiguration("tsLint.displayMode")) {
    kinds.push("display");
  }
  return kinds;
}

export class ConfigWatcher implements vscode.Disposable {
  private readonly onChange: (kinds: ReadonlySet<ConfigChangeKind>) => void;
  private readonly debounceMs: number;
  private readonly pendingKinds = new Set<ConfigChangeKind>();
  private timer: NodeJS.Timeout | undefined;

  public constructor(options: ConfigWatcherOptions) {
    this.onChange = options.onChange;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  public push(event: vscode.ConfigurationChangeEvent): void {
    for (const kind of collectKinds(event)) {
      this.pendingKinds.add(kind);
    }
    if (this.pendingKinds.size === 0) {
      return;
    }
    this.scheduleFlush();
  }

  public dispose(): void {
    if (!this.timer) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleFlush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.debounceMs);
  }

  private flush(): void {
    if (this.pendingKinds.size === 0) {
      return;
    }
    const snapshot = new Set(this.pendingKinds);
    this.pendingKinds.clear();
    this.onChange(snapshot);
  }
}
