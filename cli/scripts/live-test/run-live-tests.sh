#!/usr/bin/env bash
# Live end-to-end tests for @tokamak-network/ai-access-cli
# Run inside a Docker container via run.sh — do not execute directly on the host.
set -uo pipefail

GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"; RESET="\033[0m"
PASSED=0; FAILED=0; SKIPPED=0

pass()    { echo -e "${GREEN}  PASS${RESET} $1"; PASSED=$((PASSED+1)); }
fail()    { echo -e "${RED}  FAIL${RESET} $1" >&2; FAILED=$((FAILED+1)); }
skip()    { echo -e "${YELLOW}  SKIP${RESET} $1"; SKIPPED=$((SKIPPED+1)); }
section() { echo -e "\n${BOLD}=== $1 ===${RESET}"; }

assert_exit0() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$label"
  else fail "$label (expected exit 0)"; fi
}

assert_exit_nonzero() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then fail "$label (expected non-zero exit)"
  else pass "$label"; fi
}

assert_file_exists() {
  [ -e "$2" ] && pass "$1" || fail "$1 (missing: $2)"
}

assert_file_absent() {
  [ ! -e "$2" ] && pass "$1" || fail "$1 (should not exist: $2)"
}

assert_contains() {
  grep -qF "$3" "$2" 2>/dev/null && pass "$1" || fail "$1 (pattern '$3' not in $2)"
}

assert_not_contains() {
  grep -qF "$3" "$2" 2>/dev/null && fail "$1 (pattern '$3' unexpectedly in $2)" || pass "$1"
}

assert_count() {
  local label="$1" file="$2" pattern="$3" expected="$4"
  local actual
  # Use || at statement level: grep -c exits 1 when 0 matches (but outputs "0"),
  # so capturing inside $() would give "0\n0" with inline || echo 0.
  actual=$(grep -c "$pattern" "$file" 2>/dev/null) || actual=0
  if [ "$actual" -eq "$expected" ]; then pass "$label"
  else fail "$label (expected $expected, got $actual matches for '$pattern' in $file)"; fi
}

assert_stdout_contains() {
  local label="$1" pattern="$2"; shift 2
  local out
  out=$("$@" 2>/dev/null) || out=""
  echo "$out" | grep -qF "$pattern" && pass "$label" || fail "$label (stdout missing '$pattern')"
}

ZSHRC=/root/.zshrc
cp "$ZSHRC" /root/.zshrc.orig

reset_home() {
  cp /root/.zshrc.orig "$ZSHRC"
  rm -rf /root/.claude /root/.codex /root/.openclaw /root/.hermes /root/.tokamak-ai-access
}

# ─── Phase 0: Sanity ─────────────────────────────────────────────────────────
section "Phase 0 — Sanity"
assert_exit0 "--version exits 0" tokamak-ai-access --version
assert_stdout_contains "--version outputs version string" "1." tokamak-ai-access --version
assert_stdout_contains "--help mentions 'configure'" "configure" tokamak-ai-access --help
assert_stdout_contains "--help mentions 'revert'" "revert" tokamak-ai-access --help

# ─── Phase 1: Network ────────────────────────────────────────────────────────
section "Phase 1 — Network (--list-models)"
if [ -n "${TON_API_KEY:-}" ]; then
  OUT=$(tokamak-ai-access configure --list-models --api-key "$TON_API_KEY" 2>&1) || OUT=""
  if echo "$OUT" | grep -qiE "qwen|claude|gpt|llama|model"; then
    pass "--list-models returns at least 1 recognizable model"
  else
    fail "--list-models returned no recognizable model (output: ${OUT:0:200})"
  fi
else
  skip "--list-models (TON_API_KEY not set)"
fi

# ─── Phase 2: Dry-run (no file mutations) ────────────────────────────────────
section "Phase 2 — Dry-run (no file mutations)"
reset_home
ORIG_MTIME=$(stat -c %Y "$ZSHRC")

