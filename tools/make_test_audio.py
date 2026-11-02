"""Generate synthetic caller audio with Gnani Timbre v3 (+ optional voice clone) and a noisy telephone-style copy.

Usage:
  uv run python tools/make_test_audio.py --dry-run
  GNANI_SPEECH_API_KEY=... uv run python tools/make_test_audio.py [--limit N] [--clone ref.wav]

Output: tools/out/audio/*.wav (8000 Hz mono) + tools/out/audio/manifest.json.
TTS allows ONE active request per account (docs), so everything here is sequential.
"""
import argparse, array, json, os, random, struct, sys, time, wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from stt_corpus import ATTACKER_LINES, build_corpus  # noqa: E402

BASE = "https://api.vachana.ai"
TTS_URL = f"{BASE}/api/v1/tts/inference"
EMB_URL = f"{BASE}/api/v1/tts/voice-clone/embeddings"
OUT = Path(__file__).parent / "out"
AUDIO_CONFIG = {"sample_rate": 8000, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"}


def tts_payload(text, voice, language):
    return {"text": text, "model": "timbre-v3.0", "voice": voice, "language": language, "speed": 1.0, "audio_config": AUDIO_CONFIG}


def clone_payload(text, emb):
    # voice is omitted for cloned synthesis (docs)
    return {"text": text, "model": "vachana-vc-v1", "audio_config": AUDIO_CONFIG, "speaker_embedding": emb}


def request(client, method, url, key, **kw):
    """Retry 429/500/503/504 with backoff (docs: 0.5/1/2 s; 429 has no Retry-After). Extra attempts because
    a single in-flight TTS request per account makes 429 likely."""
    for attempt, delay in enumerate([0.5, 1, 2, 4, 8, None]):
        r = client.request(method, url, headers={"X-API-Key-ID": key}, **kw)
        if r.status_code not in (429, 500, 503, 504) or delay is None:
            return r
        time.sleep(delay)


def add_phone_noise(src: Path, dst: Path, seed: int):
    """Low-level white noise + hard clipping, stdlib only."""
    rng = random.Random(seed)
    with wave.open(str(src)) as w:
        params, frames = w.getparams(), w.readframes(w.getnframes())
    s = array.array("h")
    s.frombytes(frames)
    for i, x in enumerate(s):
        y = int(x * 1.6) + int(rng.gauss(0, 350))
        s[i] = max(-18000, min(18000, y))  # clip
    with wave.open(str(dst), "wb") as w:
        w.setparams(params)
        w.writeframes(s.tobytes())


def synth(client, key, payload, path: Path):
    r = request(client, "POST", TTS_URL, key, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"TTS failed {r.status_code}: {r.text[:200]}")
    path.write_bytes(r.content)


def plan(args):
    items = [dict(i, kind="tts") for i in build_corpus()]
    if args.limit:
        items = items[:args.limit]
    if args.clone:
        for n, line in enumerate(ATTACKER_LINES):
            items.append({"id": f"attacker{n:02d}", "text": line, "language": "en", "tts_language": "en-IN",
                          "voice": "clone", "entities": [], "kind": "clone"})
    return items


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp1252 consoles
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--clone", metavar="REF_WAV", help="5-30 s clean reference audio to build a clone embedding")
    ap.add_argument("--no-noise", action="store_true")
    args = ap.parse_args()

    items = plan(args)
    print(f"{len(items)} clips planned ({'+ noisy copies' if not args.no_noise else 'clean only'}), voices: "
          f"{sorted({i['voice'] for i in items})}")
    if args.dry_run:
        for it in items[:3]:
            print(json.dumps(tts_payload(it["text"], it["voice"], it["tts_language"]), ensure_ascii=False))
        if args.clone:
            print("would POST", EMB_URL, "with", args.clone, "then synthesize attacker lines with vachana-vc-v1")
        print("dry-run: no requests sent")
        return

    key = os.environ.get("GNANI_SPEECH_API_KEY")
    if not key:
        sys.exit("GNANI_SPEECH_API_KEY not set (use --dry-run to preview)")
    import httpx  # lazy so --dry-run needs no deps

    audio = OUT / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    emb = None
    manifest = []
    with httpx.Client() as client:
        if args.clone:
            cache = OUT / "clone_embedding.json"
            r = request(client, "POST", EMB_URL, key, files={"audio_file": open(args.clone, "rb")}, timeout=60)
            if r.status_code != 200:
                sys.exit(f"embedding failed {r.status_code}: {r.text[:200]}")
            emb = r.json()["data"]["voice_clone_embedding"]
            cache.write_text(json.dumps(emb))  # embedding of a synthetic reference voice; gitignored out/
        for n, it in enumerate(items):
            clean = audio / f"{it['id']}.wav"
            try:
                payload = clone_payload(it["text"], emb) if it["kind"] == "clone" else tts_payload(it["text"], it["voice"], it["tts_language"])
                if not clean.exists():
                    synth(client, key, payload, clean)
            except Exception as e:  # keep going, report at the end
                print(f"[{n}] {it['id']} FAILED: {e}", file=sys.stderr)
                continue
            base = {k: it[k] for k in ("id", "text", "language", "voice", "entities", "kind")}
            manifest.append(dict(base, variant="clean", file=str(clean.relative_to(OUT))))
            if not args.no_noise:
                noisy = audio / f"{it['id']}_noisy.wav"
                add_phone_noise(clean, noisy, seed=n)
                manifest.append(dict(base, variant="noisy", file=str(noisy.relative_to(OUT))))
            print(f"[{n + 1}/{len(items)}] {it['id']}")
    (audio / "manifest.json").write_text(json.dumps({"items": manifest}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(manifest)} manifest entries")


if __name__ == "__main__":
    main()
