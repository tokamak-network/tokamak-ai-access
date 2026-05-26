# TON AI Access — Agent Install Guide

> **이 문서의 용도**: Claude Code 또는 Codex 에이전트가 읽고, 사용자에게 묻거나 직접 실행하여
> LiteLLM API 키와 모델 설정을 완료할 수 있도록 작성된 구조화 가이드.
>
> **빠른 사용**: [§ 대화문 형식 설치 프롬프트](#대화문-형식-설치-프롬프트) 섹션의 내용을  
> Claude Code 또는 Codex 채팅창에 그대로 붙여넣으면 됩니다.

---

## 대화문 형식 설치 프롬프트

> **사용자 안내**: 아래 회색 블록 전체를 Claude Code 또는 Codex 채팅창에 붙여넣으세요.  
> AI 에이전트가 API 키 입력 → 모델 탐색 → 환경 설정 → 검증까지 자동으로 수행합니다.  
> *(대시보드에서 [Agent Setup 복사] 버튼을 클릭하면 API 키가 자동으로 채워진 버전이 복사됩니다.)*

---

```
Please set up TON AI Access on this machine.

Step 0 — [HUMAN STEP, do before running]
  Replace [YOUR_API_KEY] in the commands below with the key from the dashboard.

Step 1 — Preview the changes first (no files are modified):

  npx @tokamak-network/ai-access-cli configure \
    --target <claude|codex> --api-key "[YOUR_API_KEY]" --dry-run

  Choose exactly one --target:
    --target claude   (if you are running Claude Code right now)
    --target codex    (if you are running Codex CLI right now)

  Fallback (if Node.js is not available):
    TON_API_KEY="[YOUR_API_KEY]" \
    bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) \
      --non-interactive --target <claude|codex> --dry-run

Step 2 — If the preview looks correct, apply it (same command, remove --dry-run):

  npx @tokamak-network/ai-access-cli configure \
    --target <claude|codex> --api-key "[YOUR_API_KEY]"

Step 3 — Verify by reading the config files
  (do NOT echo env vars — they only appear after shell reload):

  [Claude Code]
    cat ~/.claude/settings.json
    # → should contain an "env" block with ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL

  [Codex CLI]
    cat ~/.codex/config.toml
    # → should show model = "<MODEL>" and a [model_providers.tokamak] block

Step 4 — [HUMAN STEP, do AFTER this session ends]
  Restart your shell (open a new terminal) and relaunch Claude Code / Codex.
```

---
>
> **에이전트 실행 원칙**
> - 각 Step은 독립적으로 실행 가능하다.
> - `VERIFY` 블록의 명령을 실행해 성공 여부를 확인한 후 다음 Step으로 진행한다.
> - 사용자에게 직접 물어야 하는 값은 `INPUT_REQUIRED` 태그로 표시했다.
> - 이미 설정된 값은 덮어쓰기 전에 사용자에게 확인한다.

---

## 전제 조건

| 항목 | 확인 명령 | 기대값 |
|------|-----------|--------|
| Bash 또는 Zsh 쉘 | `echo $SHELL` | `/bin/bash` 또는 `/bin/zsh` |
| Python 3.10+ (Claude Code 설정용) | `python3 --version` | `Python 3.10.x` 이상 |
| curl | `curl --version` | 임의 버전 |

---

## Step 0. 필요한 값 수집

다음 두 값을 사용자로부터 받거나, 웹 대시보드(TON AI Access)에서 발급받는다.

```
INPUT_REQUIRED: API_KEY   → LiteLLM 가상 키 (예: sk-litellm-xxxxxxxxxxxxxxxx)
INPUT_REQUIRED: MODEL     → 사용할 모델명  (기본값: qwen-3.6)
FIXED:          BASE_URL  → https://api2.ai.tokamak.network
```

> **에이전트 행동**: 사용자에게 API 키와 모델명을 묻는다. 모델명 미입력 시 `qwen-3.6` 사용.

---

## Step 1. 자동 설정 스크립트 실행 (권장)

아래 명령 하나로 Step 2–4를 모두 수행한다.

```bash
# 1) 미리보기 — 실제 파일 변경 없음
npx @tokamak-network/ai-access-cli configure \
  --non-interactive --target <claude|codex> --api-key "<API_KEY>" --dry-run

# 2) 미리보기 확인 후 적용 (--dry-run 제거)
npx @tokamak-network/ai-access-cli configure \
  --non-interactive --target <claude|codex> --api-key "<API_KEY>"
```

> `--target`에는 현재 실행 중인 CLI를 지정합니다: `claude` 또는 `codex`.  
> Node.js가 없는 경우 fallback: `bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) --non-interactive --target <claude|codex>`.

### VERIFY (Step 1)
```bash
grep "TON AI Access" ~/.zshrc || grep "TON AI Access" ~/.bashrc
# 기대 출력: # TON AI Access — auto-configured 블록이 존재
```

---

## Step 2. 쉘 프로파일 수동 설정 (스크립트 대체)

Step 1을 건너뛴 경우 아래 블록을 쉘 프로파일에 추가한다.

```bash
# 프로파일 파일 결정
PROFILE_FILE="$HOME/.zshrc"   # zsh 사용자
# PROFILE_FILE="$HOME/.bashrc" # bash 사용자

cat >> "$PROFILE_FILE" <<'EOF'
# TON AI Access — auto-configured
export ANTHROPIC_API_KEY="<API_KEY>"
export ANTHROPIC_BASE_URL="https://api2.ai.tokamak.network"
export OPENAI_API_KEY="<API_KEY>"
export OPENAI_BASE_URL="https://api2.ai.tokamak.network"
export TON_AI_MODEL="<MODEL>"
# ///TON AI Access
EOF

source "$PROFILE_FILE"
```

### VERIFY (Step 2)
```bash
# env vars는 새 셸에서만 보임 — 파일로 검증
grep "TON AI Access" ~/.zshrc || grep "TON AI Access" ~/.bashrc
# 기대 출력: # TON AI Access — auto-configured 블록이 존재
```

---

## Step 3. Claude Code 설정

### 3-A. `~/.claude/settings.json` 업데이트

```bash
python3 - <<'PYEOF'
import json, os, pathlib

config_dir = pathlib.Path.home() / ".claude"
config_dir.mkdir(exist_ok=True)
settings_path = config_dir / "settings.json"

settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
settings.setdefault("env", {})
settings["env"]["ANTHROPIC_API_KEY"] = os.environ["ANTHROPIC_API_KEY"]
settings["env"]["ANTHROPIC_BASE_URL"] = os.environ["ANTHROPIC_BASE_URL"]

settings_path.write_text(json.dumps(settings, indent=2) + "\n")
print("✓ ~/.claude/settings.json 업데이트 완료")
PYEOF
```

### 3-B. 모델 별칭 설정 (선택)

Claude Code에서 `qwen-3.6`을 기본 모델로 사용하려면:

```bash
# Claude Code가 지원하는 경우 --model 플래그로 지정
claude --model "<MODEL>" "안녕"
```

> **참고**: Claude Code는 현재 Anthropic 모델을 기본으로 하지만,
> `ANTHROPIC_BASE_URL`을 LiteLLM 프록시로 설정하면 LiteLLM이 지원하는
> 모든 모델을 라우팅할 수 있다. LiteLLM 서버에서 `qwen-3.6` alias가
> 설정되어 있어야 한다.

### VERIFY (Step 3)
```bash
# settings.json에 키가 기록됐는지 확인
python3 -c "
import json, pathlib
s = json.loads((pathlib.Path.home()/'.claude/settings.json').read_text())
assert s['env'].get('ANTHROPIC_BASE_URL'), 'BASE_URL 없음'
print('✓ Claude Code 설정 정상:', s['env']['ANTHROPIC_BASE_URL'])
"
```

---

## Step 4. Codex CLI 설정

### 4-A. 설치 확인 및 설치

```bash
# 설치 여부 확인
command -v codex && codex --version || echo "Codex CLI 미설치"

# 미설치 시 설치
npm install -g @openai/codex
```

### 4-B. `~/.codex/config.toml` 작성

```bash
mkdir -p ~/.codex
cat > ~/.codex/config.toml <<TOML
# TON AI Access — auto-configured
model = "<MODEL>"

[model_providers.tokamak]
name         = "TON AI Access"
api_key      = "<API_KEY>"
base_url     = "https://api2.ai.tokamak.network/v1"
wire_api     = "openai"
TOML
```

### VERIFY (Step 4)
```bash
# config 파일 내용 확인
cat ~/.codex/config.toml | grep base_url
# 기대 출력: base_url = "https://api2.ai.tokamak.network"
```

---

## Step 5. API 연결 테스트 (최종 검증)

### 5-A. curl 직접 호출

```bash
curl "https://api2.ai.tokamak.network/v1/chat/completions" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$TON_AI_MODEL"'",
    "messages": [{"role": "user", "content": "respond with: ok"}],
    "max_tokens": 10
  }' | python3 -m json.tool
```

**기대 응답**:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "ok"
      }
    }
  ]
}
```

### 5-B. Claude Code 통해 호출

```bash
# 새 터미널 또는 source 후 실행
claude "respond with: ok"
```

### 5-C. Codex CLI 통해 호출

```bash
codex "respond with: ok"
```

### VERIFY (Step 5)
- curl 응답의 `choices[0].message.content` 가 비어있지 않으면 성공.
- HTTP 401 → API 키 오류. 대시보드에서 키 재발급 후 Step 0부터 재실행.
- HTTP 404 → BASE_URL 또는 모델명 오류. Step 2 재확인.

---

## 오류 대응

| 증상 | 원인 | 해결 |
|------|------|------|
| `401 Unauthorized` | API 키 만료 또는 오타 | 대시보드에서 키 재발급 → `rotate` |
| `404 model not found` | 모델명 오타 | `qwen-3.6` 정확히 입력 |
| `curl: command not found` | curl 미설치 | `brew install curl` 또는 `apt install curl` |
| `python3: command not found` | Python 미설치 | `brew install python3` |
| `claude: command not found` | Claude Code 미설치 | https://claude.ai/download |
| `codex: command not found` | Codex CLI 미설치 | `npm install -g @openai/codex` |
| 환경변수가 에이전트 세션 내에서 안 보임 | Bash 툴 호출마다 새 subprocess — env 비휘발 | **[HUMAN STEP]** 세션 종료 후 쉘을 재시작하세요 (새 터미널 열기) |
| 환경변수가 새 터미널에서 사라짐 | 쉘 재시작 안 함 | **[HUMAN STEP]** 쉘을 재시작하세요 (새 터미널 열기) |

---

## 설정 초기화 (언인스톨)

```bash
# CLI로 원복 (권장) — 쉘 프로파일 + 설정 파일 모두 정리
npx @tokamak-network/ai-access-cli revert

# 특정 대상만 원복
npx @tokamak-network/ai-access-cli revert --target claude
npx @tokamak-network/ai-access-cli revert --target codex

# 원복 완료 후 쉘을 재시작하세요 (새 터미널 열기).
```
