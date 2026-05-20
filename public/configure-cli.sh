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
#   TON_API_KEY="sk-litellm-xxx" TON_MODEL="qwen-3.6" \
#   bash scripts/configure-cli.sh --non-interactive
#
# 사용법 (변경 내용 미리 확인 — 실제 파일 수정 없음):
#   TON_API_KEY="sk-litellm-xxx" bash scripts/configure-cli.sh --dry-run
#
# 사용법 (특정 CLI만 설정):
#   bash scripts/configure-cli.sh --target claude    # Claude Code만
#   bash scripts/configure-cli.sh --target codex     # Codex CLI만
#   bash scripts/configure-cli.sh --target openclaw  # OpenClaw만
#   bash scripts/configure-cli.sh --target hermes    # Hermes만
#
# 사용법 (모델 목록만 출력):
#   TON_API_KEY="sk-litellm-xxx" bash scripts/configure-cli.sh --list-models
#
# 지원 대상:
#   - Claude Code  (ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL + ~/.claude/settings.json)
#   - Codex CLI    (OPENAI_API_KEY + OPENAI_BASE_URL + ~/.codex/config.toml)
#   - OpenClaw     (~/.openclaw/openclaw.json, JSON 병합)
#   - Hermes       (~/.hermes/config.yaml, YAML 덮어쓰기)
#   - 쉘 프로파일  (~/.zshrc / ~/.bashrc 영구 저장, 멱등성 보장)
# =============================================================================

set -euo pipefail

# ── 색상 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
DIM='\033[2m'

log_info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
log_ok()      { echo -e "${GREEN}[ok]${RESET}    $*"; }
log_warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
log_error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
log_section() { echo -e "\n${BOLD}── $* ──${RESET}"; }
log_dry()     { echo -e "${YELLOW}[dry-run]${RESET} $*"; }

# ── 기본값 ────────────────────────────────────────────────────────────────────
DEFAULT_BASE_URL="https://api2.ai.tokamak.network"
DEFAULT_MODEL="qwen-3.6"
NON_INTERACTIVE=false
LIST_MODELS_ONLY=false
DRY_RUN=false
TARGET=""  # claude | codex | openclaw | hermes (빈 문자열이면 대화형 선택)

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    --list-models)     LIST_MODELS_ONLY=true; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --target)
      TARGET="${2:?'--target requires an argument: claude|codex|openclaw|hermes'}"
      if [[ "$TARGET" != "claude" && "$TARGET" != "codex" && "$TARGET" != "openclaw" && "$TARGET" != "hermes" ]]; then
        log_error "--target 값은 claude, codex, openclaw, hermes 중 하나여야 합니다."
        exit 1
      fi
      shift 2 ;;
    --target=*)
      TARGET="${1#--target=}"
      if [[ "$TARGET" != "claude" && "$TARGET" != "codex" && "$TARGET" != "openclaw" && "$TARGET" != "hermes" ]]; then
        log_error "--target 값은 claude, codex, openclaw, hermes 중 하나여야 합니다."
        exit 1
      fi
      shift ;;
    --help|-h)
      cat <<HELP
Usage:
  bash configure-cli.sh [옵션]

옵션:
  --dry-run            실제 변경 없이 무엇이 바뀌는지 미리 확인 (안전 점검용)
  --target <대상>      설정 대상: claude | codex | openclaw | hermes (기본: 대화형 선택)
  --non-interactive    환경변수(TON_API_KEY, TON_MODEL)로 비대화형 실행
  --list-models        사용 가능한 모델 목록만 출력
  --help, -h           이 도움말 출력

대상 선택:
  --target 없이 실행하면 설정할 CLI를 대화형으로 선택합니다.
  --non-interactive 모드에서는 --target이 필수입니다.

