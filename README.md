# cmdkit

`cmdkit` is a terminal-first command vault for the snippets you need often enough to keep, but not often enough to memorize.

It works in two modes:

- Local-first: keep your own commands in `~/.config/cmdkit/commands/*.yaml`
- Community-enabled: also load shared command packs from the repo under `commands/`

## Features

- Interactive TUI with search, tags, source filters, copy, run, new, and edit
- Local and community command sources with local override priority
- YAML-backed command library
- Placeholder prompts like `{{site}}` before copy or run
- Clipboard integration with terminal fallback
- Safety levels for runnable commands
- `favorites` and `recent` metadata stored locally

## Quick start

```bash
bun run src/index.ts
```

TUI basics:

- `j` / `k` moves in the library list
- `Enter`, `→`, or `l` opens the details panel
- `Esc`, `←`, or `h` returns to the library
- `c`, `r`, `e`, and `f` act inside details

Useful subcommands:

```bash
cmdkit search wordpress
cmdkit copy wp.plugin.list
cmdkit run mysql.dump
cmdkit new
cmdkit validate
```

## Data layout

Community command packs live in:

```text
commands/core/*.yaml
commands/community/*.yaml
```

Local commands live in:

```text
~/.config/cmdkit/commands/*.yaml
```

Metadata lives in:

```text
~/.config/cmdkit/metadata.json
```

If `~/.config/cmdkit` is not writable, `cmdkit` falls back to an internal writable directory. You can also override the home directory explicitly with `CMDKIT_HOME=/path/to/cmdkit-home`.

## Command schema

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

## Source precedence

- Local commands are always supported, even if the repo packs are absent.
- If the same `id` exists in both local and community sources, the local command wins.
- You can filter on `local`, `community`, or `all` in both the CLI and TUI.

## Notes

- `run` always asks for confirmation.
- Commands marked `warning` or `destructive` show an extra warning.
- If clipboard support is unavailable, `cmdkit` prints the rendered command so you can copy it manually.
