import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { COMMANDS_ROOT, getLocalCommandsDir } from "../config";
import type { CommandDefinition, CommandMetadata, GroupMode, LoadResult, LoadedCommand, SortMode, SourceFilter } from "../types";
import { ensureDir, removeFile, writeTextFile } from "./fs";
import { removeMetadataForCommand } from "./metadata";
import { normalizeCommand } from "./schema";
import { parseYamlFile, stringifyCommands } from "./yaml";

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")))
      .map((entry) => join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function loadFromDir(dir: string, forcedSource: "local" | "community"): Promise<LoadResult> {
  const files = await listYamlFiles(dir);
  const commands: LoadedCommand[] = [];
  const issues: LoadResult["issues"] = [];

  for (const filePath of files) {
    try {
      const rawEntries = parseYamlFile<unknown[]>(filePath);
      if (!Array.isArray(rawEntries)) {
        issues.push({ filePath, message: "Expected a YAML array of command entries." });
        continue;
      }
      for (const rawEntry of rawEntries) {
        try {
          const normalized = normalizeCommand({
            ...((rawEntry as Record<string, unknown>) ?? {}),
            source: forcedSource
          });
          commands.push({
            ...normalized,
            source: forcedSource,
            filePath
          });
        } catch (error) {
          issues.push({ filePath, message: error instanceof Error ? error.message : "Invalid command entry." });
        }
      }
    } catch (error) {
      issues.push({ filePath, message: error instanceof Error ? error.message : "Failed to parse YAML." });
    }
  }

  return { commands, issues };
}

export async function loadCommands(): Promise<LoadResult> {
  const localCommandsDir = await getLocalCommandsDir();
  const communityDirs = [join(COMMANDS_ROOT, "core"), join(COMMANDS_ROOT, "community")];
  const communityResults = await Promise.all(communityDirs.map((dir) => loadFromDir(dir, "community")));
  const localResult = await loadFromDir(localCommandsDir, "local");

  const byId = new Map<string, LoadedCommand>();
  const issues = [...communityResults.flatMap((result) => result.issues), ...localResult.issues];

  for (const command of communityResults.flatMap((result) => result.commands)) {
    byId.set(command.id, command);
  }

  for (const command of localResult.commands) {
    byId.set(command.id, command);
  }

  return {
    commands: [...byId.values()],
    issues
  };
}

export function filterCommands(commands: LoadedCommand[], query: string, source: SourceFilter): LoadedCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  return commands.filter((command) => {
    if (source !== "all" && command.source !== source) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      command.id,
      command.title,
      command.description,
      command.notes ?? "",
      ...command.tags
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function filterCommandsByTag(commands: LoadedCommand[], tagFilter: string): LoadedCommand[] {
  const normalizedTag = tagFilter.trim().toLowerCase();
  if (!normalizedTag) {
    return commands;
  }
  return commands.filter((command) => command.tags.some((tag) => tag.toLowerCase() === normalizedTag));
}

export function listAvailableTags(commands: LoadedCommand[]): string[] {
  return [...new Set(commands.flatMap((command) => command.tags.map((tag) => tag.toLowerCase())))].sort();
}

export function commandGroupLabel(command: LoadedCommand, groupMode: GroupMode): string {
  if (groupMode === "none") {
    return "";
  }

  if (groupMode === "source") {
    return command.source;
  }

  const explicitGroup = command.group?.trim();
  if (explicitGroup) {
    return explicitGroup.toLowerCase();
  }

  if (command.source === "local") {
    return "local";
  }

  return command.tags[0]?.toLowerCase() || command.source;
}

export async function saveLocalCommand(command: CommandDefinition): Promise<string> {
  const localCommandsDir = await getLocalCommandsDir();
  await ensureDir(localCommandsDir);
  const normalizedCommand = {
    ...command,
    source: "local" as const,
    group: command.group?.trim().toLowerCase() || undefined
  };
  const filePath = join(localCommandsDir, `${normalizedCommand.id}.yaml`);
  const contents = stringifyCommands([normalizedCommand]);
  await writeTextFile(filePath, contents);
  return filePath;
}

export async function deleteLocalCommand(command: LoadedCommand): Promise<void> {
  if (command.source !== "local") {
    throw new Error("Only local commands can be deleted.");
  }
  await removeFile(command.filePath);
  await removeMetadataForCommand(command.id);
}

export function sortCommands(commands: LoadedCommand[], sortMode: SortMode, metadata?: CommandMetadata): LoadedCommand[] {
  const favorites = metadata?.favorites ?? [];
  const recent = metadata?.recent ?? [];
  const favoriteRank = new Map(favorites.map((id, index) => [id, index]));
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const safetyRank = { safe: 0, warning: 1, destructive: 2 };
  const sourceRank = { local: 0, community: 1 };

  return [...commands].sort((left, right) => {
    if (sortMode === "favorites") {
      const leftRank = favoriteRank.has(left.id) ? favoriteRank.get(left.id)! : Number.MAX_SAFE_INTEGER;
      const rightRank = favoriteRank.has(right.id) ? favoriteRank.get(right.id)! : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }

    if (sortMode === "recent") {
      const leftRank = recentRank.has(left.id) ? recentRank.get(left.id)! : Number.MAX_SAFE_INTEGER;
      const rightRank = recentRank.has(right.id) ? recentRank.get(right.id)! : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }

    if (sortMode === "safety") {
      const difference = safetyRank[left.safety] - safetyRank[right.safety];
      if (difference !== 0) {
        return difference;
      }
    }

    if (sortMode === "source") {
      const difference = sourceRank[left.source] - sourceRank[right.source];
      if (difference !== 0) {
        return difference;
      }
    }

    return left.title.localeCompare(right.title);
  });
}

export function sortCommandsForDisplay(
  commands: LoadedCommand[],
  sortMode: SortMode,
  groupMode: GroupMode,
  metadata?: CommandMetadata
): LoadedCommand[] {
  const sorted = sortCommands(commands, sortMode, metadata);
  if (groupMode === "none") {
    return sorted;
  }

  const rank = new Map(sorted.map((command, index) => [command.id, index]));

  return [...sorted].sort((left, right) => {
    const groupCompare = commandGroupLabel(left, groupMode).localeCompare(commandGroupLabel(right, groupMode));
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0);
  });
}

function normalizeImportedCommands(input: unknown, filePath: string): CommandDefinition[] {
  if (!Array.isArray(input)) {
    throw new Error(`${filePath}: expected an array of command entries.`);
  }

  return input.map((entry) =>
    normalizeCommand({
      ...((entry as Record<string, unknown>) ?? {}),
      source: "local"
    })
  );
}

async function readImportFile(filePath: string): Promise<CommandDefinition[]> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".json") {
    const contents = await readFile(filePath, "utf8");
    return normalizeImportedCommands(JSON.parse(contents), filePath);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return normalizeImportedCommands(parseYamlFile<unknown[]>(filePath), filePath);
  }

  throw new Error(`${filePath}: supported formats are .yaml, .yml, and .json.`);
}

