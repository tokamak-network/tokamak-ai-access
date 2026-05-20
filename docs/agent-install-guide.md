# TON AI Access — Agent Install Guide

> **이 문서의 용도**: Claude Code 또는 Codex 에이전트가 읽고, 사용자에게 묻거나 직접 실행하여
> LiteLLM API 키와 모델 설정을 완료할 수 있도록 작성된 구조화 가이드.
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
# 저장소 클론 없이 원격 실행
TON_API_KEY="<API_KEY>" \
TON_MODEL="<MODEL>" \
TON_BASE_URL="https://api2.ai.tokamak.network" \
bash <(curl -fsSL https://<DEPLOYED_URL>/configure-cli.sh) --non-interactive
```

> 저장소가 이미 로컬에 있는 경우:
> ```bash
> TON_API_KEY="<API_KEY>" TON_MODEL="<MODEL>" \
>   bash scripts/configure-cli.sh --non-interactive
> ```

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
echo $ANTHROPIC_BASE_URL
# 기대 출력: https://api2.ai.tokamak.network

echo $OPENAI_BASE_URL
# 기대 출력: https://api2.ai.tokamak.network
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

[provider.openai]
api_key  = "<API_KEY>"
base_url = "https://api2.ai.tokamak.network"
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
| 환경변수가 새 터미널에서 사라짐 | `source` 안 함 | `source ~/.zshrc` 또는 터미널 재시작 |

---

## 설정 초기화 (언인스톨)

```bash
# 쉘 프로파일에서 TON AI Access 블록 제거
sed -i.bak '/# TON AI Access — auto-configured/,/# \/\/\/TON AI Access/d' ~/.zshrc
sed -i.bak '/# TON AI Access — auto-configured/,/# \/\/\/TON AI Access/d' ~/.bashrc

# Claude Code 설정에서 제거
python3 - <<'PYEOF'
import json, pathlib
p = pathlib.Path.home() / ".claude/settings.json"
if p.exists():
    s = json.loads(p.read_text())
    s.get("env", {}).pop("ANTHROPIC_API_KEY", None)
    s.get("env", {}).pop("ANTHROPIC_BASE_URL", None)
    p.write_text(json.dumps(s, indent=2) + "\n")
    print("✓ Claude Code 설정 초기화 완료")
PYEOF

# Codex 설정 파일 제거
rm -f ~/.codex/config.toml && echo "✓ Codex 설정 초기화 완료"
```
