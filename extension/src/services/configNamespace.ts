export const CURRENT_CONFIG_NAMESPACE = "stealthChat";
export const LEGACY_CONFIG_NAMESPACE = "tsLint";

export const CURRENT_CURSOR_STATE_KEY = `${CURRENT_CONFIG_NAMESPACE}.backgroundSyncCursors`;
export const LEGACY_CURSOR_STATE_KEY = `${LEGACY_CONFIG_NAMESPACE}.backgroundSyncCursors`;

export const MIGRATABLE_CONFIG_KEYS = [
  "serverUrl",
  "secret",
  "forceWebsocket",
  "autoReveal",
  "displayMode",
  "connections",
  "activeConnection",
  "backgroundSyncEnabled",
  "backgroundSyncIntervalMs",
] as const;

export type MigratableConfigKey = typeof MIGRATABLE_CONFIG_KEYS[number];

export function buildConfigPath(namespace: string, key: MigratableConfigKey): string {
  return `${namespace}.${key}`;
}

export function isConfigValueEmpty(key: MigratableConfigKey, value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  switch (key) {
    case "serverUrl":
    case "secret":
    case "displayMode":
    case "activeConnection":
      return typeof value !== "string" || value.trim().length === 0;
    case "connections":
      return !Array.isArray(value) || value.length === 0;
    default:
      return false;
  }
}

export function hasConfigValue(key: MigratableConfigKey, value: unknown): boolean {
  return !isConfigValueEmpty(key, value);
}