for target in claude codex openclaw hermes; do
  tokamak-ai-access configure \
    --target "$target" --api-key sk-dryrun --model qwen-3.6 \
    --non-interactive --dry-run >/dev/null 2>&1 || true

  NEW_MTIME=$(stat -c %Y "$ZSHRC")
  if [ "$NEW_MTIME" = "$ORIG_MTIME" ]; then pass "dry-run $target: ~/.zshrc unchanged"
  else fail "dry-run $target: ~/.zshrc was modified"; fi

  assert_file_absent "dry-run $target: ~/.claude/settings.json absent" /root/.claude/settings.json
  assert_file_absent "dry-run $target: ~/.codex/config.toml absent"   /root/.codex/config.toml
  assert_file_absent "dry-run $target: ~/.openclaw/openclaw.json absent" /root/.openclaw/openclaw.json
  assert_file_absent "dry-run $target: ~/.hermes/config.yaml absent"  /root/.hermes/config.yaml
done

# ─── Phase 3a: claude configure + revert ─────────────────────────────────────
section "Phase 3a — claude configure + revert"
reset_home

tokamak-ai-access configure \
  --target claude --api-key sk-live-test --model qwen-3.6 \
  --non-interactive >/dev/null 2>&1

assert_contains "claude: marker block in ~/.zshrc" "$ZSHRC" "TON AI Access"
assert_count    "claude: 7 ANTHROPIC_* exports in ~/.zshrc" "$ZSHRC" "ANTHROPIC_" 7
assert_file_exists "claude: ~/.claude/settings.json exists" /root/.claude/settings.json

SETTINGS_COUNT=$(jq '(.env // {}) | keys | map(select(startswith("ANTHROPIC_"))) | length' \
  /root/.claude/settings.json 2>/dev/null || echo 0)
if [ "$SETTINGS_COUNT" -eq 7 ]; then pass "claude: 7 ANTHROPIC_* keys in settings.json"
else fail "claude: expected 7 ANTHROPIC_* keys, got $SETTINGS_COUNT"; fi

assert_file_exists "claude: env-backup.json created" /root/.tokamak-ai-access/env-backup.json

tokamak-ai-access revert --target claude --non-interactive --no-backup >/dev/null 2>&1

assert_not_contains "claude revert: ANTHROPIC_* removed from ~/.zshrc" "$ZSHRC" "ANTHROPIC_"
assert_not_contains "claude revert: marker block removed from ~/.zshrc" "$ZSHRC" "TON AI Access"

REMAINING=$(jq '(.env // {}) | keys | map(select(startswith("ANTHROPIC_"))) | length' \
  /root/.claude/settings.json 2>/dev/null || echo 0)
if [ "$REMAINING" -eq 0 ]; then pass "claude revert: 0 ANTHROPIC_* keys remain in settings.json"
else fail "claude revert: expected 0, got $REMAINING remaining"; fi

# ─── Phase 3b: codex configure + revert ─────────────────────────────────────
section "Phase 3b — codex configure + revert"
reset_home

tokamak-ai-access configure \
  --target codex --api-key sk-live-test --model qwen-3.6 \
  --non-interactive >/dev/null 2>&1

assert_contains "codex: OPENAI_API_KEY in ~/.zshrc"      "$ZSHRC" "OPENAI_API_KEY"
assert_contains "codex: OPENAI_BASE_URL in ~/.zshrc"     "$ZSHRC" "OPENAI_BASE_URL"
assert_file_exists "codex: ~/.codex/config.toml exists"  /root/.codex/config.toml
assert_contains "codex: config.toml has TON marker"           /root/.codex/config.toml "TON AI Access"
assert_contains "codex: config.toml base_url has /v1"        /root/.codex/config.toml "/v1"
assert_contains "codex: config.toml has model_provider"      /root/.codex/config.toml 'model_provider = "tokamak"'
assert_contains "codex: config.toml has env_key"             /root/.codex/config.toml 'env_key = "OPENAI_API_KEY"'
assert_contains "codex: config.toml has model=qwen-3.6"      /root/.codex/config.toml 'model = "qwen-3.6"'

