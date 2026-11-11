# Deploying LoanLoop: Vercel (web) + Railway (gateway, voice, ollama, Postgres, Redis)

Everything is synthetic data. Keep the Vercel site behind basic auth (`WEB_BASIC_AUTH`).

## 1. Generate secrets (once, keep them in a password manager)

```
python -c "import secrets;print(secrets.token_urlsafe(32))"   # run 5 times: GATEWAY_SHARED_SECRET, DASHBOARD_TOKEN, PHONE_TOKEN, VOICE_EDGE_TOKEN, and spare
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"   # ENCRYPTION_KEY (needs `pip install cryptography`, or run via `cd gateway && uv run python -c ...`)
```

Never reuse the three gateway tokens for each other. Losing `ENCRYPTION_KEY` makes stored account/loan numbers unreadable (reseed fixes it on a demo DB).

## 2. Railway project

1. New project, add **PostgreSQL** and **Redis** (database templates).
2. Add three services from this GitHub repo (empty service, connect repo). For each: Settings, **Config-as-code file path**:
   - `gateway` -> `/deploy/railway/gateway.json`
   - `voice` -> `/deploy/railway/voice.json`
   - `ollama` -> `/deploy/railway/ollama.json`

   Leave root directory empty (the Docker build context is the repo root).
3. `gateway` and `voice`: Settings, Networking, **Generate domain** (public HTTPS). `ollama`: no public domain.
4. `ollama`: add a **volume** mounted at `/root/.ollama`. The model (`qwen3:8b`, about 5 GB download) is pulled on first start. Give it about 8 GB RAM; on CPU it is slow (seconds per token burst), so it is only the fallback.

Variables (reference variables in `${{...}}` form):

**gateway**

| Var | Value |
|---|---|
| GATEWAY_SHARED_SECRET, DASHBOARD_TOKEN, PHONE_TOKEN | the generated tokens |
| ENCRYPTION_KEY | the Fernet key |
| PUBLIC_GATEWAY_URL | `https://<gateway public domain>` |
| DATABASE_URL | `${{Postgres.DATABASE_URL}}` |
| REDIS_URL | `${{Redis.REDIS_URL}}` |
| GNANI_SPEECH_API_KEY, INYA_PLATFORM_API_KEY | Gnani keys |
| SESSION_TTL_S, JOBS_INTERVAL_S | optional (1800, 3600) |

**voice**

| Var | Value |
|---|---|
| GATEWAY_URL | `http://gateway.railway.internal:8000` (set the gateway's `PORT=8000` so the internal port is fixed) |
| GATEWAY_SHARED_SECRET, DASHBOARD_TOKEN | same as gateway |
| GNANI_SPEECH_API_KEY | Gnani key |
| LLM_PROVIDER / LLM_FALLBACK | `sarvam` / `ollama` |
| SARVAM_API_KEY, SARVAM_MODEL | Sarvam key, `sarvam-105b-conversations` |
| OLLAMA_URL, OLLAMA_MODEL | `http://ollama.railway.internal:11434`, `qwen3:8b` |
| WARMUP | `false` |
| VOICE_ALLOWED_HOSTS | `<voice public domain>` (no scheme) |
| VOICE_EDGE_TOKEN | generated token (same as Vercel) |
| PORT | `8100` |

Never set `VOICE_DEV`. Leave `VOICE_ALLOWED_ORIGINS` empty (the browser only talks to Vercel).

**ollama**: `OLLAMA_MODEL=qwen3:8b` (default), `PORT` not needed.

Deploy order: Postgres, Redis, gateway (its pre-deploy step seeds the DB only if empty), then ollama, then voice.

## 3. Vercel

Import the repo, **Root Directory: `web`**. Env vars (Production):

| Var | Value |
|---|---|
| GATEWAY_URL | `https://<gateway public domain>` |
| DASHBOARD_TOKEN, PHONE_TOKEN | same as gateway |
| WEB_BASIC_AUTH | `user:password` of your choice |
| WEB_ALLOWED_ORIGINS | `https://<vercel domain>` |
| VOICE_URL | `https://<voice public domain>` |
| VOICE_EDGE_TOKEN | same as voice |

Never set `WEB_AUTH_DISABLED`. Leave `NEXT_PUBLIC_VOICE_URL` unset. Redeploy after changing env vars.

## 4. Seeding

The gateway pre-deploy command `python -m app.db.seed_if_empty` seeds only when the `customers` table is missing or empty and never drops a populated DB. To reset the demo data deliberately (this DROPS all tables and clears Redis `ll:*`), run once from a Railway shell on the gateway service: `python -c "import asyncio;from app.db.seed import seed;from app.db.session import engine;print(asyncio.run(seed(engine)))"`.

## 5. Smoke test

- [ ] `https://<gateway>/health` returns `{"ok":true}`; gateway deploy log shows `seed_if_empty: ...`.
- [ ] `https://<voice>/health` returns ok through the Vercel proxy path (direct hits without the edge token must be refused).
- [ ] Vercel site asks for the basic-auth login; wrong password is refused.
- [ ] `/bank` loads with customer data.
- [ ] A typed call on the call page completes a verify and an EMI query.
- [ ] `/ops` live events update while the call runs (SSE).
- [ ] Mic works on the call page (HTTPS is required; allow the browser permission).
- [ ] Voice logs show `sarvam` as provider; stop it once to confirm fallback to Ollama (first Ollama reply can take a minute).

## 6. Rollback

- Railway: service, Deployments, pick the previous successful deployment, Redeploy/Rollback. Config files live in git, so reverting the commit and redeploying also works.
- Vercel: Deployments, previous production deployment, Promote to Production.
- Data: the pre-deploy seed never overwrites data. To restore demo data, re-run the deliberate reseed in section 4.
- Emergency: remove the public domain of `voice` or `gateway` (Settings, Networking) to take it offline.
