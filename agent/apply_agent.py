"""Apply LoanLoop's config to Gnani Agent Builder via the Platform API.

  uv run python agent/apply_agent.py              # dry-run (default): print payloads, no network
  INYA_PLATFORM_API_KEY=... uv run python agent/apply_agent.py --apply [--voice NAME] [--name BOTNAME]

Only fields documented in Platform API "Update Agent" are sent. Custom Actions have NO documented API:
they are printed as manual console steps (see docs/agent-builder-setup.md).
"""
import argparse, json, os, sys, time
from pathlib import Path

HERE = Path(__file__).parent
BASE = "https://api.inya.ai/platform"
LANGS = ["en-IN", "hi-IN", "mr-IN"]  # botDetails.language max 3; Hinglish = hi-IN + en-IN
ALLOWED_LLM = ("Pampa Go", "Pampa Priority")  # Gnani only (CLAUDE.md section 1)
GREETING = "Namaste, welcome to Sahyadri Finance Bank. How can I help you today?"  # replaced by start_call speak if the agent follows the prompt
END = "Thank you for calling Sahyadri Finance Bank. Goodbye."


def call(client, method, path, key, **kw):
    for delay in (1, 2, 4, 8, None):  # Platform API: 429 backoff
        r = client.request(method, BASE + path, headers={"x-api-key": key}, timeout=30, **kw)
        if r.status_code != 429 or delay is None:
            return r
        time.sleep(delay)


def keyterms():
    return [l.strip() for l in (HERE / "keyterms.txt").read_text(encoding="utf-8").splitlines() if l.strip()][:100]  # phraseConfig max 100


def pick_model(models: list, wanted: str):
    for m in models:
        if wanted in (m.get("label"), m.get("modelId")):
            return m
    return None


def gnani_llm_models(resp: dict) -> list:
    """Flatten response.LLM[] -> models of provider gnani, tolerant of shape."""
    out = []
    for p in resp.get("response", {}).get("LLM", []):
        if p.get("provider", {}).get("providerId") == "gnani":
            out += p.get("models", [])
    return out


def build_payload(llm_model_id: str, asr: dict, voice: str, supports_phrases: bool) -> dict:
    adv = {"barge": True, "useDenoiser": True}
    if supports_phrases:
        adv["phraseConfig"] = {"phrase": keyterms(), "phraseWeight": 1.0}
    return {
        "systemPrompt": (HERE / "system_prompt.md").read_text(encoding="utf-8"),
        "greetingMessage": GREETING,
        "endMessage": END,
        "botDetails": {"language": LANGS},
        "asrParams": asr,
        "llmParams": {"provider": "gnani", "model": llm_model_id, "temperature": 0.3, "maxTokens": 300},
        "ttsParams": {"provider": "gnani", "voice": voice, "language": "en-IN", "enableCaching": True},
        "advanceSettings": adv,
        "languageSwitch": True,
        "languageSwitchMode": "implicit",
        "minWordsForLangSwitch": 2,
    }


