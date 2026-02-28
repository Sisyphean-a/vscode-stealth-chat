/**
 * 工具函数
 */
import * as vscode from "vscode";
import { Connection } from "../types";

export const DEFAULT_SERVER_URL = "http://localhost:3000";

/**
 * 规范化服务端 URL（去掉首尾空白和尾部斜杠）
 */
export function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, "");
}

/**
 * 生成随机 nonce 字符串
 */
export function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * 获取当前时间戳字符串 HH:MM:SS
 */
export function getCurrentTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化 Date 对象为时间戳字符串
 */
export function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 获取日期字符串（不含时间，用于比较）
 */
export function getDateKey(timestamp: number): string {
  return formatDate(new Date(timestamp));
}

/**
 * 获取当前活动连接配置
 */
export function getActiveConnection(): Connection & { serverUrl: string } {
  const config = vscode.workspace.getConfiguration("tsLint");
  const connections = config.get<Connection[]>("connections") || [];
  const activeName = config.get<string>("activeConnection");
  const globalServerUrl = normalizeServerUrl(
    config.get<string>("serverUrl") || DEFAULT_SERVER_URL
  );

  if (connections.length > 0) {
    const found = connections.find((c) => c.name === activeName) || connections[0];
    return {
      name: found.name,
      serverUrl: found.serverUrl ? normalizeServerUrl(found.serverUrl) : globalServerUrl,
      token: found.token,
      backgroundSync: found.backgroundSync !== false,
    };
  }

  // 回退到旧配置
  return {
    name: "Default",
    serverUrl: globalServerUrl,
    token: config.get<string>("secret") || "ChangeMeInProduction",
    backgroundSync: true,
  };
}

/**
 * 获取全部连接配置（带规范化 serverUrl）
 */
export function getAllConnections(): Array<Connection & { serverUrl: string }> {
  const config = vscode.workspace.getConfiguration("tsLint");
  const connections = config.get<Connection[]>("connections") || [];
  const globalServerUrl = normalizeServerUrl(
    config.get<string>("serverUrl") || DEFAULT_SERVER_URL
  );

  if (connections.length === 0) {
    return [{
      name: "Default",
      serverUrl: globalServerUrl,
      token: config.get<string>("secret") || "ChangeMeInProduction",
      backgroundSync: true,
    }];
  }

  return connections.map((connection) => ({
    name: connection.name,
    serverUrl: connection.serverUrl ? normalizeServerUrl(connection.serverUrl) : globalServerUrl,
    token: connection.token,
    backgroundSync: connection.backgroundSync !== false,
  }));
}
