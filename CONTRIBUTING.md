# Contributing to cmdkit

`cmdkit` is local-first, but community command packs are a core part of the project. Contributions should improve the shared library without making the tool unsafe or noisy.

## Principles

- Keep titles short and specific
- Prefer tags that map to real tools or ecosystems such as `wordpress`, `mysql`, `react`, `docker`
- Default to copy-first workflows
- Mark commands as runnable only when it is reasonable for a general-purpose CLI tool to execute them
- Use placeholders for values users are likely to change

## Adding Or Updating Commands

1. Add or update a YAML file under `commands/core/`
2. Run `bun test`
3. Run `bun run src/index.ts validate`
4. Test the command from the TUI or CLI

## Recommended Conventions

- `id`: dot-separated and stable, for example `mysql.dump` or `wp.plugin.list`
- `author`: your GitHub handle or organization
- `updatedAt`: ISO date in `YYYY-MM-DD`
- `source`: use `community` for repo-managed commands

## Safety Rules

- Avoid destructive commands unless they are clearly marked and documented
- Use `safety: safe`, `warning`, or `destructive` honestly
- Set `runnable: true` only when the command is safe enough to expose in a generic runner
- If a command can damage data, explain that in `notes`

## Quality Bar

- Commands should be readable without reverse engineering them
- `description` should explain the use case, not just restate the title
- `notes` should explain assumptions, caveats, or prerequisites
- If a command depends on a specific shell or platform, declare it

## Example Review Checklist

- Is the `id` stable and specific?
- Are the tags useful for filtering?
- Are placeholders present where needed?
- Is the safety level accurate?
- Is the command actually helpful to more than one person?
