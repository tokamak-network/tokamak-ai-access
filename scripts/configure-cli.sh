#!/usr/bin/env bash
# =============================================================================
# TON AI Access — CLI Configurator
# =============================================================================
# 용도: LiteLLM API 키와 모델명을 받아 Claude Code / Codex CLI 환경을 자동 설정.
#
# 사용법 (대화형):
#   bash scripts/configure-cli.sh
#
# 사용법 (비대화형 / 에이전트 실행):
#   TON_API_KEY="sk-litellm-xxx" \
#   TON_MODEL="qwen-3.6" \
#   TON_BASE_URL="https://api2.ai.tokamak.network" \
#   bash scripts/configure-cli.sh --non-interactive
#
# 지원 대상:
#   - Claude Code  (ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL)
#   - Codex CLI    (OPENAI_API_KEY + OPENAI_BASE_URL)
#   - 쉘 프로파일  (~/.zshrc 또는 ~/.bashrc 영구 저장)
# =============================================================================

set -euo pipefail

# ── 색상 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log_info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
log_ok()      { echo -e "${GREEN}[ok]${RESET}    $*"; }
log_warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
log_error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
log_section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── 기본값 ────────────────────────────────────────────────────────────────────
DEFAULT_BASE_URL="https://api2.ai.tokamak.network"
DEFAULT_MODEL="qwen-3.6"
NON_INTERACTIVE=false

# 인자 파싱
for arg in "$@"; do
  case $arg in
    --non-interactive) NON_INTERACTIVE=true ;;
    --help|-h)
      echo "Usage: TON_API_KEY=<key> TON_MODEL=<model> bash $0 [--non-interactive]"
      exit 0 ;;
  esac
done

# ── 입력 수집 ─────────────────────────────────────────────────────────────────
log_section "TON AI Access — CLI Configurator"

if [ "$NON_INTERACTIVE" = true ]; then
  API_KEY="${TON_API_KEY:?'TON_API_KEY env var required in non-interactive mode'}"
  MODEL="${TON_MODEL:-$DEFAULT_MODEL}"
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"
else
  echo ""
  read -rp "$(echo -e "${BOLD}LiteLLM API 키${RESET} (sk-litellm-...): ")" API_KEY
  if [ -z "$API_KEY" ]; then
    log_error "API 키를 입력해야 합니다."
    exit 1
  fi
  read -rp "$(echo -e "${BOLD}모델명${RESET} [기본값: $DEFAULT_MODEL]: ")" MODEL
  MODEL="${MODEL:-$DEFAULT_MODEL}"
  read -rp "$(echo -e "${BOLD}LiteLLM 서버 URL${RESET} [기본값: $DEFAULT_BASE_URL]: ")" BASE_URL
  BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
fi

log_info "API 키  : ${API_KEY:0:12}…"
log_info "모델    : $MODEL"
log_info "서버 URL: $BASE_URL"

# ── 쉘 프로파일 감지 ──────────────────────────────────────────────────────────
detect_shell_profile() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "${SHELL:-}")" = "zsh" ]; then
    echo "$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "${SHELL:-}")" = "bash" ]; then
    echo "$HOME/.bashrc"
  else
    echo "$HOME/.profile"
  fi
}
SHELL_PROFILE=$(detect_shell_profile)

# ── 환경변수 블록 작성 헬퍼 ───────────────────────────────────────────────────
write_env_block() {
  local profile="$1"
  local marker="# TON AI Access — auto-configured"

  # 기존 블록 제거 (idempotent)
  if grep -q "$marker" "$profile" 2>/dev/null; then
    # macOS (BSD sed) 와 GNU sed 모두 지원
    sed -i.bak "/$marker/,/# \\/\\/\\/TON AI Access/d" "$profile" 2>/dev/null || true
    rm -f "${profile}.bak"
    log_warn "기존 TON AI Access 설정 블록을 덮어씁니다."
  fi

  cat >> "$profile" <<EOF

$marker
export ANTHROPIC_API_KEY="$API_KEY"
export ANTHROPIC_BASE_URL="$BASE_URL"
export OPENAI_API_KEY="$API_KEY"
export OPENAI_BASE_URL="$BASE_URL"
export TON_AI_MODEL="$MODEL"
# ///TON AI Access
EOF
  log_ok "$profile 에 환경변수 블록 추가 완료"
}

