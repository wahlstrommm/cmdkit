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
  const defaultGroup = tags[0] ?? "";
  const group = (await ask(`Group (optional${defaultGroup ? `, default ${defaultGroup}` : ""}): `)).trim() || defaultGroup;
  const runnable = ["y", "yes"].includes((await ask("Runnable? [y/N]: ")).toLowerCase());
  const notes = await ask("Notes (optional): ");
  const advanced = ["y", "yes"].includes((await ask("Advanced setup? placeholders/shells/platforms/safety [y/N]: ")).toLowerCase());

  const placeholders = [];
  let shells = ["bash", "zsh"];
  let platforms = ["linux", "macos"];
  let safety: SafetyLevel = "safe";

  if (advanced) {
    const shellsInput = splitCsv(await ask("Shells (comma separated, default bash,zsh): "));
    const platformsInput = splitCsv(await ask("Platforms (comma separated, default linux,macos): "));
    const safetyInput = (await ask("Safety (safe/warning/destructive) [safe]: ")).trim() || "safe";
    shells = shellsInput.length > 0 ? shellsInput : shells;
    platforms = platformsInput.length > 0 ? platformsInput : platforms;
    safety = ["safe", "warning", "destructive"].includes(safetyInput)
      ? (safetyInput as SafetyLevel)
      : "safe";

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
    shells,
    platforms,
    safety,
    source: "local",
    group: group || undefined,
    author: process.env.USER || "local-user",
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  return saveLocalCommand(commandDefinition);
}
