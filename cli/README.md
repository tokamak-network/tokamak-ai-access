# @tokamak-network/ai-access-cli

Configure TON AI Access LiteLLM keys for Claude Code, Codex, OpenClaw, and Hermes.

**Requirements:** Node.js ≥ 18

## Install

```bash
npm install -g @tokamak-network/ai-access-cli
```

Or use without installing: replace `tokamak-ai-access` with `npx @tokamak-network/ai-access-cli` in any command below.

## Configure

```bash
# Interactive — prompts for target, API key, and model
tokamak-ai-access configure

# Non-interactive
tokamak-ai-access configure --target claude --api-key sk-...
TON_API_KEY=sk-... tokamak-ai-access configure --target hermes --non-interactive

# Dry-run preview (no files modified)
tokamak-ai-access configure --target claude --api-key sk-... --dry-run

# List available models
tokamak-ai-access configure --list-models --api-key sk-...
```

## Revert

Removes TON AI Access settings and restores the original configuration (claude and codex only).

```bash
tokamak-ai-access revert --target claude
tokamak-ai-access revert --target codex

# Dry-run preview
tokamak-ai-access revert --target claude --dry-run
```

## Supported Targets

| Target | Shell profile | Config file | Revert |
|---|---|---|---|
| `claude` | 7 `ANTHROPIC_*` exports | `~/.claude/settings.json` (surgical merge) | yes |
| `codex` | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `~/.codex/config.toml` (full overwrite) | yes |
| `openclaw` | marker block (no env vars) | `~/.openclaw/openclaw.json` (surgical merge) | no |
| `hermes` | — | `~/.hermes/config.yaml` (full overwrite) | no |

## Options

```
configure:
  --target <t>          claude | codex | openclaw | hermes
  --api-key <key>       TON API key (also via TON_API_KEY env var)
  --base-url <url>      default: https://api2.ai.tokamak.network
  --model <model>       qwen-3.6 | minimax-m2.7 (interactive: prompted; non-interactive default: qwen-3.6)
  --list-models         list available models and exit (requires --api-key)
  --non-interactive     disable interactive prompts (--target and --api-key required)
  --dry-run             preview changes without modifying files

revert:
  --target <t>          claude | codex
  --non-interactive     disable interactive prompts (--target required)
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

## Gateway Restart

After writing configuration, `configure openclaw` and `configure hermes` automatically run their respective gateway restart commands (`openclaw gateway restart` / `hermes gateway restart`) so the new API key takes effect immediately. If the binary is not found or the restart fails, a warning is printed and the command continues.

## Backup

By default, `revert` creates a timestamped backup (`<file>.bak-YYYYMMDD-HHMMSS`) before modifying any file. Use `--no-backup` to skip.
