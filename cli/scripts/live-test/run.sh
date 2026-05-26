#!/usr/bin/env bash
# Host-side wrapper: builds the Docker image and runs live tests.
# Usage:
#   ./run.sh                      # test latest published version
#   ./run.sh --version 1.0.1      # test a specific version
#   ./run.sh --local              # build local tarball and test it (no npm publish needed)
#   ./run.sh --with-llm           # include Phase 5 LLM routing (needs TON_API_KEY)
#   ./run.sh --with-codex         # include Phase 6 codex CLI invocation test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="latest"
WITH_LLM="false"
WITH_CODEX="true"
WITH_OPENCLAW="true"
WITH_HERMES="true"
LOCAL="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --local) LOCAL="true"; shift ;;
    --with-llm) WITH_LLM="true"; shift ;;
    --with-codex) WITH_CODEX="true"; shift ;;
    --with-openclaw) WITH_OPENCLAW="true"; shift ;;
    --with-hermes) WITH_HERMES="true"; shift ;;
    --no-codex) WITH_CODEX="false"; shift ;;
    --no-openclaw) WITH_OPENCLAW="false"; shift ;;
    --no-hermes) WITH_HERMES="false"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --local: build tarball from source and place it in local-pkg/ for Docker to pick up
if [ "$LOCAL" = "true" ]; then
  CLI_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
  echo "Building local tarball from $CLI_DIR..."
  (cd "$CLI_DIR" && npm run build && npm pack --pack-destination "$SCRIPT_DIR/local-pkg/")
  echo "Local tarball ready in $SCRIPT_DIR/local-pkg/"
else
  # Ensure local-pkg/ is empty so Docker falls back to npm registry
  rm -f "$SCRIPT_DIR/local-pkg/"*.tgz
fi

echo "Building image (version=$VERSION, with-llm=$WITH_LLM, with-codex=$WITH_CODEX, with-openclaw=$WITH_OPENCLAW, with-hermes=$WITH_HERMES)..."
docker build \
  --build-arg VERSION="$VERSION" \
  --build-arg WITH_LLM="$WITH_LLM" \
  --build-arg WITH_CODEX="$WITH_CODEX" \
  --build-arg WITH_OPENCLAW="$WITH_OPENCLAW" \
  --build-arg WITH_HERMES="$WITH_HERMES" \
  -t tokamak-ai-access-live-test \
  "$SCRIPT_DIR"

echo "Running tests..."
DOCKER_ARGS=()
[ -n "${TON_API_KEY:-}" ] && DOCKER_ARGS+=(-e "TON_API_KEY=$TON_API_KEY")
[ "$WITH_LLM" = "true" ] && DOCKER_ARGS+=(-e "WITH_LLM=true")
[ "$WITH_CODEX" = "true" ] && DOCKER_ARGS+=(-e "WITH_CODEX=true")
[ "$WITH_OPENCLAW" = "true" ] && DOCKER_ARGS+=(-e "WITH_OPENCLAW=true")
[ "$WITH_HERMES" = "true" ] && DOCKER_ARGS+=(-e "WITH_HERMES=true")

docker run --rm "${DOCKER_ARGS[@]}" tokamak-ai-access-live-test