tokamak-ai-access revert --target codex --non-interactive --no-backup >/dev/null 2>&1

assert_not_contains "codex revert: marker removed from ~/.zshrc" "$ZSHRC" "TON AI Access"
assert_file_absent  "codex revert: config.toml deleted"          /root/.codex/config.toml

# ─── Phase 3c: openclaw configure ────────────────────────────────────────────
section "Phase 3c — openclaw configure"
reset_home

tokamak-ai-access configure \
  --target openclaw --api-key sk-live-test --model qwen-3.6 \
  --non-interactive >/dev/null 2>&1

assert_contains     "openclaw: marker block in ~/.zshrc"       "$ZSHRC" "TON AI Access"
assert_not_contains "openclaw: no OPENAI_* in ~/.zshrc"        "$ZSHRC" "OPENAI_"
assert_not_contains "openclaw: no ANTHROPIC_* in ~/.zshrc"     "$ZSHRC" "ANTHROPIC_"
assert_file_exists  "openclaw: ~/.openclaw/openclaw.json exists" /root/.openclaw/openclaw.json

OC_BASEURL=$(jq -r '.models.providers.litellm.baseUrl // empty' /root/.openclaw/openclaw.json 2>/dev/null)
if echo "$OC_BASEURL" | grep -q "tokamak"; then pass "openclaw: openclaw.json litellm.baseUrl set"
else fail "openclaw: openclaw.json litellm.baseUrl missing or wrong (got: ${OC_BASEURL:-<empty>})"; fi

OC_APIKEY=$(jq -r '.models.providers.litellm.apiKey // empty' /root/.openclaw/openclaw.json 2>/dev/null)
if [ "$OC_APIKEY" = "sk-live-test" ]; then pass "openclaw: openclaw.json litellm.apiKey correct"
else fail "openclaw: openclaw.json litellm.apiKey wrong (got: ${OC_APIKEY:-<empty>})"; fi

OC_MODEL=$(jq -r '.models.default // empty' /root/.openclaw/openclaw.json 2>/dev/null)
if [ "$OC_MODEL" = "litellm/qwen-3.6" ]; then pass "openclaw: openclaw.json models.default correct"
else fail "openclaw: openclaw.json models.default wrong (got: ${OC_MODEL:-<empty>})"; fi

# revert exits 0 for openclaw but is a no-op (switch falls through)
assert_exit0 "openclaw: revert exits 0 (no-op)" \
  tokamak-ai-access revert --target openclaw --non-interactive --no-backup
assert_file_exists "openclaw: openclaw.json still present after no-op revert" \
  /root/.openclaw/openclaw.json

# ─── Phase 3d: hermes configure ──────────────────────────────────────────────
section "Phase 3d — hermes configure"
reset_home

ZSHRC_BEFORE=$(cat "$ZSHRC")
HERMES_CONFIGURE_OUT=$(tokamak-ai-access configure \
  --target hermes --api-key sk-live-test --model qwen-3.6 \
  --non-interactive 2>&1)

ZSHRC_AFTER=$(cat "$ZSHRC")
if [ "$ZSHRC_BEFORE" = "$ZSHRC_AFTER" ]; then pass "hermes: ~/.zshrc unchanged"
else fail "hermes: ~/.zshrc was modified"; fi

