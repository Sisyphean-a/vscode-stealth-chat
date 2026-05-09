import * as vscode from "vscode";
import {
  buildConfigPath,
  CURRENT_CONFIG_NAMESPACE,
  LEGACY_CONFIG_NAMESPACE,
  type MigratableConfigKey,
} from "../services/configNamespace";

const DEFAULT_DEBOUNCE_MS = 200;

export type ConfigChangeKind = "connection" | "backgroundSync" | "display";

type ConfigWatcherOptions = {
  readonly debounceMs?: number;
  readonly onChange: (kinds: ReadonlySet<ConfigChangeKind>) => void;
};

function affectsEitherNamespace(
  event: vscode.ConfigurationChangeEvent,
  key: MigratableConfigKey,
): boolean {
  return event.affectsConfiguration(buildConfigPath(CURRENT_CONFIG_NAMESPACE, key))
    || event.affectsConfiguration(buildConfigPath(LEGACY_CONFIG_NAMESPACE, key));
}

function collectKinds(event: vscode.ConfigurationChangeEvent): ConfigChangeKind[] {
  const kinds: ConfigChangeKind[] = [];
  if (
    affectsEitherNamespace(event, "activeConnection")
    || affectsEitherNamespace(event, "connections")
    || affectsEitherNamespace(event, "serverUrl")
    || affectsEitherNamespace(event, "secret")
    || affectsEitherNamespace(event, "forceWebsocket")
  ) {
    kinds.push("connection");
  }
  if (
    affectsEitherNamespace(event, "backgroundSyncEnabled")
    || affectsEitherNamespace(event, "backgroundSyncIntervalMs")
  ) {
    kinds.push("backgroundSync");
  }
  if (affectsEitherNamespace(event, "displayMode")) {
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
