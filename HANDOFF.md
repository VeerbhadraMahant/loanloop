# LoanLoop handoff (6 Nov 2026)

The build is done and tested. What's left is the live checks, the demo video and the submission.
**Submit by 9 Nov 2026, 23:59 IST.** The official deadline is 10 Nov; keep 10 Nov as buffer.

## Read first

1. [README.md](README.md): what LoanLoop is, how to run it, the numbers.
2. [CLAUDE.md](CLAUDE.md): the full spec, the security rules (section 6, hard requirements) and the demo calls (section 3.4).
3. [NOTES.md](NOTES.md): decisions, measured results, known limits.
4. [docs/qa-checklist.md](docs/qa-checklist.md): a click-by-click test of every feature and both demo calls.
5. [docs/personas.md](docs/personas.md): Priya, Ramesh and Sunita's seeded data.

`docs/agent-builder-setup.md` and `agent/` are reference only. Agent Builder access never came through, so `voice/` replaces it.

## Setup (Windows)

Prereqs: Docker Desktop, `uv`, Node 20+, Ollama with `qwen3:8b` (`ollama pull qwen3:8b`, about 5 GB; a GPU keeps a turn near 2 s), and your own Gnani speech key.

```powershell
git clone https://github.com/VeerbhadraMahant/loanloop; cd loanloop
copy .env.example gateway\.env          # set GNANI_SPEECH_API_KEY and fresh tokens (below)
copy web\.env.example web\.env.local    # same DASHBOARD_TOKEN and PHONE_TOKEN as gateway\.env
cd gateway; uv sync; cd ..\web; npm ci; cd ..
.\start.ps1 -Seed                       # needs Docker Desktop and Ollama running
```

Fresh tokens (run in `gateway\`):
- `GATEWAY_SHARED_SECRET`, `DASHBOARD_TOKEN`, `PHONE_TOKEN`: `uv run python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `ENCRYPTION_KEY`: `uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

Then open `http://127.0.0.1:3000/call/priya`, `/phone/priya`, `/ops` and `/metrics`.
Smoke test with `python tools/voice_e2e.py --scenario all`. It types each turn instead of speaking, so it spends no Gnani credits, and it should end in `ALL PASS`.

## Status (6 Nov)

- Gateway 170 tests and voice 65 tests pass. The load test passes: 1,000 users with p95 under 50 ms on every action (`tools/out/loadtest.json`).
- `voice_e2e.py --scenario all` passed on a fresh seed today: Priya, the browser phrasings and the attacker, with a median typed turn of 1.9 s.
- No live speech has been tested yet: no mic run and no live Gnani STT or TTS.

## Remaining

Must do:
1. [ ] Mic test at `/call/priya`: hold to talk, in Hinglish and Marathi.
2. [ ] Live Gnani check: turn on "Voice replies" for 1-2 turns only, to confirm Prisma STT and Timbre TTS work. Credits are limited.
3. [ ] Write `docs/demo-script.md` (3-4 min): the problem, the Priya call, the attacker blocked, `/ops`, `/metrics`.
4. [ ] Record the video: the Priya call with `/phone/priya` and `/ops` side by side, the attacker call, and `/metrics`. Reseed before each take, and also record a typed fallback take.
5. [ ] Put the video link in the README and check its numbers.
6. [ ] Upload the video unlisted (YouTube or Drive, view access).
7. [ ] Submit on the portal (repo link, video link, description) and screenshot the confirmation.

Optional, if credits allow:
- [ ] STT benchmark: `tools/make_test_audio.py`, then `tools/stt_benchmark.py`. `/metrics` has no STT numbers until this runs.
- [ ] A voice clone of Priya for the attacker call.

## Gotchas

- **The data changes when you use it.** The EMI date change works once per 6 months, and 3 wrong verifications lock a customer for an hour. Run `.\start.ps1 -Seed` (or `cd gateway; uv run python ../tools/seed_data.py`) before every test run and every take. `voice_e2e.py` does not reseed itself: run it twice without reseeding and the Priya date-change checks fail, and that is expected.
- In Windows PowerShell 5.1, don't add `2>&1` to `start.ps1`: Docker's progress messages on stderr then show up as errors.
- Only `/call` with "Voice replies" on spends Gnani credits. Typed turns are free.

## Rules

- Push straight to `main`, no PRs.
- Never commit `.env` files, `.env.local` or `TASKS.md`, and never print keys.
- All data stays synthetic. Don't weaken the security rules in CLAUDE.md section 6 to make the demo work.
