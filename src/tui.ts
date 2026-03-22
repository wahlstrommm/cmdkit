import readline from "node:readline";
import { stdout, stdin } from "node:process";
import { commandGroupLabel, deleteLocalCommand, filterCommands, filterCommandsByTag, listAvailableTags, loadCommands, saveLocalCommand, sortCommandsForDisplay } from "./lib/commands";
import { copyCommand, runCommand } from "./lib/command-actions";
import { printCommand } from "./lib/display";
import { openInEditor } from "./lib/editor";
import { toggleFavorite, loadMetadata } from "./lib/metadata";
import { createNewCommand } from "./new-command";
import type { CommandDefinition, GroupMode, LoadedCommand, SortMode, SourceFilter } from "./types";

interface TuiState {
  query: string;
  searchDraft: string;
  searchMenuOpen: boolean;
  helpMenuOpen: boolean;
  groupMenuOpen: boolean;
  groupMenuIndex: number;
  groupVisibilityMenuOpen: boolean;
  groupVisibilityMenuIndex: number;
  quickAddOpen: boolean;
  quickAddStep: number;
  quickAddValues: {
    title: string;
    command: string;
    tags: string;
    runnable: string;
    group: string;
  };
  tagFilter: string;
  tagMenuOpen: boolean;
  tagMenuIndex: number;
  sortMenuOpen: boolean;
  sortMenuIndex: number;
  sourceMenuOpen: boolean;
  sourceMenuIndex: number;
  source: SourceFilter;
  commands: LoadedCommand[];
  filtered: LoadedCommand[];
  selectedIndex: number;
  activePane: "library" | "details";
  detailActionIndex: number;
  sortMode: SortMode;
  groupMode: GroupMode;
  collapsedGroups: string[];
  status: string;
  favorites: string[];
  recent: string[];
}

type DetailAction = "back" | "copy" | "run" | "edit" | "favorite" | "delete";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const FG_CREAM = "\x1b[38;5;230m";
const FG_SAND = "\x1b[38;5;223m";
const FG_SLATE = "\x1b[38;5;246m";
const FG_MINT = "\x1b[38;5;121m";
const FG_AMBER = "\x1b[38;5;221m";
const FG_CORAL = "\x1b[38;5;210m";
const FG_SKY = "\x1b[38;5;117m";
const BG_NAVY = "\x1b[48;5;17m";
const BG_PANEL = "\x1b[48;5;235m";
const BG_ACCENT = "\x1b[48;5;24m";
const BG_STATUS = "\x1b[48;5;236m";
const BG_FOCUS = "\x1b[48;5;59m";
const ALT_SCREEN_ON = "\x1b[?1049h\x1b[?25l";
const ALT_SCREEN_OFF = "\x1b[?25h\x1b[?1049l";
const FULL_CLEAR = "\x1b[H\x1b[2J\x1b[3J";

let lastFrame = "";

const QUICK_ADD_FIELDS = [
  { key: "title", label: "Title", hint: "Short human-readable name" },
  { key: "command", label: "Command", hint: "The command template to save" },
  { key: "tags", label: "Tags", hint: "Comma separated, e.g. wordpress,wp-cli" },
  { key: "runnable", label: "Runnable", hint: "yes or no" },
  { key: "group", label: "Group", hint: "Optional, blank uses first tag" }
] as const;

function flushStdinBuffer(): void {
  while (stdin.read() !== null) {
    // Drain any buffered keys left over from cooked-mode prompts.
  }
}

function selectedCommand(state: TuiState): LoadedCommand | undefined {
  return visibleCommands(state)[state.selectedIndex];
}

function visibleGroups(state: TuiState): string[] {
  if (state.groupMode === "none") {
    return [];
  }
  return [...new Set(state.filtered.map((command) => commandGroupLabel(command, state.groupMode)).filter(Boolean))];
}

function visibleCommands(state: TuiState): LoadedCommand[] {
  if (state.groupMode === "none" || state.collapsedGroups.length === 0) {
    return state.filtered;
  }
  const hidden = new Set(state.collapsedGroups);
  return state.filtered.filter((command) => !hidden.has(commandGroupLabel(command, state.groupMode)));
}

function syncVisibleSelection(state: TuiState, selectedId?: string): void {
  const commands = visibleCommands(state);
  if (selectedId) {
    const nextIndex = commands.findIndex((command) => command.id === selectedId);
    if (nextIndex >= 0) {
      state.selectedIndex = nextIndex;
      return;
    }
  }
  if (state.selectedIndex >= commands.length) {
    state.selectedIndex = Math.max(0, commands.length - 1);
  }
}

