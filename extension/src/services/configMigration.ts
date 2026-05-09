import {
  CURRENT_CONFIG_NAMESPACE,
  CURRENT_CURSOR_STATE_KEY,
  hasConfigValue,
  LEGACY_CONFIG_NAMESPACE,
  LEGACY_CURSOR_STATE_KEY,
  MIGRATABLE_CONFIG_KEYS,
  type MigratableConfigKey,
} from "./configNamespace";

type ConfigSnapshot = Partial<Record<MigratableConfigKey, unknown>>;
type ConfigExistsMap = Partial<Record<MigratableConfigKey, boolean>>;
type ConfigTargetMap = Partial<Record<MigratableConfigKey, ConfigTarget>>;
type CursorState = Record<string, { timestamp: number; id: number }>;
type ConfigTarget = "global" | "workspace" | "workspaceFolder";

type ConfigMigrationUpdate = {
  key: MigratableConfigKey;
  value: unknown;
};

type InspectResult<T> = {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
};

type WorkspaceConfigurationLike = {
  get<T>(section: string): T | undefined;
  update(section: string, value: unknown, configurationTarget?: unknown): PromiseLike<void>;
  inspect<T>(section: string): InspectResult<T> | undefined;
};

type MementoLike = {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
};

function pickConfiguredValue<T>(inspect: InspectResult<T> | undefined): {
  exists: boolean;
  value: T | undefined;
  target: ConfigTarget | undefined;
} {
  if (!inspect) {
    return { exists: false, value: undefined, target: undefined };
  }
  if (inspect.workspaceFolderValue !== undefined) {
    return { exists: true, value: inspect.workspaceFolderValue, target: "workspaceFolder" };
  }
  if (inspect.workspaceValue !== undefined) {
    return { exists: true, value: inspect.workspaceValue, target: "workspace" };
  }
  if (inspect.globalValue !== undefined) {
    return { exists: true, value: inspect.globalValue, target: "global" };
  }
  return { exists: false, value: undefined, target: undefined };
}

function hasCursorStateEntries(state: CursorState | undefined): boolean {
  return !!state && Object.keys(state).length > 0;
}

export function buildConfigMigrationUpdates(options: {
  currentValues: ConfigSnapshot;
  legacyValues: ConfigSnapshot;
  legacyExists: ConfigExistsMap;
}): ConfigMigrationUpdate[] {
  const updates: ConfigMigrationUpdate[] = [];
  for (const key of MIGRATABLE_CONFIG_KEYS) {
    if (!options.legacyExists[key]) {
      continue;
    }
    const currentValue = options.currentValues[key];
    const legacyValue = options.legacyValues[key];
    if (hasConfigValue(key, currentValue) || !hasConfigValue(key, legacyValue)) {
      continue;
    }
    updates.push({ key, value: legacyValue });
  }
  return updates;
}

export function buildCursorStateMigrationUpdate(
  currentState: CursorState | undefined,
  legacyState: CursorState | undefined,
): CursorState | undefined {
  if (hasCursorStateEntries(currentState) || !hasCursorStateEntries(legacyState)) {
    return undefined;
  }
  return legacyState;
}

export async function migrateLegacyConfiguration(globalState: MementoLike): Promise<void> {
  const vscode = await import("vscode");
  const currentConfig = vscode.workspace.getConfiguration(CURRENT_CONFIG_NAMESPACE) as WorkspaceConfigurationLike;
  const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIG_NAMESPACE) as WorkspaceConfigurationLike;

  const currentValues: ConfigSnapshot = {};
  const legacyValues: ConfigSnapshot = {};
  const legacyExists: ConfigExistsMap = {};
  const legacyTargets: ConfigTargetMap = {};

  for (const key of MIGRATABLE_CONFIG_KEYS) {
    currentValues[key] = currentConfig.get(key);
    const legacyValue = pickConfiguredValue(legacyConfig.inspect(key));
    legacyExists[key] = legacyValue.exists;
    legacyValues[key] = legacyValue.value;
    legacyTargets[key] = legacyValue.target;
  }

  for (const update of buildConfigMigrationUpdates({ currentValues, legacyValues, legacyExists })) {
    const target = legacyTargets[update.key];
    const configurationTarget = target === "workspaceFolder"
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : target === "workspace"
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await currentConfig.update(update.key, update.value, configurationTarget);
  }

  const currentCursorState = globalState.get<CursorState>(CURRENT_CURSOR_STATE_KEY, {});
  const legacyCursorState = globalState.get<CursorState>(LEGACY_CURSOR_STATE_KEY, {});
  const cursorStateUpdate = buildCursorStateMigrationUpdate(currentCursorState, legacyCursorState);
  if (cursorStateUpdate) {
    await globalState.update(CURRENT_CURSOR_STATE_KEY, cursorStateUpdate);
  }
}