환경변수:
  TON_API_KEY   LiteLLM virtual key (--non-interactive / --list-models 필수)
  TON_MODEL     모델명 (기본값: $DEFAULT_MODEL)
  TON_BASE_URL  LiteLLM 서버 URL (기본값: $DEFAULT_BASE_URL)

예시:
  # Claude Code 에이전트 안에서 안전하게 실행 (Claude 변수만 변경)
  bash configure-cli.sh --dry-run --target claude

  # 변경 내용 확인 후 적용
  TON_API_KEY=sk-xxx bash configure-cli.sh --dry-run
  TON_API_KEY=sk-xxx bash configure-cli.sh
HELP
      exit 0 ;;
    *)
      log_error "알 수 없는 인자: $1 (--help 참조)"
      exit 1 ;;
  esac
done

# ── 설정 대상 결정 (명시적 --target 또는 대화형 선택) ────────────────────────
detect_target() {
  if [ -n "$TARGET" ]; then
    echo "$TARGET"
    return
  fi

  if [ "$NON_INTERACTIVE" = true ]; then
    log_error "--non-interactive 모드에서는 --target을 반드시 지정해야 합니다."
    log_error "예: --target claude | codex | openclaw | hermes"
    exit 1
  fi

  echo "" >&2
  echo -e "${BOLD}설정할 CLI를 선택하세요:${RESET}" >&2
  echo -e "  ${CYAN}1)${RESET} Claude Code" >&2
  echo -e "  ${CYAN}2)${RESET} Codex CLI" >&2
  echo -e "  ${CYAN}3)${RESET} OpenClaw" >&2
  echo -e "  ${CYAN}4)${RESET} Hermes" >&2
  echo "" >&2

  local choice
  read -rp "$(echo -e "${BOLD}번호 입력${RESET} [1-4]: ")" choice

  case "$choice" in
    1) echo "claude" ;;
    2) echo "codex" ;;
    3) echo "openclaw" ;;
    4) echo "hermes" ;;
    *)
      log_error "잘못된 선택입니다. 1~4 중 하나를 입력하세요."
      exit 1
      ;;
  esac
}

EFFECTIVE_TARGET=$(detect_target) || exit 1

# ── 모델 자동탐색 헬퍼 ────────────────────────────────────────────────────────
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

# dry-run이면 API 키 없어도 프리뷰 가능하도록 처리
if [ "$NON_INTERACTIVE" = true ]; then
  API_KEY="${TON_API_KEY:?'TON_API_KEY env var required in non-interactive mode'}"
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"

  if [ -n "${TON_MODEL:-}" ]; then
    MODEL="$TON_MODEL"
  else
    # TON_MODEL not provided — ask interactively
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
elif [ "$DRY_RUN" = true ] && [ -z "${TON_API_KEY:-}" ]; then
  # dry-run 전용: 키 없으면 현재 값으로 프리뷰
  API_KEY="${ANTHROPIC_API_KEY:-${OPENAI_API_KEY:-<현재_설정된_키>}}"
  MODEL="${TON_MODEL:-$DEFAULT_MODEL}"
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"
  log_warn "TON_API_KEY 미제공 — 현재 환경변수 기준으로 dry-run 합니다."
else
  echo ""
  read -rp "$(echo -e "${BOLD}LiteLLM API 키${RESET} (sk-litellm-...): ")" API_KEY
  if [ -z "$API_KEY" ]; then
    log_error "API 키를 입력해야 합니다."
    exit 1
  fi
  BASE_URL="${TON_BASE_URL:-$DEFAULT_BASE_URL}"

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

echo ""
log_info "API 키  : ${API_KEY:0:12}…"
log_info "모델    : $MODEL"
log_info "서버 URL: $BASE_URL"
log_info "대상    : ${BOLD}$EFFECTIVE_TARGET${RESET}"
if [ "$DRY_RUN" = true ]; then
  log_dry "Dry-run 모드 — 파일을 실제로 수정하지 않습니다."
fi

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

