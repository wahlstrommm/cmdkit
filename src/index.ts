#!/usr/bin/env bun
import { loadCommands, filterCommands, importCommands, exportCommands } from "./lib/commands";
import { copyCommand, runCommand } from "./lib/command-actions";
import { printCommandList } from "./lib/display";
import { parseFlags } from "./lib/flags";
import { openInEditor } from "./lib/editor";
import { createNewCommand } from "./new-command";
import { startTui } from "./tui";

function usage(): void {
  console.log(`cmdkit

Usage:
  cmdkit
  cmdkit search <query> [--local|--community|--all]
  cmdkit copy <id> [--local|--community|--all]
  cmdkit run <id> [--local|--community|--all]
  cmdkit validate
  cmdkit new
  cmdkit import <file-or-directory>
  cmdkit export <file-or-directory>
`);
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (!subcommand) {
    await startTui();
    return;
  }

  const { source, positional } = parseFlags(rest);
  const query = positional.join(" ");
  const loaded = await loadCommands();

  if (subcommand === "validate") {
    if (loaded.issues.length === 0) {
      console.log(`Validated ${loaded.commands.length} commands with no issues.`);
      return;
    }
    for (const issue of loaded.issues) {
      console.error(`${issue.filePath}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (subcommand === "new") {
    const filePath = await createNewCommand();
    console.log(`Created ${filePath}`);
    if (await import("./lib/prompt").then(({ confirm }) => confirm("Open in editor?", false))) {
      await openInEditor(filePath);
    }
    return;
  }

  if (subcommand === "search") {
    const results = filterCommands(loaded.commands, query, source);
    printCommandList(results, query, source);
    return;
  }

  if (subcommand === "import") {
    const inputPath = positional[0];
    if (!inputPath) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = await importCommands(inputPath);
    console.log(`Imported ${result.imported} command(s).`);
    for (const filePath of result.files) {
      console.log(`- ${filePath}`);
    }
    return;
  }

  if (subcommand === "export") {
    const outputPath = positional[0];
    if (!outputPath) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = await exportCommands(outputPath);
    console.log(`Exported ${result.exported} local command(s) to ${result.outputPath}`);
    return;
  }

  const id = positional[0];
  if (!id) {
    usage();
    process.exitCode = 1;
    return;
  }

  const command = filterCommands(loaded.commands, id, source).find((entry) => entry.id === id);
  if (!command) {
    console.error(`Command not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === "copy") {
    const result = await copyCommand(command);
    if (result.copied) {
      console.log(`Copied ${command.id}`);
    } else {
      console.log("Clipboard unavailable. Manual copy:");
      console.log(result.rendered);
    }
    return;
  }

  if (subcommand === "run") {
    const result = await runCommand(command);
    process.exitCode = result.exitCode;
    return;
  }

  usage();
  process.exitCode = 1;
}

await main();
