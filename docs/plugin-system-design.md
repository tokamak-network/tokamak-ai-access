# TON AI Access — 코딩 에이전트 설치 플러그인 시스템 설계

> 작성일: 2026-05-20  
> 버전: 1.1  
> 서비스 URL: https://tokamak-ai-access.vercel.app/  
> API Base URL: https://api2.ai.tokamak.network

---

## 1. 배경 및 목표

### 서비스 개요

TON AI Access는 Tokamak Network에 100 TON 이상 스테이킹한 사용자에게 LiteLLM API 키를 무료로 발급하는 서비스다. EVM 지갑 연결 → SIWE 서명 → 즉시 키 발급의 3단계로 이루어지며, 가스비나 트랜잭션 없이 작동한다.

발급된 키는 `https://api2.ai.tokamak.network` 엔드포인트를 통해 OpenAI-compatible REST API로 LLM 모델에 접근할 수 있다. 현재 기본 제공 모델은 `qwen-3.6`이며, 엔드포인트에서 추가 모델을 동적으로 탐색할 수 있다.

### 해결할 문제

사용자가 API 키를 발급받은 후 코딩 에이전트(Claude Code, OpenAI Codex)에서 실제로 사용하려면:

- 환경 변수(`OPENAI_API_KEY`, `OPENAI_BASE_URL`)를 알아야 한다.
- 쉘 설정 파일을 수동으로 편집해야 한다.
- Claude Code와 Codex의 설정 방식 차이를 파악해야 한다.

이 과정은 개발 경험이 없는 사용자에게 진입 장벽이 된다.

### 목표

1. **Zero-friction 설치**: API 키 입력 한 번으로 완료.
2. **에이전트 위임 설치**: AI가 환경 감지부터 검증까지 모두 처리.
3. **모델 자동 탐색**: `/v1/models` 엔드포인트를 조회해 사용 가능한 모델 목록을 에이전트가 직접 보여줌.
4. **Copy-paste 실행**: 프론트엔드에서 가이드 복사 → 에이전트에 붙여넣기 → 완료.

---

## 2. 시스템 구성 요소

```
┌─────────────────────────────────────────────────────────────────┐
│        TON AI Access Frontend (tokamak-ai-access.vercel.app)    │
│                                                                 │
│   ┌──────────────────────┐   ┌────────────────────────────────┐│
│   │  지갑 연결 & 키 발급  │   │     설치 가이드 패널           ││
│   │  ──────────────────  │   │     ──────────────────────     ││
│   │  • SIWE 서명 인증    │   │  • 대화문 형식 프롬프트         ││
│   │  • API Key 발급/표시 │   │  • [가이드 복사] 버튼           ││
│   │  • 10 TON 검증       │   │  • Base URL 자동 포함          ││
│   └──────────────────────┘   └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                 │ 사용자가 가이드 텍스트 복사
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    사용자의 로컬 환경                             │
│                                                                 │
│  ┌─────────────────────┐     ┌──────────────────────────────┐  │
│  │    Claude Code      │     │       OpenAI Codex           │  │
│  │    (claude CLI)     │     │       (codex CLI)            │  │
│  │                     │     │                              │  │
│  │ [가이드 붙여넣기]    │     │ [가이드 붙여넣기]             │  │
│  │  ↓                  │     │  ↓                           │  │
│  │  API Key 입력 요청  │     │  API Key 입력 요청           │  │
│  │  /v1/models 탐색    │     │  /v1/models 탐색             │  │
│  │  모델 선택          │     │  모델 선택                   │  │
│  │  환경 감지 & 설치   │     │  환경 감지 & 설치            │  │
│  │  검증 테스트        │     │  검증 테스트                 │  │
│  └─────────────────────┘     └──────────────────────────────┘  │
│              │                              │                   │
│              └──────────────┬───────────────┘                   │
│                             ▼                                   │
│              ┌──────────────────────────────┐                   │
│              │     쉘 설정 파일 업데이트      │                   │
│              │  ~/.zshrc / ~/.bashrc 등      │                   │
│              │                              │                   │
│              │  OPENAI_API_KEY=<key>         │                   │
│              │  OPENAI_BASE_URL=<url>/v1     │                   │
│              │  ANTHROPIC_API_KEY=<key>      │                   │
│              │  ANTHROPIC_BASE_URL=<url>     │                   │
│              └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          TON AI Access LiteLLM Proxy                            │
│          https://api2.ai.tokamak.network                        │
│                                                                 │
│   GET  /v1/models           → 사용 가능한 모델 목록 반환         │
│   POST /v1/chat/completions → OpenAI-compatible 채팅 API        │
│   인증: Bearer <api-key>                                         │
│   기본 모델: qwen-3.6                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 핵심 설계 결정

### 3.1 프로토콜: OpenAI-compatible 우선

TON AI Access 백엔드는 OpenAI-compatible REST API를 제공한다. 따라서 환경 변수 설정의 주 대상은 `OPENAI_*` 계열이다.

Claude Code의 경우, `ANTHROPIC_BASE_URL`을 통해 커스텀 프록시를 지정할 수 있다. LiteLLM은 Anthropic API 포맷도 지원하므로 양쪽을 모두 설정한다.

```bash
# 주력: OpenAI-compatible (Codex, LangChain, 기타 OpenAI SDK 기반)
OPENAI_API_KEY="<api-key>"
OPENAI_BASE_URL="https://api2.ai.tokamak.network/v1"