export async function importCommands(inputPath: string): Promise<{ imported: number; files: string[] }> {
  const target = await stat(inputPath);
  const importedFiles: string[] = [];
  let imported = 0;

  if (target.isDirectory()) {
    const entries = await readdir(inputPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && [".yaml", ".yml", ".json"].includes(extname(entry.name).toLowerCase()))
      .map((entry) => join(inputPath, entry.name))
      .sort();

    for (const filePath of files) {
      const commands = await readImportFile(filePath);
      for (const command of commands) {
        const saved = await saveLocalCommand({ ...command, source: "local" });
        importedFiles.push(saved);
        imported += 1;
      }
    }
    return { imported, files: importedFiles };
  }

  const commands = await readImportFile(inputPath);
  for (const command of commands) {
    const saved = await saveLocalCommand({ ...command, source: "local" });
    importedFiles.push(saved);
    imported += 1;
  }

  return { imported, files: importedFiles };
}

export async function exportCommands(outputPath: string): Promise<{ exported: number; outputPath: string }> {
  const loaded = await loadCommands();
  const localCommands = loaded.commands.filter((command) => command.source === "local");
  const extension = extname(outputPath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml" || extension === "") {
    const filePath = extension ? outputPath : join(outputPath, "cmdkit-export.yaml");
    const normalized = localCommands.map(({ filePath: _filePath, ...command }) => command);
    await writeTextFile(filePath, stringifyCommands(normalized));
    return { exported: normalized.length, outputPath: filePath };
  }

  if (extension === ".json") {
    const normalized = localCommands.map(({ filePath: _filePath, ...command }) => command);
    await writeTextFile(outputPath, JSON.stringify(normalized, null, 2));
    return { exported: normalized.length, outputPath };
  }

  await ensureDir(outputPath);
  for (const command of localCommands) {
    const { filePath: _filePath, ...normalized } = command;
    await writeTextFile(join(outputPath, `${basename(command.id)}.yaml`), stringifyCommands([normalized]));
  }
  return { exported: localCommands.length, outputPath };
}
