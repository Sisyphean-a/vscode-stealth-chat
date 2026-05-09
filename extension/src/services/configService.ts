/**
 * 配置读写服务
 */
import { Connection, GlobalSettings } from "../types";
import {
  DEFAULT_SERVER_URL,
  getCompatibleConfigValue,
  normalizeServerUrl,
  updateCurrentConfigValue,
} from "../utils/helpers";

/**
 * 获取全局设置
 */
export function getGlobalSettings(): GlobalSettings {
  const serverUrl = normalizeServerUrl(
    getCompatibleConfigValue<string>("serverUrl", DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL
  );
  const rawDisplayMode = getCompatibleConfigValue<string>("displayMode", "bubble");
  return {
    serverUrl,
    forceWebsocket: getCompatibleConfigValue<boolean>("forceWebsocket", false) || false,
    autoReveal: getCompatibleConfigValue<boolean>("autoReveal", false) || false,
    displayMode: rawDisplayMode === "log" ? "log" : "bubble",
  };
}

/**
 * 保存全局设置
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await updateCurrentConfigValue("serverUrl", normalizeServerUrl(settings.serverUrl));
  await updateCurrentConfigValue("forceWebsocket", settings.forceWebsocket);
  await updateCurrentConfigValue("autoReveal", settings.autoReveal);
  await updateCurrentConfigValue("displayMode", settings.displayMode);
}

/**
 * 确保默认连接配置存在
 * 当 connections 为空时，基于旧配置自动创建默认连接
 */
export async function ensureDefaultConnection(): Promise<void> {
  const connections = getCompatibleConfigValue<Connection[]>("connections", []) || [];
  if (connections.length > 0) {
    return;
  }

  const serverUrl = normalizeServerUrl(
    getCompatibleConfigValue<string>("serverUrl", DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL
  );
  const token = getCompatibleConfigValue<string>("secret", "") || "";

  // 如果没有有效 token，不创建默认连接
  if (!token || token === "ChangeMeInProduction") {
    return;
  }

  const defaultConn: Connection = {
    name: "本地默认",
    serverUrl,
    token,
    backgroundSync: true,
  };

  await updateCurrentConfigValue("connections", [defaultConn]);
  await updateCurrentConfigValue("activeConnection", defaultConn.name);
}

/**
 * 获取连接列表
 */
export function getConnections(): Connection[] {
  return getCompatibleConfigValue<Connection[]>("connections", []) || [];
}

/**
 * 获取活跃连接名称
 */
export function getActiveConnectionName(): string {
  return getCompatibleConfigValue<string>("activeConnection", "") || "";
}

/**
 * 保存连接（添加或更新）
 */
export async function saveConnection(
  connection: Connection,
  originalName?: string
): Promise<void> {
  const connections = [...getConnections()];
  const normalizedConnection: Connection = {
    ...connection,
    serverUrl: connection.serverUrl
      ? normalizeServerUrl(connection.serverUrl)
      : undefined,
    backgroundSync: connection.backgroundSync !== false,
  };

  const searchName = originalName || normalizedConnection.name;
  const index = connections.findIndex((c) => c.name === searchName);

  if (index >= 0) {
    connections[index] = normalizedConnection;
  } else {
    connections.push(normalizedConnection);
  }

  await updateCurrentConfigValue("connections", connections);

  // 如果修改了名称且是活跃连接，更新活跃连接名
  if (originalName && originalName !== normalizedConnection.name) {
    const activeName = getActiveConnectionName();
    if (activeName === originalName) {
      await updateCurrentConfigValue("activeConnection", normalizedConnection.name);
    }
  }
}

/**
 * 删除连接
 */
export async function deleteConnection(name: string): Promise<void> {
  const connections = getConnections().filter((c) => c.name !== name);
  await updateCurrentConfigValue("connections", connections);

  // 如果删除的是活跃连接，清空或切换到第一个
  const activeName = getActiveConnectionName();
  if (activeName === name) {
    const newActive = connections.length > 0 ? connections[0].name : "";
    await updateCurrentConfigValue("activeConnection", newActive);
  }
}

/**
 * 设置活跃连接
 */
export async function setActiveConnection(name: string): Promise<void> {
  await updateCurrentConfigValue("activeConnection", name);
}

function sanitizeConnection(input: Connection): Connection {
  return {
    name: input.name.trim(),
    token: input.token.trim(),
    serverUrl: input.serverUrl ? normalizeServerUrl(input.serverUrl) : undefined,
    backgroundSync: input.backgroundSync !== false,
  };
}

function validateImportPayload(payload: {
  globalSettings: GlobalSettings;
  connections: Connection[];
  activeConnection: string;
}): { globalSettings: GlobalSettings; connections: Connection[]; activeConnection: string } {
  if (!payload || typeof payload !== "object") {
    throw new Error("配置格式错误");
  }
  if (!Array.isArray(payload.connections)) {
    throw new Error("connections 必须是数组");
  }
  const sanitizedConnections = payload.connections
    .map(sanitizeConnection)
    .filter((item) => item.name.length > 0 && item.token.length > 0);
  const globalSettings: GlobalSettings = {
    serverUrl: normalizeServerUrl(payload.globalSettings?.serverUrl || DEFAULT_SERVER_URL),
    forceWebsocket: payload.globalSettings?.forceWebsocket === true,
    autoReveal: payload.globalSettings?.autoReveal === true,
    displayMode: payload.globalSettings?.displayMode === "log" ? "log" : "bubble",
  };
  const requestedActive = typeof payload.activeConnection === "string"
    ? payload.activeConnection.trim()
    : "";
  const resolvedActive = sanitizedConnections.some((item) => item.name === requestedActive)
    ? requestedActive
    : (sanitizedConnections[0]?.name || "");
  return {
    globalSettings,
    connections: sanitizedConnections,
    activeConnection: resolvedActive,
  };
}

export async function importConfig(payload: {
  globalSettings: GlobalSettings;
  connections: Connection[];
  activeConnection: string;
}): Promise<void> {
  const normalized = validateImportPayload(payload);
  await saveGlobalSettings(normalized.globalSettings);
  await updateCurrentConfigValue("connections", normalized.connections);
  await updateCurrentConfigValue("activeConnection", normalized.activeConnection);
}
