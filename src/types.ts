export type CommandSource = "local" | "community";
export type SafetyLevel = "safe" | "warning" | "destructive";
export type SourceFilter = "all" | CommandSource;
export type SortMode = "title" | "recent" | "favorites" | "safety" | "source";

export interface Placeholder {
  name: string;
  prompt?: string;
  default?: string;
}

export interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  command: string;
  tags: string[];
  placeholders: Placeholder[];
  copyable: boolean;
  runnable: boolean;
  notes?: string;
  shells: string[];
  platforms: string[];
  safety: SafetyLevel;
  source: CommandSource;
  author: string;
  updatedAt: string;
}

export interface LoadedCommand extends CommandDefinition {
  filePath: string;
}

export interface ValidationIssue {
  filePath: string;
  message: string;
}

export interface LoadResult {
  commands: LoadedCommand[];
  issues: ValidationIssue[];
}

export interface CommandMetadata {
  favorites: string[];
  recent: string[];
}