assert_file_exists "hermes: ~/.hermes/config.yaml exists"         /root/.hermes/config.yaml
assert_contains    "hermes: config.yaml has base_url"             /root/.hermes/config.yaml "base_url:"
assert_contains    "hermes: config.yaml has model"                /root/.hermes/config.yaml "qwen-3.6"
assert_contains    "hermes: config.yaml has api_key"              /root/.hermes/config.yaml "api_key:"
assert_contains    "hermes: config.yaml has api_mode"             /root/.hermes/config.yaml "api_mode: chat_completions"
assert_contains    "hermes: config.yaml has custom_providers"     /root/.hermes/config.yaml "custom_providers:"
assert_contains    "hermes: config.yaml has tokamak provider"     /root/.hermes/config.yaml "name: tokamak"

# Verify gateway restart was attempted (hermes binary absent in base image → info message)
if echo "$HERMES_CONFIGURE_OUT" | grep -qE "Gateway 재시작|hermes 바이너리를 찾을 수 없습니다"; then
  pass "hermes: configure output includes gateway restart attempt"
else
  fail "hermes: configure output missing gateway restart attempt (output: ${HERMES_CONFIGURE_OUT:0:300})"
fi

assert_exit0 "hermes: revert exits 0 (no-op)" \
  tokamak-ai-access revert --target hermes --non-interactive --no-backup
assert_file_exists "hermes: config.yaml still present after no-op revert" \
  /root/.hermes/config.yaml

# ─── Phase 4: cleanup-env / restore-env ──────────────────────────────────────
section "Phase 4 — cleanup-env / restore-env"
reset_home

tokamak-ai-access configure \
  --target claude --api-key sk-live-test --model qwen-3.6 \
  --non-interactive >/dev/null 2>&1

assert_file_exists "Phase 4: env-backup.json exists after configure" \
  /root/.tokamak-ai-access/env-backup.json

assert_stdout_contains "cleanup-env outputs 'unset ANTHROPIC_API_KEY'" \
  "unset ANTHROPIC_API_KEY" tokamak-ai-access cleanup-env

assert_exit0 "restore-env exits 0 when backup exists" tokamak-ai-access restore-env

rm -f /root/.tokamak-ai-access/env-backup.json
assert_exit_nonzero "restore-env exits 1 when backup missing" tokamak-ai-access restore-env

# ─── Phase 5: End-to-end LLM routing (--with-llm) ────────────────────────────
section "Phase 5 — End-to-end LLM routing"
if [ "${WITH_LLM:-false}" != "true" ]; then
  skip "Phase 5 (--with-llm not set)"
elif [ -z "${TON_API_KEY:-}" ]; then
  skip "Phase 5 (TON_API_KEY not set)"
elif ! command -v claude >/dev/null 2>&1; then
  skip "Phase 5 (claude binary not found)"
else
  reset_home
  tokamak-ai-access configure \
    --target claude --api-key "$TON_API_KEY" --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  RESPONSE=$(zsh -c 'source ~/.zshrc && claude -p "Reply with exactly the word OK and nothing else"' 2>/dev/null) \
    || RESPONSE=""

  if echo "$RESPONSE" | grep -qi "OK"; then
    pass "LLM routing: response contains 'OK'"
  else
    fail "LLM routing: unexpected response (first 200 chars): ${RESPONSE:0:200}"
  fi
fi

# ─── Phase 5b: End-to-end LLM routing (openclaw) ────────────────────────────
section "Phase 5b — End-to-end LLM routing (openclaw)"
if [ "${WITH_OPENCLAW:-false}" != "true" ]; then
  skip "Phase 5b (--with-openclaw not set)"
elif [ -z "${TON_API_KEY:-}" ]; then
  skip "Phase 5b (TON_API_KEY not set)"
elif ! command -v openclaw >/dev/null 2>&1; then
  skip "Phase 5b (openclaw binary not found)"
else
  reset_home
  tokamak-ai-access configure \
    --target openclaw --api-key "$TON_API_KEY" --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  RESPONSE=$(openclaw infer model run --local \
    --model litellm/qwen-3.6 \
    --prompt "Reply with exactly the word OK and nothing else" 2>/dev/null) \
    || RESPONSE=""

  if echo "$RESPONSE" | grep -qi "OK"; then
    pass "openclaw LLM routing: response contains 'OK'"
  else
    fail "openclaw LLM routing: unexpected response (first 200 chars): ${RESPONSE:0:200}"
  fi
