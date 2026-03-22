import { spawnSync } from "node:child_process";
import type { CommandDefinition } from "../types";

export function parseYamlFile<T>(filePath: string): T {
  const script = [
    "import json, pathlib, sys",
    "import yaml",
    "path = pathlib.Path(sys.argv[1])",
    "data = yaml.safe_load(path.read_text())",
    "print(json.dumps(data, default=str))"
  ].join("\n");

  const result = spawnSync("python3", ["-c", script, filePath], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Failed to parse YAML: ${filePath}`);
  }

  return JSON.parse(result.stdout) as T;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function serializeList(values: string[], indent: string): string {
  if (values.length === 0) {
    return `${indent}[]`;
  }
  return values.map((value) => `${indent}- ${quote(value)}`).join("\n");
}

function serializePlaceholders(placeholders: CommandDefinition["placeholders"], indent: string): string {
  if (placeholders.length === 0) {
    return `${indent}[]`;
  }

  return placeholders
    .map((placeholder) => {
      const lines = [`${indent}- name: ${quote(placeholder.name)}`];
      if (placeholder.prompt) {
        lines.push(`${indent}  prompt: ${quote(placeholder.prompt)}`);
      }
      if (placeholder.default !== undefined) {
        lines.push(`${indent}  default: ${quote(placeholder.default)}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function serializeMultilineField(key: string, value: string | undefined, indent = ""): string {
  if (!value) {
    return `${indent}${key}: ""`;
  }
  if (!value.includes("\n")) {
    return `${indent}${key}: ${quote(value)}`;
  }

  const indentedLines = value.split("\n").map((line) => `${indent}  ${line}`).join("\n");
  return `${indent}${key}: |\n${indentedLines}`;
}

export function stringifyCommands(commands: CommandDefinition[]): string {
  return `${commands
    .map((command) => {
      const lines = [
        `- id: ${quote(command.id)}`,
        `  title: ${quote(command.title)}`,
        `  description: ${quote(command.description)}`,
        serializeMultilineField("command", command.command, "  "),
        "  tags:",
        serializeList(command.tags, "    "),
        "  placeholders:",
        serializePlaceholders(command.placeholders, "    "),
        `  copyable: ${command.copyable ? "true" : "false"}`,
        `  runnable: ${command.runnable ? "true" : "false"}`,
        serializeMultilineField("notes", command.notes ?? "", "  "),
        "  shells:",
        serializeList(command.shells, "    "),
        "  platforms:",
        serializeList(command.platforms, "    "),
        `  safety: ${command.safety}`,
        `  source: ${command.source}`,
        `  group: ${quote(command.group ?? "")}`,
        `  author: ${quote(command.author)}`,
        `  updatedAt: ${quote(command.updatedAt)}`
      ];
      return lines.join("\n");
    })
    .join("\n\n")}\n`;
}