# ── 1) 쉘 프로파일 설정 ───────────────────────────────────────────────────────
log_section "1. 쉘 프로파일 설정 ($SHELL_PROFILE)"
write_env_block "$SHELL_PROFILE"

# ── 2) Claude Code 설정 ───────────────────────────────────────────────────────
log_section "2. Claude Code 설정"

CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"

if command -v claude &>/dev/null; then
  mkdir -p "$CLAUDE_CONFIG_DIR"

  # 기존 settings.json 읽기 (없으면 빈 객체)
  if [ -f "$CLAUDE_SETTINGS" ]; then
    EXISTING=$(cat "$CLAUDE_SETTINGS")
  else
    EXISTING="{}"
  fi

  # env 블록 주입 (Python의 json 모듈로 안전하게 병합)
  python3 - <<PYEOF
import json, sys

settings = json.loads('''$EXISTING''')
settings.setdefault("env", {})
settings["env"]["ANTHROPIC_API_KEY"] = "$API_KEY"
settings["env"]["ANTHROPIC_BASE_URL"] = "$BASE_URL"

with open("$CLAUDE_SETTINGS", "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\\n")
print("  ~/.claude/settings.json 업데이트 완료")
PYEOF
  log_ok "Claude Code 설정 완료 (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL)"
else
  log_warn "claude 명령어를 찾을 수 없습니다. Claude Code가 설치되지 않았거나 PATH에 없습니다."
  log_info "설치: https://claude.ai/download → CLI 탭"
  log_info "설치 후 쉘을 재시작하면 프로파일에서 자동 적용됩니다."
fi

# ── 3) Codex CLI 설정 ─────────────────────────────────────────────────────────
log_section "3. Codex CLI 설정"

CODEX_CONFIG_DIR="$HOME/.codex"
CODEX_CONFIG="$CODEX_CONFIG_DIR/config.toml"

if command -v codex &>/dev/null; then
  mkdir -p "$CODEX_CONFIG_DIR"

  cat > "$CODEX_CONFIG" <<TOML
# TON AI Access — auto-configured $(date +%Y-%m-%d)
model = "$MODEL"

[provider.openai]
api_key  = "$API_KEY"
base_url = "$BASE_URL"
TOML
  log_ok "Codex CLI 설정 완료 ($CODEX_CONFIG)"
else
  log_warn "codex 명령어를 찾을 수 없습니다. Codex CLI가 설치되지 않았거나 PATH에 없습니다."
  log_info "설치: npm install -g @openai/codex"
  log_info "설치 후 쉘을 재시작하면 프로파일에서 자동 적용됩니다."
fi

# ── 4) 검증 ───────────────────────────────────────────────────────────────────
log_section "4. 검증"

log_info "현재 세션에 환경변수를 즉시 적용하려면:"
echo ""
echo -e "  ${BOLD}source $SHELL_PROFILE${RESET}"
echo ""
log_info "설정이 올바른지 확인:"
echo ""
echo -e "  ${BOLD}# Claude Code${RESET}"
echo "  claude --version"
echo "  echo \$ANTHROPIC_BASE_URL   # → $BASE_URL"
echo ""
echo -e "  ${BOLD}# Codex CLI${RESET}"
echo "  codex --version"
echo "  echo \$OPENAI_BASE_URL      # → $BASE_URL"
echo ""
log_info "API 연결 테스트 (curl):"
echo ""
cat <<CURLEOF
  curl "$BASE_URL/v1/chat/completions" \\
    -H "Authorization: Bearer $API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{"model":"$MODEL","messages":[{"role":"user","content":"hello"}]}'
CURLEOF
echo ""
log_ok "설정 완료. 'source $SHELL_PROFILE' 실행 후 AI CLI를 사용하세요."