# 보조: Claude Code가 Anthropic SDK로 동작할 때
ANTHROPIC_API_KEY="<api-key>"
ANTHROPIC_BASE_URL="https://api2.ai.tokamak.network"
```

### 3.2 모델 자동 탐색

프론트엔드에서 모델 목록을 하드코딩해 주입하는 대신, **설치 에이전트가 직접 `/v1/models` 를 쿼리**한다.

**장점**:
- 모델이 추가/제거돼도 가이드 수정 없이 자동 반영
- 프론트엔드 배포 없이 최신 모델 목록 제공
- 사용자가 자신의 API 키로 접근 가능한 모델만 표시

**구현**:
```bash
# API 키를 이용해 모델 목록 탐색
curl -s https://api2.ai.tokamak.network/v1/models \
  -H "Authorization: Bearer $API_KEY" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
models = [m['id'] for m in data.get('data', [])]
print('\n'.join(f'  - {m}' for m in models))
"
```

탐색 실패(네트워크 오류, 잘못된 키 등) 시에는 기본값 `qwen-3.6`을 사용한다.

### 3.3 프론트엔드 동적 주입 최소화

모델 목록을 에이전트가 런타임에 탐색하므로, 프론트엔드가 가이드에 주입해야 하는 값은 **Base URL 하나뿐**이다.

| 값 | 주입 주체 | 방식 |
|---|---|---|
| Base URL | 프론트엔드 | 템플릿 치환 (고정값) |
| 모델 목록 | 설치 에이전트 | `/v1/models` 런타임 탐색 |
| API 키 | 사용자 직접 입력 | 보안상 가이드에 미포함 |

### 3.4 멱등성 보장

```bash
# 기존 블록 감지 후 교체
if grep -q "# >>> TON AI Access >>>" "$SHELL_RC"; then
  # 기존 블록 삭제 후 재작성 (업데이트)
else
  # 신규 추가
fi
```

### 3.5 Claude Code 전용 고려사항

Claude Code는 `--model` 플래그 또는 `claude config set model` 명령으로 기본 모델을 지정할 수 있다. 단, 이는 Anthropic 공식 모델명 형식에 최적화되어 있으므로, TON AI Access의 커스텀 모델(`qwen-3.6` 등)을 사용할 때는 환경 변수 방식이 더 안정적이다.

---

## 4. 설치 플로우

```
사용자 액션                    에이전트 실행
────────────                   ─────────────────────────────────────
프론트엔드에서 가이드 복사
         │
         ▼
