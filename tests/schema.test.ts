import { describe, expect, test } from "bun:test";
import { sortCommands } from "../src/lib/commands";
import { normalizeCommand } from "../src/lib/schema";
import { renderCommand } from "../src/lib/render";

describe("normalizeCommand", () => {
  test("accepts a valid command", () => {
    const command = normalizeCommand({
      id: "mysql.dump",
      title: "Dump",
      description: "Create dump",
      command: "mysqldump {{database}}",
      tags: ["mysql"],
      placeholders: [{ name: "database", prompt: "DB" }],
      copyable: true,
      runnable: false,
      notes: "note",
      shells: ["bash"],
      platforms: ["linux"],
      safety: "warning",
      source: "local",
      author: "mw",
      updatedAt: "2026-03-21"
    });

    expect(command.id).toBe("mysql.dump");
    expect(command.placeholders).toHaveLength(1);
  });

  test("rejects invalid safety level", () => {
    expect(() =>
      normalizeCommand({
        id: "bad",
        title: "Bad",
        description: "Bad",
        command: "echo bad",
        tags: [],
        placeholders: [],
        copyable: true,
        runnable: false,
        shells: [],
        platforms: [],
        safety: "unknown",
        source: "local",
        author: "mw",
        updatedAt: "2026-03-21"
      })
    ).toThrow("safety must be one of: safe, warning, destructive.");
  });
});

describe("renderCommand", () => {
  test("replaces placeholders", () => {
    const rendered = renderCommand(
      {
        id: "wp.plugin.list",
        title: "List plugins",
        description: "desc",
        command: "wp plugin list --path={{wp_path}}",
        tags: ["wordpress"],
        placeholders: [{ name: "wp_path" }],
        copyable: true,
        runnable: true,
        shells: ["bash"],
        platforms: ["linux"],
        safety: "safe",
        source: "community",
        author: "cmdkit",
        updatedAt: "2026-03-21",
        filePath: "/tmp/wp.yaml"
      },
      { wp_path: "/srv/www" }
    );

    expect(rendered).toBe("wp plugin list --path=/srv/www");
  });
});

describe("sortCommands", () => {
  test("sorts favorites ahead of others", () => {
    const commands = [
      {
        id: "b",
        title: "Beta",
        description: "",
        command: "echo beta",
        tags: [],
        placeholders: [],
        copyable: true,
        runnable: false,
        shells: ["bash"],
        platforms: ["linux"],
        safety: "safe" as const,
        source: "community" as const,
        author: "cmdkit",
        updatedAt: "2026-03-21",
        filePath: "/tmp/b.yaml"
      },
      {
        id: "a",
        title: "Alpha",
        description: "",
        command: "echo alpha",
        tags: [],
        placeholders: [],
        copyable: true,
        runnable: false,
        shells: ["bash"],
        platforms: ["linux"],
        safety: "safe" as const,
        source: "community" as const,
        author: "cmdkit",
        updatedAt: "2026-03-21",
        filePath: "/tmp/a.yaml"
      }
    ];

    const sorted = sortCommands(commands, "favorites", {
      favorites: ["b"],
      recent: []
    });

    expect(sorted[0]?.id).toBe("b");
  });
});
