/**
 * 配置读写服务
 */
import * as vscode from "vscode";
import { Connection, GlobalSettings } from "../types";
import { DEFAULT_SERVER_URL, normalizeServerUrl } from "../utils/helpers";

/**
 * 获取全局设置
 */
export function getGlobalSettings(): GlobalSettings {
  const config = vscode.workspace.getConfiguration("tsLint");
  const serverUrl = normalizeServerUrl(
    config.get<string>("serverUrl") || DEFAULT_SERVER_URL
  );
  return {
    serverUrl,
    forceWebsocket: config.get<boolean>("forceWebsocket") || false,
    autoReveal: config.get<boolean>("autoReveal") || false,
    displayMode: config.get<"bubble" | "log">("displayMode") || "bubble",
  };
}

/**
 * 保存全局设置
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration("tsLint");
  await config.update("serverUrl", normalizeServerUrl(settings.serverUrl), true);
  await config.update("forceWebsocket", settings.forceWebsocket, true);
  await config.update("autoReveal", settings.autoReveal, true);
  await config.update("displayMode", settings.displayMode, true);
}

/**
 * 确保默认连接配置存在
 * 当 connections 为空时，基于旧配置自动创建默认连接
 */
export async function ensureDefaultConnection(): Promise<void> {
  const config = vscode.workspace.getConfiguration("tsLint");
  const connections = config.get<Connection[]>("connections") || [];
  if (connections.length > 0) {
    return;
  }

  const serverUrl = normalizeServerUrl(
    config.get<string>("serverUrl") || DEFAULT_SERVER_URL
  );
  const token = config.get<string>("secret") || "";

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

  await config.update("connections", [defaultConn], true);
  await config.update("activeConnection", defaultConn.name, true);
}

/**
 * 获取连接列表
 */
export function getConnections(): Connection[] {
  const config = vscode.workspace.getConfiguration("tsLint");
  return config.get<Connection[]>("connections") || [];
}

/**
 * 获取活跃连接名称
 */
export function getActiveConnectionName(): string {
  const config = vscode.workspace.getConfiguration("tsLint");
  return config.get<string>("activeConnection") || "";
}

/**
 * 保存连接（添加或更新）
 */
export async function saveConnection(
  connection: Connection,
  originalName?: string
): Promise<void> {
  const config = vscode.workspace.getConfiguration("tsLint");
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

  await config.update("connections", connections, true);

  // 如果修改了名称且是活跃连接，更新活跃连接名
  if (originalName && originalName !== normalizedConnection.name) {
    const activeName = getActiveConnectionName();
    if (activeName === originalName) {
      await config.update("activeConnection", normalizedConnection.name, true);
    }
  }
}

/**
 * 删除连接
 */
export async function deleteConnection(name: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("tsLint");
  const connections = getConnections().filter((c) => c.name !== name);
  await config.update("connections", connections, true);

  // 如果删除的是活跃连接，清空或切换到第一个
  const activeName = getActiveConnectionName();
  if (activeName === name) {
    const newActive = connections.length > 0 ? connections[0].name : "";
    await config.update("activeConnection", newActive, true);
  }
}

/**
 * 设置活跃连接
 */
export async function setActiveConnection(name: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("tsLint");
  await config.update("activeConnection", name, true);
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
  const config = vscode.workspace.getConfiguration("tsLint");
  const normalized = validateImportPayload(payload);
  await saveGlobalSettings(normalized.globalSettings);
  await config.update("connections", normalized.connections, true);
  await config.update("activeConnection", normalized.activeConnection, true);
}
