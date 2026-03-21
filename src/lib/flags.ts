import type { SourceFilter } from "../types";

export interface ParsedFlags {
  source: SourceFilter;
  positional: string[];
}

export function parseFlags(argv: string[]): ParsedFlags {
  let source: SourceFilter = "all";
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === "--local") {
      source = "local";
    } else if (arg === "--community") {
      source = "community";
    } else if (arg === "--all") {
      source = "all";
    } else {
      positional.push(arg);
    }
  }

  return { source, positional };
}