def manual_steps():
    acts = json.loads((HERE / "actions.json").read_text(encoding="utf-8"))["actions"]
    print("\nMANUAL CONSOLE STEPS (no documented API for custom integrations/actions):")
    print("1. Add Custom Integration 'loanloop_gateway': POST, base URL = $PUBLIC_GATEWAY_URL, header X-Gateway-Secret = $GATEWAY_SHARED_SECRET.")
    print(f"2. Create {len(acts)} Actions from agent/actions.json (Manage Agents > Agent > Actions > +). Per action: name, description, integration, URL, headers, body,")
    print("   timeout 5 s, Trigger On-Call, 'Speak During Action' filler, Before-API-Call variables as listed. Names:")
    print("   " + ", ".join(a["name"] for a in acts))
    print("3. Check the open questions in docs/agent-builder-setup.md (conversation_id variable, timeout range, verbatim speak, Prisma v3).")


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp1252 consoles
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="send requests (default is dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="explicit dry-run (the default)")
    ap.add_argument("--voice", default="Nalini", help="TTS voice name; must exist in GET tts_config (docs example voice)")
    ap.add_argument("--name", default="LoanLoop Service Desk")
    ap.add_argument("--llm", default="Pampa Go", choices=ALLOWED_LLM)
    args = ap.parse_args()
    apply = args.apply and not args.dry_run
    bot_file = HERE / ".bot_id"
    bot_id = bot_file.read_text().strip() if bot_file.exists() else None

    if not apply:
        asr = {"provider": "gnani", "model": "<chosen from transcriber_config: gnani model supporting en-IN,hi-IN,mr-IN>", "language": "en-IN"}
        payload = build_payload("<modelId of '%s' from llm_models>" % args.llm, asr, args.voice, supports_phrases=True)
        payload["systemPrompt"] = f"<{len(payload['systemPrompt'])} chars from agent/system_prompt.md>"
        print("DRY RUN (use --apply with INYA_PLATFORM_API_KEY to send)")
        print(f"1. GET {BASE}/v1/agents/config/llm_models?provider=gnani  -> assert {ALLOWED_LLM} present")
        print("2. GET .../config/transcriber_config?language=en-IN&language=hi-IN&language=mr-IN&providerId=gnani ; GET .../tts_config?... (printed)")
        print(f"3. {'PUT /v1/agents/' + bot_id if bot_id else 'POST /v1/agents {botName, description, region, timeZone}, save botId to agent/.bot_id, then PUT /v1/agents/{botId}'}")
        print(json.dumps({"create": {"botName": args.name, "description": "LoanLoop inbound service desk (demo, synthetic data)", "region": "asia", "timeZone": "Asia/Kolkata"},
                          "update": payload}, ensure_ascii=False, indent=2))
        print(f"keyterms: {len(keyterms())} phrases")
        manual_steps()
        return

    key = os.environ.get("INYA_PLATFORM_API_KEY")
    if not key:
        sys.exit("INYA_PLATFORM_API_KEY not set")
    import httpx

    with httpx.Client() as c:
        r = call(c, "GET", "/v1/agents/config/llm_models?provider=gnani", key)
        r.raise_for_status()
        models = gnani_llm_models(r.json())
        found = [m for m in (pick_model(models, n) for n in ALLOWED_LLM) if m]
        if not found:
            sys.exit(f"Refusing to configure: none of {ALLOWED_LLM} offered by provider gnani. Got: {[m.get('label') for m in models]}")
        llm = pick_model(models, args.llm)
        if not llm:
            sys.exit(f"{args.llm} not available; available Gnani models: {[m.get('label') for m in models]}")

        q = "&".join(f"language={l}" for l in LANGS)
        tr = call(c, "GET", f"/v1/agents/config/transcriber_config?{q}&providerId=gnani", key)
        tts = call(c, "GET", f"/v1/agents/config/tts_config?{q}&providerId=gnani", key)
        print("TRANSCRIBER:", tr.text[:3000]); print("TTS:", tts.text[:3000])
        cfgs = tr.json().get("response", {}).get("transcriberConfig", []) if tr.status_code == 200 else []
        asr_models = [m for p in cfgs if p.get("provider", {}).get("providerId") == "gnani" for m in p.get("models", [])]
        if not asr_models:
            sys.exit("No Gnani ASR model supports en-IN+hi-IN+mr-IN together; choose in console (see docs/agent-builder-setup.md)")
        # prefer a vocabulary-capable model (phraseConfig works on gnani_asr per docs)
        asr_m = next((m for m in asr_models if m["modelId"] == "gnani_asr"), asr_models[0])
        asr = {"provider": "gnani", "model": asr_m["modelId"], "language": "en-IN"}
        payload = build_payload(llm["modelId"], asr, args.voice, supports_phrases=asr_m["modelId"] == "gnani_asr")
        if asr_m["modelId"] != "gnani_asr":
            print("WARNING: phraseConfig skipped (docs list it only for gnani_asr/microsoft/elevenlabs); keyterms need console or another model.")

        if not bot_id:
            r = call(c, "POST", "/v1/agents", key, json={"botName": args.name, "description": "LoanLoop inbound service desk (demo, synthetic data)", "region": "asia", "timeZone": "Asia/Kolkata"})
            if r.status_code != 201:
                sys.exit(f"create failed {r.status_code}: {r.text[:300]}")
            bot_id = r.json()["response"]["botId"]
            bot_file.write_text(bot_id)
            print("created botId", bot_id)
        r = call(c, "PUT", f"/v1/agents/{bot_id}", key, json=payload)
        print("update:", r.status_code, r.text[:600])
        if r.status_code >= 400:
            sys.exit(1)
    manual_steps()


if __name__ == "__main__":
    main()