에이전트 채팅에 붙여넣기
         │
         ▼
                               [1] 안내 메시지 출력
                               "API 키를 입력해 주세요."
                                         │
API 키 입력 ◄────────────────────────────┘
         │
         ▼
                               [2] /v1/models 탐색
                               curl api2.ai.tokamak.network/v1/models
                               → 모델 목록 출력
                               "사용 가능한 모델:"
                               " - qwen-3.6 (기본)"
                               " - ..."
                                         │
모델 선택 또는 엔터 ◄────────────────────┘
         │
         ▼
                               [3] 환경 감지
                               OS / Shell / RC 파일 결정
                                         │
                               [4] 설치
                               SHELL_RC에 블록 작성
                               현재 세션에 즉시 적용
                                         │
                               [5] 검증
                               간단한 API 호출 테스트
                                         │
완료 안내 ◄──────────────────────────────┘
```

---

## 5. 보안 고려사항

| 항목 | 처리 방식 |
|------|----------|
| API 키 노출 | 화면에 마스킹 표시 (sk-****...****) |
| 키 저장 위치 | 사용자 홈 디렉토리 쉘 RC 파일만 사용 |
| 수정 범위 | `$HOME` 하위 파일만, 시스템 파일 접근 없음 |
| 프롬프트 인젝션 | 가이드 텍스트에 고정 URL만 포함, 임의 URL 실행 없음 |
| 모델 탐색 요청 | 사용자 입력 API 키로만 요청, 다른 곳으로 전송 없음 |

---

## 6. 프론트엔드 통합 스펙

### 6.1 UI 구성

```
┌────────────────────────────────────────────────────────┐
│  🤖 코딩 에이전트에서 바로 사용하기                     │
│                                                        │
│  Claude Code 또는 Codex 채팅창에 아래 내용을            │
│  붙여넣으면 자동으로 설정됩니다.                         │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │  [가이드 텍스트 미리보기 — 스크롤 가능]           │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│                   [ 📋 가이드 복사하기 ]               │
└────────────────────────────────────────────────────────┘
```

### 6.2 구현 코드

```javascript
const TOKAMAK_BASE_URL = 'https://api2.ai.tokamak.network';

async function getInstallGuide() {
  const template = await fetch('/static/ton-ai-install-guide-template.md')
    .then(r => r.text());

  // Base URL 하나만 주입 (모델 목록은 에이전트가 런타임에 탐색)
  return template.replace(/\{\{TOKAMAK_BASE_URL\}\}/g, TOKAMAK_BASE_URL);
}

document.getElementById('copy-guide-btn').addEventListener('click', async () => {
  const guide = await getInstallGuide();

  // "--- [복사 시작]" ~ "--- [복사 끝]" 구간 추출
  const match = guide.match(/---\s*\[복사 시작\]([\s\S]*?)---\s*\[복사 끝\]/);
  if (match) {
    await navigator.clipboard.writeText(match[1].trim());
    showToast('✅ 복사 완료! 에이전트 채팅창에 붙여넣으세요.');
  }
});
```

---

## 7. 향후 개선 방향

1. **원클릭 쉘 설치**: `curl https://tokamak-ai-access.vercel.app/install.sh | bash -s -- <api-key>` 형태로 에이전트 없이도 설치 가능한 방식 추가.
2. **VS Code Extension**: 에디터 내에서 TON AI Access 설정 및 모델 전환.
3. **키 만료 알림**: 환경 변수 주석에 만료일 기록, 에이전트가 만료 임박 시 경고.
4. **Windows(PowerShell) 지원**: 현재 macOS/Linux 한정, PowerShell 플로우 추가.
5. **MCP Server Plugin**: Claude Code 내에서 TON AI Access 키 상태 확인 및 갱신을 지원하는 MCP 서버.