fi

# ─── Phase 5c: End-to-end LLM routing (hermes) ───────────────────────────────
section "Phase 5c — End-to-end LLM routing (hermes)"
if [ "${WITH_HERMES:-false}" != "true" ]; then
  skip "Phase 5c (--with-hermes not set)"
elif [ -z "${TON_API_KEY:-}" ]; then
  skip "Phase 5c (TON_API_KEY not set)"
elif ! command -v hermes >/dev/null 2>&1; then
  skip "Phase 5c (hermes binary not found)"
else
  reset_home
  tokamak-ai-access configure \
    --target hermes --api-key "$TON_API_KEY" --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  RESPONSE=$(hermes -z "Reply with exactly the word OK and nothing else" 2>/dev/null) \
    || RESPONSE=""

  if echo "$RESPONSE" | grep -qi "OK"; then
    pass "hermes LLM routing: response contains 'OK'"
  else
    fail "hermes LLM routing: unexpected response (first 200 chars): ${RESPONSE:0:200}"
  fi
fi

# ─── Phase 6: Actual CLI invocation (WITH_CODEX) ─────────────────────────────
section "Phase 6 — Actual CLI invocation"
if [ "${WITH_CODEX:-false}" = "true" ] && command -v codex >/dev/null 2>&1; then
  reset_home
  tokamak-ai-access configure \
    --target codex --api-key sk-live-test --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  CODEX_OUT=$(zsh -c 'source ~/.zshrc && codex --version' 2>&1) || CODEX_OUT=""
  if echo "$CODEX_OUT" | grep -qE "[0-9]+\.[0-9]+"; then
    pass "codex: invocation after configure outputs version string"
  else
    fail "codex: invocation failed or returned no version (output: ${CODEX_OUT:0:200})"
  fi
else
  skip "codex CLI invocation (--with-codex not set or codex binary not found)"
fi

if [ "${WITH_OPENCLAW:-false}" = "true" ] && command -v openclaw >/dev/null 2>&1; then
  reset_home
  tokamak-ai-access configure \
    --target openclaw --api-key sk-live-test --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  OPENCLAW_OUT=$(zsh -c 'source ~/.zshrc && openclaw --version' 2>&1) || OPENCLAW_OUT=""
  if echo "$OPENCLAW_OUT" | grep -qE "[0-9]+\.[0-9]+"; then
    pass "openclaw: invocation after configure outputs version string"
  else
    fail "openclaw: invocation failed or returned no version (output: ${OPENCLAW_OUT:0:200})"
  fi
else
  skip "openclaw CLI invocation (--with-openclaw not set or openclaw binary not found)"
fi

if [ "${WITH_HERMES:-false}" = "true" ] && command -v hermes >/dev/null 2>&1; then
  reset_home
  tokamak-ai-access configure \
    --target hermes --api-key sk-live-test --model qwen-3.6 \
    --non-interactive >/dev/null 2>&1

  HERMES_OUT=$(zsh -c 'source ~/.zshrc && hermes --version' 2>&1) || HERMES_OUT=""
  if echo "$HERMES_OUT" | grep -qE "[0-9]+\.[0-9]+"; then
    pass "hermes: invocation after configure outputs version string"
  else
    fail "hermes: invocation failed or returned no version (output: ${HERMES_OUT:0:200})"
  fi
else
  skip "hermes CLI invocation (--with-hermes not set or hermes binary not found)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Summary ──────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${GREEN}PASS${RESET}: $PASSED   ${RED}FAIL${RESET}: $FAILED   ${YELLOW}SKIP${RESET}: $SKIPPED"
echo ""

[ "$FAILED" -eq 0 ]
