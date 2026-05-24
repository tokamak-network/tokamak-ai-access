# @tokamak-network/ai-access-cli

Configure TON AI Access settings for Claude Code, Codex, OpenClaw, and Hermes. Revert is supported for Claude Code and Codex only.

## Usage

```bash
# Interactive setup (prompts for target and API key)
npx @tokamak-network/ai-access-cli configure

# Configure a specific target
npx @tokamak-network/ai-access-cli configure --target claude --api-key sk-...

# Dry-run preview (no files modified)
npx @tokamak-network/ai-access-cli configure --target claude --api-key sk-... --dry-run

# Revert all changes
npx @tokamak-network/ai-access-cli revert --target all

# Revert a specific target
npx @tokamak-network/ai-access-cli revert --target claude
```

## Supported Targets

| Target | Shell profile | Config file | Revert |
|---|---|---|---|
| `claude` | 7 `ANTHROPIC_*` exports | `~/.claude/settings.json` (surgical merge) | yes |
| `codex` | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `~/.codex/config.toml` (full overwrite) | yes |
| `openclaw` | marker block | `~/.openclaw/openclaw.json` (surgical merge) | no |
| `hermes` | marker block | `~/.hermes/config.yaml` (full overwrite) | no |

## Options

```
configure:
  --target <t>          claude | codex | openclaw | hermes
  --api-key <key>       TON API key (also via TON_API_KEY env var)
  --base-url <url>      default: https://api2.ai.tokamak.network
  --model <model>       default: qwen-3.6
  --list-models         list available models and exit
  --non-interactive     disable interactive prompts
  --dry-run             preview changes without modifying files

revert:
  --target <t>          claude | codex | all
  --non-interactive     disable interactive prompts
  --dry-run             preview changes without modifying files
  --no-backup           skip creating .bak-YYYYMMDD-HHMMSS backup files
```

## How it works

Settings are wrapped in a marker block so changes are surgical and reversible:

```bash
# TON AI Access — auto-configured — 2026-01-01 | target: claude | model: qwen-3.6
export ANTHROPIC_API_KEY="sk-..."
...
# ///TON AI Access
```

`revert` removes only the marker block and the keys it added, leaving your existing configuration intact.

## Usage in Coding Agents (Claude Code, Codex)

This CLI requires a real TTY. Running it inside an agent's Bash tool crashes with:

```
SystemError [ERR_TTY_INIT_FAILED]: TTY initialization failed: uv_tty_init returned EINVAL
```

**Option 1 — `--non-interactive` (recommended for agents)**

```bash
TON_API_KEY=<key> npx @tokamak-network/ai-access-cli configure --target claude --non-interactive
```

**Option 2 — Claude Code `!` prefix (runs in a real terminal)**

```
!npx @tokamak-network/ai-access-cli configure --target claude
```

## Backup

By default, `revert` creates a timestamped backup (`<file>.bak-YYYYMMDD-HHMMSS`) before modifying any file. Use `--no-backup` to skip.