function color(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${RESET}`;
}

function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resetQuickAdd(state: TuiState): void {
  state.quickAddOpen = false;
  state.quickAddStep = 0;
  state.quickAddValues = {
    title: "",
    command: "",
    tags: "",
    runnable: "no",
    group: ""
  };
}

function currentQuickAddField(state: TuiState): (typeof QUICK_ADD_FIELDS)[number] {
  return QUICK_ADD_FIELDS[state.quickAddStep] ?? QUICK_ADD_FIELDS[0];
}

function quickAddPreview(state: TuiState): CommandDefinition | null {
  const tags = splitCsv(state.quickAddValues.tags);
  const title = state.quickAddValues.title.trim();
  const command = state.quickAddValues.command.trim();
  if (!title || !command) {
    return null;
  }

  const group = (state.quickAddValues.group.trim() || tags[0] || "").toLowerCase() || undefined;
  const description = tags.length > 0 ? `${title} for ${tags.join(", ")}.` : `Quick local command for ${title}.`;
  return {
    id: slugifyId(title),
    title,
    description,
    command,
    tags,
    placeholders: [],
    copyable: true,
    runnable: ["y", "yes", "true"].includes(state.quickAddValues.runnable.trim().toLowerCase()),
    notes: undefined,
    shells: ["bash", "zsh"],
    platforms: ["linux", "macos"],
    safety: "safe",
    source: "local",
    group,
    author: process.env.USER || "local-user",
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  const visible = stripAnsi(text);
  if (visible.length <= width) {
    return `${text}${" ".repeat(width - visible.length)}`;
  }
  if (width <= 3) {
    return visible.slice(0, width);
  }
  return `${visible.slice(0, width - 3)}...`;
}

function wrap(text: string, width: number): string[] {
  if (!text) {
    return [""];
  }
  const plain = stripAnsi(text);
  if (plain.length <= width) {
    return [text];
  }
  const words = plain.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function badge(label: string, tone: "mint" | "amber" | "coral" | "sky" | "slate"): string {
  const palette = {
    mint: [BG_ACCENT, FG_MINT],
    amber: [BG_ACCENT, FG_AMBER],
    coral: [BG_ACCENT, FG_CORAL],
    sky: [BG_ACCENT, FG_SKY],
    slate: [BG_STATUS, FG_SLATE]
  } as const;
  return color(` ${label.toUpperCase()} `, ...palette[tone], BOLD);
}

function commandTone(command: LoadedCommand): "mint" | "amber" | "coral" {
  if (command.safety === "destructive") {
    return "coral";
  }
  if (command.safety === "warning") {
    return "amber";
  }
  return "mint";
}

function sourceTone(command: LoadedCommand): "sky" | "slate" {
  return command.source === "local" ? "sky" : "slate";
}

function paneTitle(label: string, active: boolean): string {
  return active ? color(` ${label.toUpperCase()} `, BG_FOCUS, FG_CREAM, BOLD) : badge(label, "slate");
}

function box(title: string, lines: string[], width: number, active: boolean): string[] {
  return buildBox(title, lines, width, active, true);
}

function compactBox(title: string, lines: string[], width: number, active: boolean): string[] {
  return buildBox(title, lines, width, active, false);
}

function buildBox(title: string, lines: string[], width: number, active: boolean, allowWrap: boolean): string[] {
  const innerWidth = Math.max(20, width - 4);
  const horizontal = active ? "=" : "-";
  const top = color(`+${horizontal.repeat(innerWidth + 2)}+`, active ? FG_SKY : FG_SLATE);
  const heading = `${color("|", active ? FG_SKY : FG_SLATE)} ${truncate(title, innerWidth)} ${color("|", active ? FG_SKY : FG_SLATE)}`;
  const body = lines
    .flatMap((line) => (allowWrap ? wrap(line, innerWidth) : [line]))
    .map((line) => `${color("|", active ? FG_SKY : FG_SLATE)} ${truncate(line, innerWidth)} ${color("|", active ? FG_SKY : FG_SLATE)}`);
  return [top, heading, top, ...body, top];
}

function joinColumns(left: string[], right: string[], leftWidth: number, rightWidth: number): string[] {
  const rowCount = Math.max(left.length, right.length);
  const rows: string[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const leftLine = left[index] ?? " ".repeat(leftWidth);
    const rightLine = right[index] ?? " ".repeat(rightWidth);
    rows.push(`${leftLine}  ${rightLine}`);
  }
  return rows;
}

function detailActions(command: LoadedCommand | undefined): DetailAction[] {
  if (!command) {
    return ["back"];
  }
  const actions: DetailAction[] = ["copy"];
  if (command.runnable) {
    actions.push("run");
  }
  actions.push("edit", "favorite");
  if (command.source === "local") {
    actions.push("delete");
  }
  actions.push("back");
  return actions;
}

function nextSortMode(sortMode: SortMode): SortMode {
  const modes: SortMode[] = ["title", "recent", "favorites", "safety", "source"];
  const currentIndex = modes.indexOf(sortMode);
  return modes[(currentIndex + 1) % modes.length];
}

function sortMenuOptions(): { label: string; value: SortMode }[] {
  return [
    { label: "Title", value: "title" },
    { label: "Recent", value: "recent" },
    { label: "Favorites", value: "favorites" },
    { label: "Safety", value: "safety" },
    { label: "Source", value: "source" }
  ];
}

function sourceMenuOptions(): { label: string; value: SourceFilter }[] {
  return [
    { label: "All", value: "all" },
    { label: "Local", value: "local" },
    { label: "Community", value: "community" }
  ];
}

function groupMenuOptions(): { label: string; value: GroupMode }[] {
  return [
    { label: "Smart group", value: "group" },
    { label: "Source", value: "source" },
    { label: "Flat list", value: "none" }
  ];
}

function groupVisibilityOptions(state: TuiState): { label: string; value: string; collapsed: boolean; count: number }[] {
  return visibleGroups(state).map((group) => ({
    label: group,
    value: group,
    collapsed: state.collapsedGroups.includes(group),
    count: state.filtered.filter((command) => commandGroupLabel(command, state.groupMode) === group).length
  }));
}

function tagMenuOptions(commands: LoadedCommand[]): string[] {
  return ["(clear tag filter)", ...listAvailableTags(commands)];
}

function applyFilters(state: TuiState): LoadedCommand[] {
  return sortCommandsForDisplay(
    filterCommandsByTag(filterCommands(state.commands, state.query, state.source), state.tagFilter),
    state.sortMode,
    state.groupMode,
    {
      favorites: state.favorites,
      recent: state.recent
    }
  );
}

function toggleGroupCollapsed(state: TuiState, group: string): void {
  state.collapsedGroups = state.collapsedGroups.includes(group)
    ? state.collapsedGroups.filter((entry) => entry !== group)
    : [...state.collapsedGroups, group];
}

function actionBadge(label: string, active: boolean, tone: "mint" | "amber" | "coral" | "sky" | "slate"): string {
  if (active) {
    return color(` ${label.toUpperCase()} `, BG_FOCUS, FG_CREAM, BOLD);
  }
  return badge(label, tone);
}

function passiveActionBadge(label: string): string {
  return color(` ${label.toUpperCase()} `, BG_STATUS, FG_SLATE, BOLD);
}

function overlayBox(title: string, lines: string[], width: number): string[] {
  const innerWidth = Math.max(24, width - 4);
  const top = color(`+${"=".repeat(innerWidth + 2)}+`, FG_SKY);
  const heading = `${color("|", FG_SKY)} ${truncate(title, innerWidth)} ${color("|", FG_SKY)}`;
  const body = lines.map((line) => `${color("|", FG_SKY)} ${truncate(line, innerWidth)} ${color("|", FG_SKY)}`);
  return [top, heading, top, ...body, top];
}

function sectionDivider(label: string): string {
  return color(`• ${label.toUpperCase()}`, FG_SKY, BOLD);
}

function commandBlock(commandText: string, width: number): string[] {
  const innerWidth = Math.max(20, width - 10);
  const lines = wrap(commandText, innerWidth);
  return [
    color(`┌${"─".repeat(innerWidth + 2)}┐`, FG_SKY),
    ...lines.map((line) => `${color("│", FG_SKY)} ${color(truncate(line, innerWidth), FG_CREAM, BOLD)} ${color("│", FG_SKY)}`),
    color(`└${"─".repeat(innerWidth + 2)}┘`, FG_SKY)
  ];
}

function buildLibraryRows(state: TuiState, visibleStart: number, count: number): string[] {
  const rows: string[] = [];
  const commands = visibleCommands(state);

  if (state.groupMode === "none") {
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      const isSelected = index === state.selectedIndex;
      const marker = isSelected ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
      const favorite = state.favorites.includes(command.id) ? color("*", FG_AMBER, BOLD) : " ";
      const title = isSelected ? color(command.title, FG_CREAM, BOLD) : color(command.title, FG_SAND);
      const meta = color(
        `${command.source === "local" ? "L" : "C"}:${command.safety === "destructive" ? "DEST" : command.safety === "warning" ? "WARN" : "SAFE"}`,
        command.safety === "destructive" ? FG_CORAL : command.safety === "warning" ? FG_AMBER : FG_MINT,
        BOLD
      );
      rows.push(`${marker}${favorite} ${title} ${meta}`);
    }

    return rows.slice(visibleStart, visibleStart + count);
  }

  for (const group of visibleGroups(state)) {
    const collapsed = state.collapsedGroups.includes(group);
    const groupCount = state.filtered.filter((command) => commandGroupLabel(command, state.groupMode) === group).length;
    rows.push(color(`  ${collapsed ? "▸" : "▾"} ${group.toUpperCase()} (${groupCount})`, FG_SKY, BOLD));

    if (collapsed) {
      continue;
    }

    const groupCommands = commands.filter((command) => commandGroupLabel(command, state.groupMode) === group);
    for (const command of groupCommands) {
      const index = commands.findIndex((entry) => entry.id === command.id);
      const isSelected = index === state.selectedIndex;
      const marker = isSelected ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
      const favorite = state.favorites.includes(command.id) ? color("*", FG_AMBER, BOLD) : " ";
      const title = isSelected ? color(command.title, FG_CREAM, BOLD) : color(command.title, FG_SAND);
      const meta = color(
        `${command.source === "local" ? "L" : "C"}:${command.safety === "destructive" ? "DEST" : command.safety === "warning" ? "WARN" : "SAFE"}`,
        command.safety === "destructive" ? FG_CORAL : command.safety === "warning" ? FG_AMBER : FG_MINT,
        BOLD
      );
      rows.push(`${marker}${favorite} ${title} ${meta}`);
    }
  }

  return rows.slice(visibleStart, visibleStart + count);
}

function buildFrame(state: TuiState): string {
  const selected = selectedCommand(state);
  const screenWidth = Math.max(stdout.columns || 100, 80);
  const leftWidth = Math.max(34, Math.floor(screenWidth * 0.36));
  const rightWidth = Math.max(42, screenWidth - leftWidth - 2);
  const visibleStart = Math.max(0, state.selectedIndex - 5);
  const commands = visibleCommands(state);
  const localVisibleCount = commands.filter((command) => command.source === "local").length;
  const communityVisibleCount = commands.filter((command) => command.source === "community").length;
  const visibleRows = buildLibraryRows(state, visibleStart, 14);
  const actions = detailActions(selected);
  const currentAction = actions[state.detailActionIndex] ?? actions[0];
  const tagOptions = tagMenuOptions(state.commands);
  const sortOptions = sortMenuOptions();

  const leftPanel = compactBox(
    `${paneTitle("library", state.activePane === "library")} ${color(`${commands.length} visible`, FG_SAND, BOLD)} ${color(`/ ${state.commands.length} total`, FG_SLATE)} ${color(`L:${localVisibleCount}`, FG_SKY, BOLD)} ${color(`C:${communityVisibleCount}`, FG_SLATE, BOLD)}`,
    visibleRows.length > 0
      ? visibleRows
      : [color("No matching commands.", FG_SLATE), color("Press / to change the query.", FG_SLATE)],
    leftWidth,
    state.activePane === "library"
  );

  const detailLines = selected
    ? [
        color(selected.id, FG_SLATE),
        color(selected.description, FG_SAND),
        "",
        `${badge(selected.safety, commandTone(selected))} ${badge(selected.source, sourceTone(selected))}`,
        `${color("Position", FG_SKY, BOLD)}  ${state.activePane === "library" ? "Library list (preview mode)" : `Details / ${currentAction}`}`,
        ...(state.activePane === "details"
          ? [
              `${color("Actions", FG_SKY, BOLD)}  ${actionBadge("copy", currentAction === "copy", "mint")} ${selected.runnable ? actionBadge("run", currentAction === "run", "amber") : ""} ${actionBadge("edit", currentAction === "edit", "sky")} ${actionBadge("favorite", currentAction === "favorite", "amber")} ${selected.source === "local" ? actionBadge("delete", currentAction === "delete", "coral") : ""} ${actionBadge("back", currentAction === "back", "slate")}`,
              `${color("Use", FG_SKY, BOLD)}      Left/right or Tab to move, Enter to use, b or Esc to exit.`
            ]
          : [
              `${color("Mode", FG_SKY, BOLD)}      ${color("Preview only", FG_SLATE, BOLD)}`,
              `${color("Open", FG_SKY, BOLD)}      ${color("Press o, Enter, Space, or right arrow to open details.", FG_SAND)}`,
              `${color("Then", FG_SKY, BOLD)}      ${color("Copy, run, edit, favorite, or back become active.", FG_SAND)}`
            ]),
        "",
        sectionDivider("Command"),
        ...commandBlock(selected.command, rightWidth),
        ...(selected.notes ? ["", sectionDivider("Notes"), color(selected.notes, FG_SAND)] : []),
        "",
        sectionDivider("Context"),
        `Tags      ${selected.tags.map((tag) => `#${tag}`).join(" ") || "-"}`,
        `Shells    ${selected.shells.join(", ") || "-"}`,
        `Platforms ${selected.platforms.join(", ") || "-"}`,
        `Group     ${(selected.group ?? commandGroupLabel(selected, "group")).replace(/\b\w/g, (char) => char.toUpperCase())}`,
        `Author    ${selected.author}`,
        `Updated   ${selected.updatedAt}`,
        "",
        color(`File: ${selected.filePath}`, FG_SLATE)
      ]
    : [color("No command selected.", FG_SLATE)];

  const details = box(
    selected
      ? `${paneTitle("details", state.activePane === "details")} ${color(selected.title, FG_CREAM, BOLD)}`
      : `${paneTitle("details", state.activePane === "details")}`,
    detailLines,
    rightWidth,
    state.activePane === "details"
  );

  const header = color(" CMDKIT ", BG_NAVY, FG_CREAM, BOLD);
  const summary = [
    badge(state.source, state.source === "all" ? "sky" : state.source === "local" ? "mint" : "slate"),
    ...(state.tagFilter ? [badge(`tag:${state.tagFilter}`, "mint")] : []),
    badge(`${state.favorites.length} fav`, "amber"),
    badge(`${state.recent.length} recent`, "slate"),
    badge(`sort:${state.sortMode}`, "sky"),
    badge(`group:${state.groupMode}`, "sky"),
    ...(selected ? [badge(`${state.selectedIndex + 1}/${commands.length || 1}`, "slate")] : []),
    badge(`focus:${state.activePane}`, state.activePane === "library" ? "sky" : "mint"),
    ...(state.activePane === "details" ? [badge(`action:${currentAction}`, "amber")] : []),
    color(`query: ${state.query || "browse everything"}`, FG_SAND)
  ].join(" ");
  const help =
    state.activePane === "library"
      ? color(" j/k move  o open details  s sort  g tag  Enter/Space/or -> also works  / search  t source  n new  q quit ", BG_PANEL, FG_SAND)
      : color(" <-/-> or Tab choose action  Enter use action  b or Esc back  q quit ", BG_PANEL, FG_SAND);
  const libraryHelp = color(" j/k move  o open details  s sort  m group  v groups  x collapse  g tag  / search  t source  n new  ? help  q quit ", BG_PANEL, FG_SAND);
  const footerHint =
    state.activePane === "library"
      ? color(` keys: n quick add  N full add  o open  / search  s sort  m group  v groups  x collapse  ? help ${selected ? `| selected: ${selected.id}` : ""} `, BG_STATUS, FG_SAND)
      : color(` keys: Tab/-> next  Enter use  c copy  r run  e edit  f favorite  d delete  Esc back ${selected ? `| ${selected.id}` : ""} `, BG_STATUS, FG_SAND);
  const status = color(` STATUS ${state.status} `, BG_STATUS, FG_CREAM);

  const frameLines = [
    `${header} ${summary}`,
    state.activePane === "library" ? libraryHelp : help,
    "",
    ...joinColumns(leftPanel, details, leftWidth, rightWidth),
    "",
    footerHint,
    status
  ];

  if (!state.tagMenuOpen && !state.sortMenuOpen && !state.searchMenuOpen && !state.sourceMenuOpen && !state.helpMenuOpen && !state.groupMenuOpen && !state.groupVisibilityMenuOpen && !state.quickAddOpen) {
    return frameLines.join("\n");
  }

  const overlayWidth = Math.min(56, Math.max(34, Math.floor(screenWidth * 0.42)));
  const overlayLines = state.quickAddOpen
    ? overlayBox(
        "Quick Add",
        [
          color("Create a local command without leaving the TUI.", FG_SAND),
          color("Enter saves the current field. Esc cancels. Backspace edits.", FG_SLATE),
          "",
          ...QUICK_ADD_FIELDS.map((field, index) => {
            const active = index === state.quickAddStep;
            const value = state.quickAddValues[field.key] || color("(empty)", FG_SLATE);
            const prefix = active ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const label = active ? color(field.label, FG_CREAM, BOLD) : color(field.label, FG_SAND);
            return `${prefix} ${label}: ${value}`;
          }),
          "",
          `${color("Hint", FG_SKY, BOLD)}   ${currentQuickAddField(state).hint}`,
          ...(quickAddPreview(state)
            ? [
                `${color("Id", FG_SKY, BOLD)}     ${quickAddPreview(state)!.id}`,
                `${color("Group", FG_SKY, BOLD)}  ${quickAddPreview(state)!.group ?? "-"}`
              ]
            : [])
        ],
        overlayWidth
      )
    : state.helpMenuOpen
    ? overlayBox(
        "Keyboard Help",
        [
          color("Library", FG_SKY, BOLD),
          color("j / k        Move in the command list", FG_SAND),
          color("o            Open details", FG_SAND),
          color("Enter/Space  Open details", FG_SAND),
          color("/            Search commands", FG_SAND),
          color("g            Filter by tag", FG_SAND),
          color("s            Sort commands", FG_SAND),
          color("m            Group the library", FG_SAND),
          color("v            Open collapse menu", FG_SAND),
          color("x            Collapse current group", FG_SAND),
          color("t            Filter by source", FG_SAND),
          color("n            Quick add command", FG_SAND),
          color("N            Full create command", FG_SAND),
          "",
          color("Details", FG_SKY, BOLD),
          color("Left/Right   Move between actions", FG_SAND),
          color("Tab          Next action", FG_SAND),
          color("Enter        Use selected action", FG_SAND),
          color("b / Esc      Back to library", FG_SAND),
          color("c r e f d    Jump to copy/run/edit/favorite/delete", FG_SAND),
          "",
          color("Global", FG_SKY, BOLD),
          color("?            Toggle this help", FG_SAND),
          color("q            Quit cmdkit", FG_SAND)
        ],
        overlayWidth
      )
    : state.searchMenuOpen
    ? overlayBox(
        "Search Commands",
        [
          color("Type to filter the library live.", FG_SAND),
          color("Enter applies. Esc cancels. Backspace clears.", FG_SLATE),
          "",
          `${color("Query", FG_SKY, BOLD)}  ${state.searchDraft || color("(empty)", FG_SLATE)}`
        ],
        overlayWidth
      )
    : state.tagMenuOpen
    ? overlayBox(
        "Tag Filter",
        [
          color("Choose a tag and press Enter.", FG_SAND),
          color("Esc closes. First option clears the current tag.", FG_SLATE),
          "",
          ...tagOptions.slice(0, 12).map((tag, index) => {
            const selectedRow = index === state.tagMenuIndex;
            const prefix = selectedRow ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const label = selectedRow ? color(tag, FG_CREAM, BOLD) : color(tag, FG_SAND);
            return `${prefix} ${label}`;
          })
        ],
        overlayWidth
      )
    : state.sourceMenuOpen
    ? overlayBox(
        "Source Filter",
        [
          color("Choose which command sources to show.", FG_SAND),
          color("Esc closes without changing the filter.", FG_SLATE),
          "",
          ...sourceMenuOptions().map((option, index) => {
            const selectedRow = index === state.sourceMenuIndex;
            const isCurrent = option.value === state.source;
            const prefix = selectedRow ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const current = isCurrent ? color(" (current)", FG_MINT, BOLD) : "";
            const label = selectedRow ? color(option.label, FG_CREAM, BOLD) : color(option.label, FG_SAND);
            return `${prefix} ${label}${current}`;
          })
        ],
        overlayWidth
      )
    : state.groupMenuOpen
    ? overlayBox(
        "Group Library",
        [
          color("Choose how commands are grouped in the library.", FG_SAND),
          color("Esc closes without changing the grouping.", FG_SLATE),
          "",
          ...groupMenuOptions().map((option, index) => {
            const selectedRow = index === state.groupMenuIndex;
            const isCurrent = option.value === state.groupMode;
            const prefix = selectedRow ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const current = isCurrent ? color(" (current)", FG_MINT, BOLD) : "";
            const label = selectedRow ? color(option.label, FG_CREAM, BOLD) : color(option.label, FG_SAND);
            return `${prefix} ${label}${current}`;
          })
        ],
        overlayWidth
      )
    : state.groupVisibilityMenuOpen
    ? overlayBox(
        "Toggle Groups",
        [
          color("Choose a group and press Enter to collapse or expand it.", FG_SAND),
          color("Esc closes. Collapsed groups stay visible as headers in the library.", FG_SLATE),
          "",
          ...groupVisibilityOptions(state).map((option, index) => {
            const selectedRow = index === state.groupVisibilityMenuIndex;
            const prefix = selectedRow ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const status = option.collapsed ? color("collapsed", FG_AMBER, BOLD) : color("open", FG_MINT, BOLD);
            const label = selectedRow ? color(option.label, FG_CREAM, BOLD) : color(option.label, FG_SAND);
            return `${prefix} ${label} ${color(`(${option.count})`, FG_SLATE)} ${status}`;
          })
        ],
        overlayWidth
      )
    : overlayBox(
        "Sort Commands",
        [
          color("Choose a sort mode and press Enter.", FG_SAND),
          color("Esc closes without changing the sort.", FG_SLATE),
          "",
          ...sortOptions.map((option, index) => {
            const selectedRow = index === state.sortMenuIndex;
            const isCurrent = option.value === state.sortMode;
            const prefix = selectedRow ? color(">", FG_CREAM, BOLD) : color("-", FG_SLATE);
            const current = isCurrent ? color(" (current)", FG_MINT, BOLD) : "";
            const label = selectedRow ? color(option.label, FG_CREAM, BOLD) : color(option.label, FG_SAND);
            return `${prefix} ${label}${current}`;
          })
        ],
        overlayWidth
      );

  const padding = Math.max(0, Math.floor((screenWidth - overlayWidth) / 2));
  const overlay = overlayLines.map((line) => `${" ".repeat(padding)}${line}`);

  return [...frameLines, "", ...overlay].join("\n");
}

function render(state: TuiState): void {
  const frame = buildFrame(state);
  if (frame === lastFrame) {
    return;
  }
  stdout.write(`${FULL_CLEAR}${frame}\x1b[J`);
  lastFrame = frame;
}

async function refresh(state: TuiState, selectedId?: string): Promise<void> {
  const { commands } = await loadCommands();
  state.commands = commands;
  const metadata = await loadMetadata();
  state.favorites = metadata.favorites;
  state.recent = metadata.recent;
  state.filtered = applyFilters(state);
  syncVisibleSelection(state, selectedId);
}

async function withCookedMode<T>(fn: () => Promise<T>): Promise<T> {
  stdin.setRawMode?.(false);
  stdout.write("\x1b[?25h");
  try {
    return await fn();
  } finally {
    flushStdinBuffer();
    stdin.setRawMode?.(true);
    stdout.write("\x1b[?25l");
    stdin.resume();
    lastFrame = "";
  }
}

export async function startTui(): Promise<void> {
  const initial = await loadCommands();
  const metadata = await loadMetadata();
  const state: TuiState = {
    query: "",
    searchDraft: "",
    searchMenuOpen: false,
    helpMenuOpen: false,
    groupMenuOpen: false,
    groupMenuIndex: 0,
    groupVisibilityMenuOpen: false,
    groupVisibilityMenuIndex: 0,
    quickAddOpen: false,
    quickAddStep: 0,
    quickAddValues: {
      title: "",
      command: "",
      tags: "",
      runnable: "no",
      group: ""
    },
    tagFilter: "",
    tagMenuOpen: false,
    tagMenuIndex: 0,
    sortMenuOpen: false,
    sortMenuIndex: 0,
    sourceMenuOpen: false,
    sourceMenuIndex: 0,
    source: "all",
    commands: initial.commands,
    filtered: initial.commands,
    selectedIndex: 0,
    activePane: "library",
    detailActionIndex: 0,
    sortMode: "title",
    groupMode: "group",
    collapsedGroups: [],
    status: initial.issues.length > 0 ? `${initial.issues.length} validation issue(s)` : "Pick a command and press Enter.",
    favorites: metadata.favorites,
    recent: metadata.recent
  };
  state.filtered = applyFilters(state);

  readline.emitKeypressEvents(stdin);
  stdout.write(`${ALT_SCREEN_ON}${FULL_CLEAR}`);
  stdin.setRawMode?.(true);
  stdin.resume();
  render(state);

  await new Promise<void>((resolve) => {
    let exiting = false;

    const cleanup = () => {
      if (exiting) {
        return;
      }
      exiting = true;
      stdin.setRawMode?.(false);
      stdin.pause();
      stdout.write(`${ALT_SCREEN_OFF}\n`);
      lastFrame = "";
      stdin.removeAllListeners("keypress");
    };

    stdin.on("keypress", async (_str, key) => {
      try {
        if (key.sequence === "q" || (key.ctrl && key.name === "c")) {
          cleanup();
          resolve();
          return;
        }

        if (state.quickAddOpen) {
          const field = currentQuickAddField(state);
          if (key.name === "escape") {
            resetQuickAdd(state);
            state.status = "Quick add cancelled.";
          } else if (key.name === "backspace") {
            state.quickAddValues[field.key] = state.quickAddValues[field.key].slice(0, -1);
          } else if (key.name === "return") {
            if (state.quickAddStep < QUICK_ADD_FIELDS.length - 1) {
              state.quickAddStep += 1;
            } else {
              const preview = quickAddPreview(state);
              if (!preview) {
                state.status = "Title and command are required.";
              } else {
                const filePath = await saveLocalCommand(preview);
                const selectedId = preview.id;
                resetQuickAdd(state);
                state.status = `Created local command: ${filePath}`;
                await refresh(state, selectedId);
              }
            }
          } else if (!key.ctrl && !key.meta && key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
            state.quickAddValues[field.key] += key.sequence;
          }
        } else if (state.helpMenuOpen) {
          if (key.name === "escape" || key.sequence === "?") {
            state.helpMenuOpen = false;
            state.status = "Help closed.";
          }
        } else if (state.groupVisibilityMenuOpen) {
          const options = groupVisibilityOptions(state);
          if (key.name === "escape" || key.sequence === "v") {
            state.groupVisibilityMenuOpen = false;
            state.status = "Group visibility closed.";
          } else if (key.sequence === "j" || key.name === "down") {
            state.groupVisibilityMenuIndex = Math.min(state.groupVisibilityMenuIndex + 1, Math.max(0, options.length - 1));
          } else if (key.sequence === "k" || key.name === "up") {
            state.groupVisibilityMenuIndex = Math.max(0, state.groupVisibilityMenuIndex - 1);
          } else if (key.name === "return") {
            const selectedGroup = options[state.groupVisibilityMenuIndex]?.value;
            if (selectedGroup) {
              const selectedId = selectedCommand(state)?.id;
              toggleGroupCollapsed(state, selectedGroup);
              syncVisibleSelection(state, selectedId);
              state.status = state.collapsedGroups.includes(selectedGroup) ? `Collapsed: ${selectedGroup}` : `Expanded: ${selectedGroup}`;
            }
          }
        } else if (state.groupMenuOpen) {
          const options = groupMenuOptions();
          if (key.name === "escape" || key.sequence === "m") {
            state.groupMenuOpen = false;
            state.status = `Grouping unchanged: ${state.groupMode}`;
          } else if (key.sequence === "j" || key.name === "down") {
            state.groupMenuIndex = Math.min(state.groupMenuIndex + 1, Math.max(0, options.length - 1));
          } else if (key.sequence === "k" || key.name === "up") {
            state.groupMenuIndex = Math.max(0, state.groupMenuIndex - 1);
          } else if (key.name === "return") {
            state.groupMode = options[state.groupMenuIndex]?.value ?? state.groupMode;
            state.collapsedGroups = [];
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
            state.groupMenuOpen = false;
            state.status = `Grouping: ${state.groupMode}`;
          }
        } else if (state.searchMenuOpen) {
          if (key.name === "escape") {
            state.searchMenuOpen = false;
            state.searchDraft = state.query;
            state.status = state.query ? `Search unchanged: ${state.query}` : "Search cancelled.";
          } else if (key.name === "return") {
            state.query = state.searchDraft.trim();
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
            state.searchMenuOpen = false;
            state.status = state.query ? `Filtered by "${state.query}".` : "Showing all commands.";
          } else if (key.name === "backspace") {
            state.searchDraft = state.searchDraft.slice(0, -1);
            state.query = state.searchDraft.trim();
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
          } else if (!key.ctrl && !key.meta && key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
            state.searchDraft += key.sequence;
            state.query = state.searchDraft.trim();
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
          }
        } else if (state.tagMenuOpen) {
          const options = tagMenuOptions(state.commands);
          if (key.name === "escape" || key.sequence === "g") {
            state.tagMenuOpen = false;
            state.status = state.tagFilter ? `Tag: ${state.tagFilter}` : "Tag filter cancelled.";
          } else if (key.sequence === "j" || key.name === "down") {
            state.tagMenuIndex = Math.min(state.tagMenuIndex + 1, Math.max(0, options.length - 1));
          } else if (key.sequence === "k" || key.name === "up") {
            state.tagMenuIndex = Math.max(0, state.tagMenuIndex - 1);
          } else if (key.name === "return") {
            const selectedTag = options[state.tagMenuIndex] ?? "";
            state.tagFilter = state.tagMenuIndex === 0 ? "" : selectedTag.toLowerCase();
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
            state.tagMenuOpen = false;
            state.status = state.tagFilter ? `Tag: ${state.tagFilter}` : "Tag filter cleared.";
          }
        } else if (state.sourceMenuOpen) {
          const options = sourceMenuOptions();
          if (key.name === "escape" || key.sequence === "t") {
            state.sourceMenuOpen = false;
            state.status = `Source unchanged: ${state.source}`;
          } else if (key.sequence === "j" || key.name === "down") {
            state.sourceMenuIndex = Math.min(state.sourceMenuIndex + 1, Math.max(0, options.length - 1));
          } else if (key.sequence === "k" || key.name === "up") {
            state.sourceMenuIndex = Math.max(0, state.sourceMenuIndex - 1);
          } else if (key.name === "return") {
            state.source = options[state.sourceMenuIndex]?.value ?? state.source;
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.detailActionIndex = 0;
            state.sourceMenuOpen = false;
            state.status = `Source filter: ${state.source}`;
          }
        } else if (state.sortMenuOpen) {
          const options = sortMenuOptions();
          if (key.name === "escape" || key.sequence === "s") {
            state.sortMenuOpen = false;
            state.status = `Sort unchanged: ${state.sortMode}`;
          } else if (key.sequence === "j" || key.name === "down") {
            state.sortMenuIndex = Math.min(state.sortMenuIndex + 1, Math.max(0, options.length - 1));
          } else if (key.sequence === "k" || key.name === "up") {
            state.sortMenuIndex = Math.max(0, state.sortMenuIndex - 1);
          } else if (key.name === "return") {
            const selectedSort = options[state.sortMenuIndex]?.value ?? state.sortMode;
            state.sortMode = selectedSort;
            state.filtered = applyFilters(state);
            state.selectedIndex = 0;
            state.sortMenuOpen = false;
            state.status = `Sort: ${state.sortMode}`;
          }
        } else if (state.activePane === "library") {
          if (key.sequence === "j" || key.name === "down") {
            state.selectedIndex = Math.min(state.selectedIndex + 1, Math.max(0, visibleCommands(state).length - 1));
            state.detailActionIndex = 0;
          } else if (key.sequence === "k" || key.name === "up") {
            state.selectedIndex = Math.max(0, state.selectedIndex - 1);
            state.detailActionIndex = 0;
          } else if (key.sequence === "?") {
            state.helpMenuOpen = true;
            state.status = "Help open.";
          } else if (key.sequence === "o" || key.name === "return" || key.name === "right" || key.sequence === "l" || key.name === "space") {
            state.activePane = "details";
            state.detailActionIndex = 0;
            state.status = "Details open. Move between actions and press Enter.";
          } else if (key.sequence === "m") {
            const options = groupMenuOptions();
            state.groupMenuOpen = true;
            state.groupMenuIndex = Math.max(0, options.findIndex((option) => option.value === state.groupMode));
            state.status = "Grouping menu open.";
          } else if (key.sequence === "v") {
            state.groupVisibilityMenuOpen = true;
            state.groupVisibilityMenuIndex = 0;
            state.status = "Group visibility open.";
          } else if (key.sequence === "x") {
            const command = selectedCommand(state);
            const group = command ? commandGroupLabel(command, state.groupMode) : "";
            if (group && state.groupMode !== "none") {
              toggleGroupCollapsed(state, group);
              syncVisibleSelection(state, command?.id);
              state.status = state.collapsedGroups.includes(group) ? `Collapsed: ${group}` : `Expanded: ${group}`;
            }
          } else if (key.sequence === "t") {
            const options = sourceMenuOptions();
            state.sourceMenuOpen = true;
            state.sourceMenuIndex = Math.max(0, options.findIndex((option) => option.value === state.source));
            state.status = "Source menu open.";
          } else if (key.sequence === "s") {
            const options = sortMenuOptions();
            state.sortMenuOpen = true;
            state.sortMenuIndex = Math.max(0, options.findIndex((option) => option.value === state.sortMode));
            state.status = "Sort menu open.";
          } else if (key.sequence === "g") {
            state.tagMenuOpen = true;
            state.tagMenuIndex = 0;
            state.status = "Tag menu open.";
          } else if (key.sequence === "/") {
            state.searchDraft = state.query;
            state.searchMenuOpen = true;
            state.status = "Search open.";
          } else if (key.sequence === "n") {
            resetQuickAdd(state);
            state.quickAddOpen = true;
            state.status = "Quick add open.";
          } else if (key.sequence === "N") {
            const filePath = await withCookedMode(async () => createNewCommand());
            state.status = `Created local command: ${filePath}`;
            await refresh(state);
          }
        } else {
          const command = selectedCommand(state);
          const actions = detailActions(command);
          const actionCount = actions.length;
          const currentAction = actions[state.detailActionIndex] ?? actions[0];
          if (key.sequence === "?") {
            state.helpMenuOpen = true;
            state.status = "Help open.";
          } else if (key.name === "escape" || key.sequence === "b") {
            state.activePane = "library";
            state.status = "Back to library.";
          } else if (key.name === "tab" || key.name === "right" || key.sequence === "l") {
            state.detailActionIndex = (state.detailActionIndex + 1) % actionCount;
            state.status = `Action: ${actions[state.detailActionIndex]}`;
          } else if (key.name === "left" || key.sequence === "h" || (key.shift && key.name === "tab")) {
            state.detailActionIndex = (state.detailActionIndex - 1 + actionCount) % actionCount;
            state.status = `Action: ${actions[state.detailActionIndex]}`;
          } else if (key.sequence === "c") {
            state.detailActionIndex = actions.indexOf("copy");
            if (command) {
              const result = await withCookedMode(async () => copyCommand(command));
              state.status = result.copied ? `Copied: ${result.rendered}` : `Clipboard unavailable. ${result.rendered}`;
              await refresh(state, command.id);
            }
          } else if (key.sequence === "r") {
            state.detailActionIndex = Math.max(0, actions.indexOf("run"));
            if (command) {
              const result = await withCookedMode(async () => runCommand(command));
              state.status =
                result.exitCode === 0
                  ? `Run complete: ${result.rendered}`
                  : `Run failed (${result.exitCode}): ${result.rendered}`;
              await refresh(state, command.id);
            }
          } else if (key.sequence === "e") {
            state.detailActionIndex = actions.indexOf("edit");
            if (command) {
              await withCookedMode(async () => openInEditor(command.filePath));
              state.status = `Edited: ${command.filePath}`;
              await refresh(state, command.id);
            }
          } else if (key.sequence === "f") {
            state.detailActionIndex = actions.indexOf("favorite");
            if (command) {
              const enabled = await toggleFavorite(command.id);
              state.status = enabled ? `Favorited: ${command.id}` : `Unfavorited: ${command.id}`;
              await refresh(state, command.id);
            }
          } else if (key.sequence === "d") {
            state.detailActionIndex = actions.indexOf("delete");
            if (command?.source === "local") {
              const confirmed = await withCookedMode(async () => (await import("./lib/prompt")).confirm(`Delete ${command.id}?`, false));
              if (confirmed) {
                await deleteLocalCommand(command);
                state.activePane = "library";
                state.status = `Deleted local command: ${command.id}`;
                await refresh(state);
              } else {
                state.status = `Delete cancelled: ${command.id}`;
              }
            }
          } else if (key.name === "return") {
            if (currentAction === "back") {
              state.activePane = "library";
              state.status = "Back to library.";
            } else if (currentAction === "copy" && command) {
              const result = await withCookedMode(async () => copyCommand(command));
              state.status = result.copied ? `Copied: ${result.rendered}` : `Clipboard unavailable. ${result.rendered}`;
              await refresh(state, command.id);
            } else if (currentAction === "run" && command) {
              const result = await withCookedMode(async () => runCommand(command));
              state.status =
                result.exitCode === 0
                  ? `Run complete: ${result.rendered}`
                  : `Run failed (${result.exitCode}): ${result.rendered}`;
              await refresh(state, command.id);
            } else if (currentAction === "edit" && command) {
              await withCookedMode(async () => openInEditor(command.filePath));
              state.status = `Edited: ${command.filePath}`;
              await refresh(state, command.id);
            } else if (currentAction === "favorite" && command) {
              const enabled = await toggleFavorite(command.id);
              state.status = enabled ? `Favorited: ${command.id}` : `Unfavorited: ${command.id}`;
              await refresh(state, command.id);
            } else if (currentAction === "delete" && command?.source === "local") {
              const confirmed = await withCookedMode(async () => (await import("./lib/prompt")).confirm(`Delete ${command.id}?`, false));
              if (confirmed) {
                await deleteLocalCommand(command);
                state.activePane = "library";
                state.status = `Deleted local command: ${command.id}`;
                await refresh(state);
              } else {
                state.status = `Delete cancelled: ${command.id}`;
              }
            } else if (command) {
              await withCookedMode(async () => Promise.resolve(printCommand(command)));
              state.status = `Viewed: ${command.id}`;
            }
          }
        }
      } catch (error) {
        state.status = error instanceof Error ? error.message : "Unexpected error.";
      } finally {
        if (!exiting) {
          render(state);
        }
      }
    });
  });
}
