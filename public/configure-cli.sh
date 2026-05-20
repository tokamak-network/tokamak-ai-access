#!/usr/bin/env bash
# =============================================================================
# TON AI Access — CLI Configurator
# =============================================================================
# 용도: LiteLLM API 키와 모델명을 받아 Claude Code / Codex CLI 환경을 자동 설정.
#
# 사용법 (대화형 — 모델 목록 자동 탐색 포함):
#   bash scripts/configure-cli.sh
#
# 사용법 (비대화형 / 에이전트 실행):
#   TON_API_KEY="sk-litellm-xxx" \
#   TON_MODEL="qwen-3.6" \
#   bash scripts/configure-cli.sh --non-interactive
#
# 사용법 (모델 목록만 출력):
#   TON_API_KEY="sk-litellm-xxx" bash scripts/configure-cli.sh --list-models
#
# 지원 대상:
#   - Claude Code  (ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL + ~/.claude/settings.json)
#   - Codex CLI    (OPENAI_API_KEY + OPENAI_BASE_URL + ~/.codex/config.toml)
#   - 쉘 프로파일  (~/.zshrc / ~/.bashrc 영구 저장, 멱등성 보장)
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
LIST_MODELS_ONLY=false

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --non-interactive) NON_INTERACTIVE=true ;;
    --list-models)     LIST_MODELS_ONLY=true ;;
    --help|-h)
      cat <<HELP
Usage:
  # 대화형 (모델 목록 자동 탐색 포함)
  bash configure-cli.sh

  # 비대화형 (에이전트/CI용)
  TON_API_KEY=<key> [TON_MODEL=<model>] bash configure-cli.sh --non-interactive

  # 사용 가능한 모델 목록만 출력
  TON_API_KEY=<key> bash configure-cli.sh --list-models

Env vars:
  TON_API_KEY   LiteLLM virtual key (required in non-interactive / list-models)
  TON_MODEL     모델명 (기본값: $DEFAULT_MODEL)
  TON_BASE_URL  LiteLLM 서버 URL (기본값: $DEFAULT_BASE_URL)
HELP
      exit 0 ;;
  esac
done

# ── 모델 자동탐색 헬퍼 ────────────────────────────────────────────────────────
# 성공 시 줄 구분된 모델 ID 목록 반환, 실패 시 빈 문자열
fetch_models() {
  local key="$1" url="$2"
  if ! command -v curl &>/dev/null || ! command -v python3 &>/dev/null; then
    return
  fi
  curl -s --max-time 8 "$url/v1/models" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" 2>/dev/null | \
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ids = [m['id'] for m in d.get('data', [])]
    if ids:
        print('\n'.join(ids))
except Exception:
    pass
" 2>/dev/null || true
}

# ── --list-models 단독 실행 ───────────────────────────────────────────────────
if [ "$LIST_MODELS_ONLY" = true ]; then
  _key="${TON_API_KEY:?'TON_API_KEY env var required for --list-models'}"
  _url="${TON_BASE_URL:-$DEFAULT_BASE_URL}"
  log_section "사용 가능한 모델 ($CYAN$_url$RESET)"
  MODELS=$(fetch_models "$_key" "$_url")
  if [ -z "$MODELS" ]; then
    log_warn "모델 목록 탐색 실패. 네트워크 또는 API 키를 확인하세요."
    echo "  기본 모델: $DEFAULT_MODEL"
  else
    echo "$MODELS" | awk '{printf "  %2d. %s\n", NR, $0}'
  fi
  exit 0
fi

# ── 입력 수집 ─────────────────────────────────────────────────────────────────
log_section "TON AI Access — CLI Configurator"

if [ "$NON_INTERACTIVE" = true ]; then
  # ── 비대화형: 환경변수에서 읽기 ──
  API_KEY="${TON_API_KEY:?'TON_API_KEY env var required in non-interactive mode'}"
  MODEL="${TON_MODEL:-$DEFAULT_MODEL}"
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"
else
  # ── 대화형: 사용자 입력 + 모델 자동탐색 ──
  echo ""
  read -rp "$(echo -e "${BOLD}LiteLLM API 키${RESET} (sk-litellm-...): ")" API_KEY
  if [ -z "$API_KEY" ]; then
    log_error "API 키를 입력해야 합니다."
    exit 1
  fi
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"

  # 모델 목록 자동탐색
  log_info "사용 가능한 모델 목록을 불러오는 중..."
  DISCOVERED=$(fetch_models "$API_KEY" "$BASE_URL")

  if [ -n "$DISCOVERED" ]; then
    echo ""
    echo -e "${BOLD}사용 가능한 모델:${RESET}"
    echo "$DISCOVERED" | awk '{printf "  %2d. %s\n", NR, $0}'
    echo ""
    read -rp "$(echo -e "${BOLD}모델 번호 또는 이름${RESET} [Enter → $DEFAULT_MODEL]: ")" MODEL_INPUT
    if [ -z "$MODEL_INPUT" ]; then
      MODEL="$DEFAULT_MODEL"
    elif echo "$MODEL_INPUT" | grep -qE '^[0-9]+$'; then
      MODEL=$(echo "$DISCOVERED" | sed -n "${MODEL_INPUT}p")
      if [ -z "$MODEL" ]; then
        log_warn "잘못된 번호. 기본값 사용: $DEFAULT_MODEL"
        MODEL="$DEFAULT_MODEL"
      fi
    else
      MODEL="$MODEL_INPUT"
    fi
  else
    log_warn "모델 목록 탐색 실패. API 키 또는 네트워크를 확인하세요."
    read -rp "$(echo -e "${BOLD}모델명${RESET} [Enter → $DEFAULT_MODEL]: ")" MODEL
    MODEL="${MODEL:-$DEFAULT_MODEL}"
  fi
