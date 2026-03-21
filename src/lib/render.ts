import type { LoadedCommand } from "../types";

export function renderCommand(command: LoadedCommand, values: Record<string, string>): string {
  return command.command.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function formatCommandSummary(command: LoadedCommand): string {
  const tags = command.tags.map((tag) => `#${tag}`).join(" ");
  return `${command.title} [${command.source}] ${tags}`.trim();
}
