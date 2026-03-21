import { saveLocalCommand } from "./lib/commands";
import { ask } from "./lib/prompt";
import type { CommandDefinition, SafetyLevel } from "./types";

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createNewCommand(): Promise<string> {
  const id = await ask("Command id: ");
  const title = await ask("Title: ");
  const description = await ask("Description: ");
  const command = await ask("Command: ");
  const tags = splitCsv(await ask("Tags (comma separated): "));
  const shells = splitCsv(await ask("Shells (comma separated, default bash,zsh): "));
  const platforms = splitCsv(await ask("Platforms (comma separated, default linux,macos): "));
  const safetyInput = (await ask("Safety (safe/warning/destructive) [safe]: ")).trim() || "safe";
  const safety = ["safe", "warning", "destructive"].includes(safetyInput)
    ? (safetyInput as SafetyLevel)
    : "safe";
  const runnable = ["y", "yes"].includes((await ask("Runnable? [y/N]: ")).toLowerCase());
  const notes = await ask("Notes (optional): ");

  const placeholders = [];
  while (["y", "yes"].includes((await ask("Add placeholder? [y/N]: ")).toLowerCase())) {
    const name = await ask("Placeholder name: ");
    const prompt = await ask("Prompt text: ");
    const defaultValue = await ask("Default value (optional): ");
    placeholders.push({
      name,
      prompt,
      ...(defaultValue ? { default: defaultValue } : {})
    });
  }

  const commandDefinition: CommandDefinition = {
    id,
    title,
    description,
    command,
    tags,
    placeholders,
    copyable: true,
    runnable,
    notes: notes || undefined,
    shells: shells.length > 0 ? shells : ["bash", "zsh"],
    platforms: platforms.length > 0 ? platforms : ["linux", "macos"],
    safety,
    source: "local",
    author: process.env.USER || "local-user",
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  return saveLocalCommand(commandDefinition);
}
