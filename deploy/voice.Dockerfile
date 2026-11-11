# Build from the repo root:  docker build -f deploy/voice.Dockerfile .
# The voice service runs in the gateway's venv and loads gateway/app files (faq_score, scrub, faq.json) by path.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /app
COPY gateway/pyproject.toml gateway/uv.lock gateway/
RUN cd gateway && uv sync --frozen --no-dev --no-install-project
COPY gateway/app gateway/app
COPY voice voice
COPY agent agent
COPY i18n i18n
RUN useradd -r -u 10001 loanloop && chown -R loanloop /app
USER loanloop
EXPOSE 8100
CMD ["sh", "-c", "exec uvicorn voice.app:app --host :: --port ${PORT:-8100}"]