fi

log_info "API 키  : ${API_KEY:0:12}…"
log_info "모델    : $MODEL"
log_info "서버 URL: $BASE_URL"

# ── 쉘 프로파일 감지 ──────────────────────────────────────────────────────────
detect_shell_profile() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "${SHELL:-bash}")" = "zsh" ]; then
    echo "$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "${SHELL:-bash}")" = "bash" ]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      echo "$HOME/.bash_profile"
    else
      echo "$HOME/.bashrc"
    fi
  else
    echo "$HOME/.profile"
  fi
}
SHELL_PROFILE=$(detect_shell_profile)

# ── 환경변수 블록 작성 (멱등성 보장) ──────────────────────────────────────────
write_env_block() {
  local profile="$1"
  local marker="# TON AI Access — auto-configured"
  local end_marker="# ///TON AI Access"

  # 기존 블록 제거 (멱등성)
  if grep -q "$marker" "$profile" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i.bak "/$marker/,/$end_marker/d" "$profile" 2>/dev/null || true
    else
      sed -i "/$marker/,/$end_marker/d" "$profile" 2>/dev/null || true
    fi
    rm -f "${profile}.bak"
    log_warn "기존 TON AI Access 설정 블록을 업데이트합니다."
  fi

  cat >> "$profile" <<EOF

$marker — $(date '+%Y-%m-%d') | model: $MODEL
export ANTHROPIC_API_KEY="$API_KEY"
export ANTHROPIC_BASE_URL="$BASE_URL"
export ANTHROPIC_MODEL="$MODEL"
export ANTHROPIC_SMALL_FAST_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
export OPENAI_API_KEY="$API_KEY"
export OPENAI_BASE_URL="$BASE_URL/v1"
$end_marker
EOF
  log_ok "$(basename "$profile") 에 환경변수 블록 추가 완료"
}

# ── 현재 세션 즉시 적용 ───────────────────────────────────────────────────────
apply_current_session() {
  export ANTHROPIC_API_KEY="$API_KEY"
  export ANTHROPIC_BASE_URL="$BASE_URL"
  export ANTHROPIC_MODEL="$MODEL"
  export ANTHROPIC_SMALL_FAST_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
  export OPENAI_API_KEY="$API_KEY"
  export OPENAI_BASE_URL="$BASE_URL/v1"
  log_ok "현재 세션에 환경변수 즉시 적용 완료"
}

# ── 1) 쉘 프로파일 설정 ───────────────────────────────────────────────────────
log_section "1. 쉘 프로파일 설정 ($SHELL_PROFILE)"
write_env_block "$SHELL_PROFILE"
apply_current_session

# ── 2) Claude Code 설정 ───────────────────────────────────────────────────────
log_section "2. Claude Code 설정"

CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"

if command -v claude &>/dev/null; then
  mkdir -p "$CLAUDE_CONFIG_DIR"

  if [ -f "$CLAUDE_SETTINGS" ]; then
    EXISTING=$(cat "$CLAUDE_SETTINGS")
  else
    EXISTING="{}"
  fi

  # Python으로 JSON 안전 병합
  python3 - <<PYEOF
import json

settings = json.loads('''$EXISTING''')
settings.setdefault("env", {})
settings["env"]["ANTHROPIC_API_KEY"] = "$API_KEY"
settings["env"]["ANTHROPIC_BASE_URL"] = "$BASE_URL"
settings["env"]["ANTHROPIC_MODEL"] = "$MODEL"
settings["env"]["ANTHROPIC_SMALL_FAST_MODEL"] = "$MODEL"
settings["env"]["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = "$MODEL"
settings["env"]["ANTHROPIC_DEFAULT_SONNET_MODEL"] = "$MODEL"
settings["env"]["ANTHROPIC_DEFAULT_OPUS_MODEL"] = "$MODEL"

with open("$CLAUDE_SETTINGS", "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\\n")
print("  ~/.claude/settings.json 업데이트 완료")
PYEOF
  log_ok "Claude Code 설정 완료 (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL + 4개 모델 별칭)"
else
  log_warn "claude CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
  log_info "Claude Code 설치: https://claude.ai/download"
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
model_provider = "tokamak"

[model_providers.tokamak]
name = "TON AI Access (LiteLLM)"
base_url = "$BASE_URL/v1"
env_key = "OPENAI_API_KEY"
TOML
  log_ok "Codex CLI 설정 완료 ($CODEX_CONFIG)"
else
  log_warn "codex CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
  log_info "Codex 설치: npm install -g @openai/codex"
fi

# ── 4) 완료 및 검증 안내 ──────────────────────────────────────────────────────
log_section "4. 완료"

echo ""
log_ok "TON AI Access 설정 완료!"
echo ""
echo -e "  ${BOLD}모델${RESET}    : $MODEL"
echo -e "  ${BOLD}Endpoint${RESET}: $BASE_URL"
echo ""
log_info "새 터미널에서도 사용하려면:"
echo -e "  ${BOLD}source $SHELL_PROFILE${RESET}"
echo ""
log_info "API 연결 테스트:"
cat <<CURLEOF
  curl "$BASE_URL/v1/chat/completions" \\
    -H "Authorization: Bearer \$OPENAI_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{"model":"$MODEL","messages":[{"role":"user","content":"hello"}],"max_tokens":10}'
CURLEOF
echo ""
log_info "사용 가능한 모델 목록 확인:"
echo -e "  ${BOLD}TON_API_KEY=\"\$OPENAI_API_KEY\" bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) --list-models${RESET}"
echo ""
