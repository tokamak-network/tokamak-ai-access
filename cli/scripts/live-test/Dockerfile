FROM node:22-bookworm

ARG VERSION=latest
ARG WITH_LLM=false
ARG WITH_CODEX=false
ARG WITH_OPENCLAW=false
ARG WITH_HERMES=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends zsh jq curl \
    && rm -rf /var/lib/apt/lists/*

ENV SHELL=/bin/zsh
RUN touch /root/.zshrc

COPY local-pkg/ /tmp/local-pkg/
RUN set -e; \
    LOCAL=$(ls /tmp/local-pkg/*.tgz 2>/dev/null | head -1); \
    if [ -n "$LOCAL" ]; then \
      npm install -g "$LOCAL"; \
    else \
      npm install -g "@tokamak-network/ai-access-cli@${VERSION}"; \
    fi

RUN if [ "$WITH_LLM" = "true" ]; then npm install -g @anthropic-ai/claude-code; fi
RUN if [ "$WITH_CODEX" = "true" ]; then npm install -g @openai/codex; fi
RUN if [ "$WITH_OPENCLAW" = "true" ]; then npm install -g openclaw@latest; fi
RUN if [ "$WITH_HERMES" = "true" ]; then \
      curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash; \
    fi

COPY run-live-tests.sh /scripts/run-live-tests.sh
RUN chmod +x /scripts/run-live-tests.sh

ENTRYPOINT ["/scripts/run-live-tests.sh"]
