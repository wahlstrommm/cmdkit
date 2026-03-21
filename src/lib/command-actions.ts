import { spawn } from "node:child_process";
import { markRecent } from "./metadata";
import { confirm } from "./prompt";
import { copyToClipboard } from "./clipboard";
import { renderCommand } from "./render";
import type { LoadedCommand } from "../types";

type PlaceholderMode = "copy" | "run";

export async function collectPlaceholderValues(command: LoadedCommand, mode: PlaceholderMode): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const placeholder of command.placeholders) {
    const label = placeholder.prompt ?? placeholder.name;
    const optionalHint = mode === "copy" ? " - leave blank to keep placeholder" : "";
    const suffix = placeholder.default ? ` (${placeholder.default})` : optionalHint;
    const answer = await import("./prompt").then(({ ask }) => ask(`${label}${suffix}: `));

    if (answer) {
      values[placeholder.name] = answer;
      continue;
    }

    if (placeholder.default) {
      values[placeholder.name] = placeholder.default;
      continue;
    }

    if (mode === "run") {
      values[placeholder.name] = "";
    }
  }
  return values;
}

export async function copyCommand(command: LoadedCommand): Promise<{ copied: boolean; rendered: string }> {
  const values = await collectPlaceholderValues(command, "copy");
  const rendered = renderCommand(command, values);
  const copied = command.copyable ? await copyToClipboard(rendered) : false;
  await markRecent(command.id);
  return { copied, rendered };
}

export async function runCommand(command: LoadedCommand): Promise<{ exitCode: number; rendered: string }> {
  if (!command.runnable) {
    throw new Error(`Command ${command.id} is not runnable.`);
  }

  const values = await collectPlaceholderValues(command, "run");
  const rendered = renderCommand(command, values);
  const warning =
    command.safety === "safe"
      ? `Run command?\n${rendered}`
      : `${command.safety.toUpperCase()} command.\nRun command?\n${rendered}`;

  const ok = await confirm(`${warning}\n`, false);
  if (!ok) {
    return { exitCode: 1, rendered };
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(rendered, {
      stdio: "inherit",
      shell: true
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 0));
  });

  await markRecent(command.id);
  return { exitCode, rendered };
}