# ── Dry-run 비교 헬퍼 ─────────────────────────────────────────────────────────
# 현재값과 새값을 비교해서 변경 여부 출력
show_env_diff() {
  local key="$1" new_val="$2"
  local current_val="${!key:-}"
  local masked_new masked_cur

  # API 키는 앞 12자만 표시
  if echo "$key" | grep -qi "key"; then
    masked_new="${new_val:0:12}…"
    masked_cur="${current_val:0:12}…"
  else
    masked_new="$new_val"
    masked_cur="$current_val"
  fi

  if [ -z "$current_val" ]; then
    echo -e "    ${GREEN}+${RESET} $key${DIM}: (미설정) → ${RESET}$masked_new"
  elif [ "$current_val" = "$new_val" ]; then
    echo -e "    ${DIM}= $key: $masked_cur (변경 없음)${RESET}"
  else
    echo -e "    ${YELLOW}~${RESET} $key${DIM}: $masked_cur → ${RESET}$masked_new"
  fi
}

# settings.json에서 현재 값 읽기
get_claude_env() {
  local key="$1"
  local settings="$HOME/.claude/settings.json"
  if [ -f "$settings" ] && command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
try:
    s = json.load(open('$settings'))
    print(s.get('env', {}).get('$key', ''))
except:
    pass
" 2>/dev/null || true
  fi
}

# ── 쉘 프로파일 변경 내용 프리뷰 ─────────────────────────────────────────────
preview_profile_changes() {
  local target="$1"
  echo -e "  ${BOLD}$(basename "$SHELL_PROFILE") 에 추가될 환경변수:${RESET}"

  if [[ "$target" == "claude" ]]; then
    show_env_diff "ANTHROPIC_API_KEY"               "$API_KEY"
    show_env_diff "ANTHROPIC_BASE_URL"              "$BASE_URL"
    show_env_diff "ANTHROPIC_MODEL"                 "$MODEL"
    show_env_diff "ANTHROPIC_SMALL_FAST_MODEL"      "$MODEL"
    show_env_diff "ANTHROPIC_DEFAULT_HAIKU_MODEL"   "$MODEL"
    show_env_diff "ANTHROPIC_DEFAULT_SONNET_MODEL"  "$MODEL"
    show_env_diff "ANTHROPIC_DEFAULT_OPUS_MODEL"    "$MODEL"
  fi

  if [[ "$target" == "codex" ]]; then
    show_env_diff "OPENAI_API_KEY"  "$API_KEY"
    show_env_diff "OPENAI_BASE_URL" "$BASE_URL/v1"
  fi
}

# settings.json 변경 내용 프리뷰
preview_claude_settings_changes() {
  local settings="$HOME/.claude/settings.json"
  echo -e "  ${BOLD}~/.claude/settings.json env 섹션 변경 예정:${RESET}"

  local keys=(
    "ANTHROPIC_API_KEY:$API_KEY"
    "ANTHROPIC_BASE_URL:$BASE_URL"
    "ANTHROPIC_MODEL:$MODEL"
    "ANTHROPIC_SMALL_FAST_MODEL:$MODEL"
    "ANTHROPIC_DEFAULT_HAIKU_MODEL:$MODEL"
    "ANTHROPIC_DEFAULT_SONNET_MODEL:$MODEL"
    "ANTHROPIC_DEFAULT_OPUS_MODEL:$MODEL"
  )

  for entry in "${keys[@]}"; do
    local key="${entry%%:*}"
    local new_val="${entry#*:}"
    local current_val
    current_val=$(get_claude_env "$key")
    local masked_new="${new_val:0:12}"
    local masked_cur="${current_val:0:12}"
    echo "$key" | grep -qi "key" && masked_new="${new_val:0:12}…" && masked_cur="${current_val:0:12}…"

    if [ -z "$current_val" ]; then
      echo -e "    ${GREEN}+${RESET} $key: (미설정) → $masked_new"
    elif [ "$current_val" = "$new_val" ]; then
      echo -e "    ${DIM}= $key: $masked_cur (변경 없음)${RESET}"
    else
      echo -e "    ${YELLOW}~${RESET} $key: $masked_cur → $masked_new"
    fi
  done
}

