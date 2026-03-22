# cmdkit

`cmdkit` is a terminal-first command vault for the CLI snippets you need often enough to keep, but not often enough to memorize.

It works well as a personal local command library, but it can also load shared community packs from the repo. That means one user can keep everything private, while another can use the same app as an open source command library with contributions from others.

## What It Does

- Browse commands in an interactive TUI
- Search, sort, and filter by tag or source
- Copy commands to the clipboard with fallback output
- Run explicitly runnable commands with confirmation
- Store local commands in YAML
- Import and export local command packs
- Track favorites and recent commands locally

## Local-First by Default

`cmdkit` does not require a hosted backend or a community repo to be useful.

- Local commands live in `~/.config/cmdkit/commands/*.yaml`
- Local metadata lives in `~/.config/cmdkit/metadata.json`
- Repo command packs live under `commands/`

If `~/.config/cmdkit` is not writable, `cmdkit` falls back to an internal writable directory. You can also override the home directory explicitly:

```bash
CMDKIT_HOME=/path/to/cmdkit-home bun run src/index.ts
```

## Quick Start

```bash
bun install
bun run src/index.ts
```

Global install for Bun users:

```bash
bun install -g cmdkit
cmdkit
```

Useful CLI commands:

```bash
cmdkit search wordpress
cmdkit copy wp.plugin.list
cmdkit run mysql.login
cmdkit new
cmdkit import ./my-commands.yaml
cmdkit export ./cmdkit-export.yaml
cmdkit validate
```

## Publish Notes

`cmdkit` is currently packaged as a Bun-first CLI. That means:

- the executable uses `#!/usr/bin/env bun`
- users need Bun installed to run the published package
- npm publishing is still useful for distribution, but this is not yet a plain Node-only binary

Recommended release flow:

```bash
bun run check
npm publish
```

If you want truly frictionless npm usage for people without Bun, the next packaging step is to ship a built `bin/` wrapper or standalone artifact.

## TUI Shortcuts

Library:

- `j` / `k` moves in the command list
- `o`, `Enter`, `Space`, or `→` opens details
- `/` opens search
- `g` opens tag filter
- `s` opens sort menu
- `t` opens source filter
- `n` creates a new local command
- `?` opens help
- `q` quits

Details:

- `←` / `→` moves between actions
- `Tab` moves to the next action
- `Enter` uses the selected action
- `c`, `r`, `e`, `f` jumps to copy, run, edit, favorite
- `b` or `Esc` returns to the library

## Data Model

Each command entry supports:

- `id`
- `title`
- `description`
- `command`
- `tags`
- `placeholders`
- `copyable`
- `runnable`
- `notes`
- `shells`
- `platforms`
- `safety`
- `source`
- `author`
- `updatedAt`

Example:

```yaml
- id: wp.plugin.list
  title: List WordPress plugins
  description: Show all installed plugins with status.
  command: wp plugin list --path={{wp_path}}
  tags:
    - wordpress
    - wp-cli
  placeholders:
    - name: wp_path
      prompt: WordPress path
      default: /var/www/html
  copyable: true
  runnable: true
  notes: Requires wp-cli to be installed.
  shells:
    - bash
    - zsh
  platforms:
    - linux
    - macos
  safety: safe
  source: community
  author: cmdkit
  updatedAt: 2026-03-21
```

## Source Rules

- Local mode always works, even if repo packs are missing
- Local commands override community commands with the same `id`
- Commands can be filtered by `all`, `local`, or `community`

## Safety

- `copy` is the primary flow
- `run` always asks for confirmation
- `warning` and `destructive` commands are visually flagged
- If clipboard support is unavailable, `cmdkit` prints the rendered command so it can still be copied manually

## Contributing

Open source contributions are welcome, but they are optional. `cmdkit` should stay useful even for users who only want a personal local vault.

If you want to contribute shared commands:

1. Add or update a YAML file under `commands/core/`
2. Run `bun run src/index.ts validate`
3. Test the command from the TUI or CLI

See [CONTRIBUTING.md](/home/mw/Projects/project/cmdkit/CONTRIBUTING.md) for the command guidelines.

## Roadmap

- More command packs
- Better packaging for npm/global install
- Richer TUI polish for large libraries
- Team pack workflows
- Optional pack sharing beyond the local-first model
