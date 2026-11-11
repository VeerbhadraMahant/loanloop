# Build from the repo root:  docker build -f deploy/gateway.Dockerfile .
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /app/gateway
COPY gateway/pyproject.toml gateway/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
# layout mirrors the repo: app reads ../i18n and ../tools/out (dashboard metrics)
COPY gateway/app ./app
COPY i18n /app/i18n
COPY tools/out /app/tools/out
RUN useradd -r -u 10001 loanloop && chown -R loanloop /app
USER loanloop
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host :: --port ${PORT:-8000}"]
