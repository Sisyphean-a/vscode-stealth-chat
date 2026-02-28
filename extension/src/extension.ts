import * as vscode from "vscode";
import { ExtensionRuntime } from "./runtime/extensionRuntime";

let runtime: ExtensionRuntime | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  runtime = new ExtensionRuntime(context);
  await runtime.activate();
}

export function deactivate(): void {
  runtime?.deactivate();
  runtime = undefined;
}
