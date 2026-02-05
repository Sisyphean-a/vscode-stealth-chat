/**
 * 状态栏管理
 */
import * as vscode from "vscode";
import { getActiveConnection } from "../utils/helpers";

let statusBarItem: vscode.StatusBarItem | undefined;
let unreadCount = 0;

/**
 * 创建状态栏项
 */
export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "tsLintService.switchConnection";
  statusBarItem.show();
  updateStatusBar();
  return statusBarItem;
}

/**
 * 更新状态栏显示
 */
export function updateStatusBar(): void {
  if (!statusBarItem) return;

  const conn = getActiveConnection();
  const name = conn.name;

  if (unreadCount > 0) {
    statusBarItem.text = `$(alert) ${name} (${unreadCount})`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground"
    );
  } else {
    statusBarItem.text = `$(check) ${name}`;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.color = undefined;
  }
}

/**
 * 设置状态栏为连接中状态
 */
export function setConnecting(name: string): void {
  if (!statusBarItem) return;
  statusBarItem.text = `$(sync~spin) ${name}`;
  statusBarItem.tooltip = "正在连接服务器...";
}

/**
 * 设置状态栏提示
 */
export function setTooltip(tooltip: string): void {
  if (statusBarItem) {
    statusBarItem.tooltip = tooltip;
  }
}

/**
 * 增加未读计数
 */
export function incrementUnread(): void {
  unreadCount++;
  updateStatusBar();
}

/**
 * 清除未读状态
 */
export function clearUnreadStatus(): void {
  unreadCount = 0;
  updateStatusBar();
}

/**
 * 获取状态栏项
 */
export function getStatusBarItem(): vscode.StatusBarItem | undefined {
  return statusBarItem;
}