# openclaw config 변경 내용 프리뷰
preview_openclaw_config_changes() {
  local config="$HOME/.openclaw/openclaw.json"
  echo -e "  ${BOLD}~/.openclaw/openclaw.json 변경 예정:${RESET}"

  local cur_base="" cur_key="" cur_default=""
  if [ -f "$config" ] && command -v python3 &>/dev/null; then
    cur_base=$(python3 -c "
import json
try:
    d = json.load(open('$config'))
    print(d.get('models',{}).get('providers',{}).get('litellm',{}).get('baseUrl',''))
except: pass
" 2>/dev/null || true)
    cur_key=$(python3 -c "
import json
try:
    d = json.load(open('$config'))
    print(d.get('models',{}).get('providers',{}).get('litellm',{}).get('apiKey',''))
except: pass
" 2>/dev/null || true)
    cur_default=$(python3 -c "
import json
try:
    d = json.load(open('$config'))
    print(d.get('models',{}).get('default',''))
except: pass
" 2>/dev/null || true)
  fi

  local new_default="litellm/$MODEL"
  local masked_new_key="${API_KEY:0:12}…"
  local masked_cur_key="${cur_key:0:12}…"

  if [ -z "$cur_base" ]; then
    echo -e "    ${GREEN}+${RESET} models.providers.litellm.baseUrl: (미설정) → $BASE_URL/v1"
  elif [ "$cur_base" = "$BASE_URL/v1" ]; then
    echo -e "    ${DIM}= models.providers.litellm.baseUrl: $cur_base (변경 없음)${RESET}"
  else
    echo -e "    ${YELLOW}~${RESET} models.providers.litellm.baseUrl: $cur_base → $BASE_URL/v1"
  fi

  if [ -z "$cur_key" ]; then
    echo -e "    ${GREEN}+${RESET} models.providers.litellm.apiKey: (미설정) → $masked_new_key"
  elif [ "$cur_key" = "$API_KEY" ]; then
    echo -e "    ${DIM}= models.providers.litellm.apiKey: $masked_cur_key (변경 없음)${RESET}"
  else
    echo -e "    ${YELLOW}~${RESET} models.providers.litellm.apiKey: $masked_cur_key → $masked_new_key"
  fi

  if [ -z "$cur_default" ]; then
    echo -e "    ${GREEN}+${RESET} models.default: (미설정) → $new_default"
  elif [ "$cur_default" = "$new_default" ]; then
    echo -e "    ${DIM}= models.default: $cur_default (변경 없음)${RESET}"
  else
    echo -e "    ${YELLOW}~${RESET} models.default: $cur_default → $new_default"
  fi
}

# hermes config 변경 내용 프리뷰
preview_hermes_config_changes() {
  local config="$HOME/.hermes/config.yaml"
  echo -e "  ${BOLD}~/.hermes/config.yaml 변경 예정:${RESET}"
  if [ -f "$config" ]; then
    echo -e "    ${YELLOW}(기존 파일을 덮어씁니다)${RESET}"
    echo -e "    ${DIM}현재 내용:${RESET}"
    sed 's/^/      /' "$config" | head -10
    echo ""
  fi
  cat <<PREVIEW
    새 내용:
      model:
        default: $MODEL
        provider: custom
        base_url: $BASE_URL/v1
        api_key:  ${API_KEY:0:12}…
        api_mode: chat_completions
PREVIEW
}

# codex config 변경 내용 프리뷰
preview_codex_config_changes() {
  local config="$HOME/.codex/config.toml"
  echo -e "  ${BOLD}~/.codex/config.toml 변경 예정:${RESET}"
  if [ -f "$config" ]; then
    echo -e "    ${YELLOW}(기존 파일을 덮어씁니다)${RESET}"
    echo -e "    ${DIM}현재 내용:${RESET}"
    sed 's/^/      /' "$config" | head -10
    echo ""
  fi
  cat <<PREVIEW
    새 내용:
      model = "$MODEL"
      model_provider = "tokamak"
      [model_providers.tokamak]
      base_url = "$BASE_URL/v1"
PREVIEW
}

# ── 쉘 프로파일 블록 작성 (멱등성 보장) ───────────────────────────────────────
write_env_block() {
  local profile="$1" target="$2"
  local marker="# TON AI Access — auto-configured"
  local end_marker="# ///TON AI Access"

  if grep -q "$marker" "$profile" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i.bak "/$marker/,/$end_marker/d" "$profile" 2>/dev/null || true
    else
      sed -i "/$marker/,/$end_marker/d" "$profile" 2>/dev/null || true
    fi
    rm -f "${profile}.bak"
    log_warn "기존 TON AI Access 설정 블록을 업데이트합니다."
  fi

  {
    echo ""
    echo "$marker — $(date '+%Y-%m-%d') | target: $target | model: $MODEL"
    if [[ "$target" == "claude" ]]; then
      echo "export ANTHROPIC_API_KEY=\"$API_KEY\""
      echo "export ANTHROPIC_BASE_URL=\"$BASE_URL\""
      echo "export ANTHROPIC_MODEL=\"$MODEL\""
      echo "export ANTHROPIC_SMALL_FAST_MODEL=\"$MODEL\""
      echo "export ANTHROPIC_DEFAULT_HAIKU_MODEL=\"$MODEL\""
      echo "export ANTHROPIC_DEFAULT_SONNET_MODEL=\"$MODEL\""
      echo "export ANTHROPIC_DEFAULT_OPUS_MODEL=\"$MODEL\""
    fi
    if [[ "$target" == "codex" ]]; then
      echo "export OPENAI_API_KEY=\"$API_KEY\""
      echo "export OPENAI_BASE_URL=\"$BASE_URL/v1\""
    fi
    echo "$end_marker"
  } >> "$profile"

  log_ok "$(basename "$profile") 에 환경변수 블록 추가 완료 (target: $target)"
}

# ── 현재 세션 즉시 적용 ───────────────────────────────────────────────────────
apply_current_session() {
  local target="$1"
  if [[ "$target" == "claude" ]]; then
    export ANTHROPIC_API_KEY="$API_KEY"
    export ANTHROPIC_BASE_URL="$BASE_URL"
    export ANTHROPIC_MODEL="$MODEL"
    export ANTHROPIC_SMALL_FAST_MODEL="$MODEL"
    export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
    export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
    export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
  fi
  if [[ "$target" == "codex" ]]; then
    export OPENAI_API_KEY="$API_KEY"
    export OPENAI_BASE_URL="$BASE_URL/v1"
  fi
  log_ok "현재 세션에 환경변수 즉시 적용 완료 (target: $target)"
}

# ── Claude Code 설정 함수 ──────────────────────────────────────────────────────
configure_claude() {
  local dry="$1"
  log_section "Claude Code 설정"

  local CLAUDE_CONFIG_DIR="$HOME/.claude"
  local CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"

  if ! command -v claude &>/dev/null; then
    log_warn "claude CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
    log_info "Claude Code 설치: https://claude.ai/download"
    return
  fi

  if [ "$dry" = true ]; then
    log_dry "~/.claude/settings.json 수정 예정:"
    preview_claude_settings_changes
    return
  fi

  mkdir -p "$CLAUDE_CONFIG_DIR"
  local EXISTING="{}"
  [ -f "$CLAUDE_SETTINGS" ] && EXISTING=$(cat "$CLAUDE_SETTINGS")

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
}

# ── Codex CLI 설정 함수 ────────────────────────────────────────────────────────
configure_codex() {
  local dry="$1"
  log_section "Codex CLI 설정"

  local CODEX_CONFIG_DIR="$HOME/.codex"
  local CODEX_CONFIG="$CODEX_CONFIG_DIR/config.toml"

  if ! command -v codex &>/dev/null; then
    log_warn "codex CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
    log_info "Codex 설치: npm install -g @openai/codex"
    return
  fi

  if [ "$dry" = true ]; then
    log_dry "~/.codex/config.toml 수정 예정:"
    preview_codex_config_changes
    return
  fi

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
}

# ── OpenClaw 설정 함수 ────────────────────────────────────────────────────────
configure_openclaw() {
  local dry="$1"
  log_section "OpenClaw 설정"

  local OPENCLAW_CONFIG_DIR="$HOME/.openclaw"
  local OPENCLAW_CONFIG="$OPENCLAW_CONFIG_DIR/openclaw.json"

  if ! command -v openclaw &>/dev/null; then
    log_warn "openclaw CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
    log_info "OpenClaw 설치: https://docs.openclaw.ai/"
    return
  fi

  if [ "$dry" = true ]; then
    log_dry "~/.openclaw/openclaw.json 수정 예정:"
    preview_openclaw_config_changes
    return
  fi

  mkdir -p "$OPENCLAW_CONFIG_DIR"
  local EXISTING="{}"
  [ -f "$OPENCLAW_CONFIG" ] && EXISTING=$(cat "$OPENCLAW_CONFIG")

  python3 - <<PYEOF
import json

config = json.loads('''$EXISTING''')
config.setdefault("models", {})
config["models"].setdefault("providers", {})
config["models"]["providers"]["litellm"] = {
    "baseUrl": "$BASE_URL/v1",
    "apiKey":  "$API_KEY",
    "api":     "openai-completions"
}
config["models"]["default"] = "litellm/$MODEL"

with open("$OPENCLAW_CONFIG", "w") as f:
    json.dump(config, f, indent=2)
    f.write("\\n")
print("  ~/.openclaw/openclaw.json 업데이트 완료")
PYEOF
  log_ok "OpenClaw 설정 완료 ($OPENCLAW_CONFIG)"
}

# ── Hermes 설정 함수 ──────────────────────────────────────────────────────────
configure_hermes() {
  local dry="$1"
  log_section "Hermes 설정"

  local HERMES_CONFIG_DIR="$HOME/.hermes"
  local HERMES_CONFIG="$HERMES_CONFIG_DIR/config.yaml"

  if ! command -v hermes &>/dev/null; then
    log_warn "hermes CLI를 찾을 수 없습니다. 설치 후 쉘 재시작 시 자동 적용됩니다."
    return
  fi

  if [ "$dry" = true ]; then
    log_dry "~/.hermes/config.yaml 수정 예정:"
    preview_hermes_config_changes
    return
  fi

  mkdir -p "$HERMES_CONFIG_DIR"
  cat > "$HERMES_CONFIG" <<YAML
# TON AI Access — auto-configured $(date +%Y-%m-%d)
model:
  default: $MODEL
  provider: custom
  base_url: $BASE_URL/v1
  api_key: $API_KEY
  api_mode: chat_completions
YAML
  log_ok "Hermes 설정 완료 ($HERMES_CONFIG)"
}

# ═════════════════════════════════════════════════════════════════════════════
# 메인 실행 흐름
# ═════════════════════════════════════════════════════════════════════════════

# ── 1) 쉘 프로파일 설정 ───────────────────────────────────────────────────────
log_section "1. 쉘 프로파일 설정 ($SHELL_PROFILE)"

if [ "$DRY_RUN" = true ]; then
  log_dry "$SHELL_PROFILE 수정 예정:"
  preview_profile_changes "$EFFECTIVE_TARGET"
else
  write_env_block "$SHELL_PROFILE" "$EFFECTIVE_TARGET"
  apply_current_session "$EFFECTIVE_TARGET"
fi

# ── 2) Claude Code 설정 ───────────────────────────────────────────────────────
if [[ "$EFFECTIVE_TARGET" == "claude" ]]; then
  configure_claude "$DRY_RUN"
fi

# ── 3) Codex CLI 설정 ─────────────────────────────────────────────────────────
if [[ "$EFFECTIVE_TARGET" == "codex" ]]; then
  configure_codex "$DRY_RUN"
fi

# ── 4) OpenClaw 설정 ──────────────────────────────────────────────────────────
if [[ "$EFFECTIVE_TARGET" == "openclaw" ]]; then
  configure_openclaw "$DRY_RUN"
fi

# ── 5) Hermes 설정 ────────────────────────────────────────────────────────────
if [[ "$EFFECTIVE_TARGET" == "hermes" ]]; then
  configure_hermes "$DRY_RUN"
fi

# ── 6) 완료 및 안내 ───────────────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  log_section "Dry-run 완료 — 아무것도 변경되지 않았습니다"
  echo ""
  echo -e "  ${BOLD}실제 적용하려면:${RESET}"
  # dry-run 실행 시 사용했던 명령에서 --dry-run만 제거한 형태 안내
  if [ "$NON_INTERACTIVE" = true ]; then
    echo -e "  ${CYAN}TON_API_KEY=\"\$TON_API_KEY\" TON_MODEL=\"$MODEL\" \\"
    echo -e "  bash scripts/configure-cli.sh --non-interactive --target $EFFECTIVE_TARGET${RESET}"
  else
    echo -e "  ${CYAN}bash scripts/configure-cli.sh --target $EFFECTIVE_TARGET${RESET}"
  fi
  echo ""
  echo -e "  ${YELLOW}주의:${RESET} Claude Code 에이전트 안에서 실행하면 현재 세션의"
  echo -e "  환경변수가 바뀌어 에이전트가 다른 모델에 연결될 수 있습니다."
  echo -e "  ${BOLD}새 터미널에서 실행하거나 에이전트 세션 종료 후 적용하세요.${RESET}"
  echo ""
  exit 0
fi

log_section "6. 완료"
echo ""
log_ok "TON AI Access 설정 완료! (target: $EFFECTIVE_TARGET)"
echo ""
echo -e "  ${BOLD}모델${RESET}    : $MODEL"
echo -e "  ${BOLD}Endpoint${RESET}: $BASE_URL"
echo -e "  ${BOLD}대상${RESET}    : $EFFECTIVE_TARGET"
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
echo -e "  ${BOLD}TON_API_KEY=\"\$OPENAI_API_KEY\" bash scripts/configure-cli.sh --list-models${RESET}"
echo ""
if [[ "$EFFECTIVE_TARGET" == "openclaw" ]]; then
  log_warn "OpenClaw gateway 재시작 (provider/URL/key 변경 시 필요):"
  echo -e "  ${BOLD}openclaw gateway restart --safe${RESET}"
  echo ""
  log_info "OpenClaw 상태 및 연결 확인:"
  echo -e "  ${BOLD}openclaw gateway status${RESET}"
  echo -e "  ${BOLD}openclaw gateway health${RESET}"
  echo ""
fi
if [[ "$EFFECTIVE_TARGET" == "hermes" ]]; then
  log_warn "Hermes gateway 재시작 필요 (model.* 변경은 재시작 후 반영됩니다):"
  echo -e "  ${BOLD}hermes gateway restart${RESET}"
  echo ""
  log_info "Hermes 상태 확인:"
  echo -e "  ${BOLD}hermes gateway status${RESET}"
  echo -e "  ${BOLD}curl http://localhost:8642/health${RESET}"
  echo ""
fi
