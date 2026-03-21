import type { LoadedCommand, SourceFilter } from "../types";

export function printCommand(command: LoadedCommand): void {
  console.log(`${command.title} (${command.id})`);
  console.log(`Source: ${command.source} | Safety: ${command.safety}`);
  console.log(`Tags: ${command.tags.join(", ")}`);
  console.log(command.description);
  console.log(command.command);
  if (command.notes) {
    console.log(`Notes: ${command.notes}`);
  }
}

export function printCommandList(commands: LoadedCommand[], query: string, source: SourceFilter): void {
  console.log(`Results: ${commands.length} | Query: ${query || "(none)"} | Source: ${source}`);
  for (const command of commands) {
    console.log(`- ${command.id} | ${command.title} | ${command.source} | ${command.tags.join(", ")}`);
  }
}
