import type { CommandDefinition, SafetyLevel } from "../types";

const SAFETY_LEVELS = new Set<SafetyLevel>(["safe", "warning", "destructive"]);
const SOURCES = new Set(["local", "community"]);

export function normalizeCommand(input: unknown): CommandDefinition {
  if (!input || typeof input !== "object") {
    throw new Error("Command entry must be an object.");
  }

  const record = input as Record<string, unknown>;

  const placeholders = Array.isArray(record.placeholders)
    ? record.placeholders.map((placeholder) => {
        if (!placeholder || typeof placeholder !== "object") {
          throw new Error("Placeholder must be an object.");
        }
        const value = placeholder as Record<string, unknown>;
        if (typeof value.name !== "string" || !value.name.trim()) {
          throw new Error("Placeholder name is required.");
        }
        return {
          name: value.name.trim(),
          prompt: typeof value.prompt === "string" ? value.prompt : undefined,
          default: typeof value.default === "string" ? value.default : undefined
        };
      })
    : [];

  const command: CommandDefinition = {
    id: requiredString(record.id, "id"),
    title: requiredString(record.title, "title"),
    description: requiredString(record.description, "description"),
    command: requiredString(record.command, "command"),
    tags: stringArray(record.tags, "tags"),
    placeholders,
    copyable: booleanValue(record.copyable, true),
    runnable: booleanValue(record.runnable, false),
    notes: optionalString(record.notes),
    shells: stringArray(record.shells, "shells"),
    platforms: stringArray(record.platforms, "platforms"),
    safety: safetyValue(record.safety),
    source: sourceValue(record.source),
    author: requiredString(record.author, "author"),
    updatedAt: requiredString(record.updatedAt, "updatedAt")
  };

  if (!command.copyable && !command.runnable) {
    throw new Error("Command must be copyable, runnable, or both.");
  }

  return command;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (items.length !== value.length) {
    throw new Error(`${field} must only contain strings.`);
  }
  return items;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function safetyValue(value: unknown): SafetyLevel {
  if (typeof value !== "string" || !SAFETY_LEVELS.has(value as SafetyLevel)) {
    throw new Error("safety must be one of: safe, warning, destructive.");
  }
  return value as SafetyLevel;
}

function sourceValue(value: unknown): "local" | "community" {
  if (typeof value !== "string" || !SOURCES.has(value)) {
    throw new Error("source must be local or community.");
  }
  return value as "local" | "community";
}
