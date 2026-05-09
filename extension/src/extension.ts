import * as vscode from "vscode";
import { migrateLegacyConfiguration } from "./services/configMigration";
import { ExtensionRuntime } from "./runtime/extensionRuntime";

let runtime: ExtensionRuntime | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateLegacyConfiguration(context.globalState);
  runtime = new ExtensionRuntime(context);
  await runtime.activate();
}

export function deactivate(): void {
  runtime?.deactivate();
  runtime = undefined;
}
