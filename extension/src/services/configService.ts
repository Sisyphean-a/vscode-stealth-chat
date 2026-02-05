/**
 * 配置读写服务
 */
import * as vscode from "vscode";
import { Connection, GlobalSettings } from "../types";

/**
 * 获取全局设置
 */
export function getGlobalSettings(): GlobalSettings {
  const config = vscode.workspace.getConfiguration("tsLint");
  return {
    serverUrl: config.get<string>("serverUrl") || "http://localhost:3000",
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
  await config.update("serverUrl", settings.serverUrl, true);
  await config.update("forceWebsocket", settings.forceWebsocket, true);
  await config.update("autoReveal", settings.autoReveal, true);
  await config.update("displayMode", settings.displayMode, true);
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

  const searchName = originalName || connection.name;
  const index = connections.findIndex((c) => c.name === searchName);

  if (index >= 0) {
    connections[index] = connection;
  } else {
    connections.push(connection);
  }

  await config.update("connections", connections, true);

  // 如果修改了名称且是活跃连接，更新活跃连接名
  if (originalName && originalName !== connection.name) {
    const activeName = getActiveConnectionName();
    if (activeName === originalName) {
      await config.update("activeConnection", connection.name, true);
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
