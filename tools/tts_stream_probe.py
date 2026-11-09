"""Live probe: Timbre REST total time vs SSE time-to-first-chunk / total (6 real TTS calls, run sequentially).

  cd gateway && uv run python ../tools/tts_stream_probe.py [--rate 16000]

Key: GNANI_SPEECH_API_KEY, else `gnani_api_key` in repo-root .env.local. Never printed. Output: tools/out/tts_stream.json
"""
import argparse, asyncio, json, os, sys, time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from voice import tts  # noqa: E402

REST = "https://api.vachana.ai/api/v1/tts/inference"
LINES = {
    "en": ("en-IN", "Your next EMI of eleven thousand two hundred rupees is due on the fifth of December."),
    "hi": ("hi-IN", "आपकी अगली ईएमआई ग्यारह हज़ार दो सौ रुपये की है और पाँच दिसंबर को देय है।"),
    "mr": ("mr-IN", "तुमचा पुढचा हप्ता अकरा हजार दोनशे रुपयांचा आहे आणि पाच डिसेंबरला देय आहे."),
}


def key() -> str:
    if os.environ.get("GNANI_SPEECH_API_KEY"):
        return os.environ["GNANI_SPEECH_API_KEY"]
    for env in (ROOT / ".env.local", Path(r"D:\Work\Hackathons\gnani\loanloop\.env.local")):
        if env.exists():
            for ln in env.read_text(encoding="utf-8").splitlines():
                k, _, v = ln.partition("=")
                if k.strip().lower() == "gnani_api_key":
                    return v.strip().strip("\"'")
    sys.exit("no key")


async def main(rate: int):
    k, out = key(), []
    cfg = {**tts.RAW_CONFIG, "sample_rate": rate}
    async with httpx.AsyncClient() as h:
        for lang, (code, text) in LINES.items():
            base = {"text": text, "model": "timbre-v3.0", "voice": "Shivani", "language": code, "speed": 1.0}
            row = {"lang": lang, "chars": len(text)}
            t0 = time.perf_counter()
            try:
                r = await h.post(REST, headers={"X-API-Key-ID": k}, json={**base, "audio_config": {**cfg, "container": "wav"}}, timeout=60)
                r.raise_for_status()
                row["rest_total_ms"], row["rest_bytes"] = round((time.perf_counter() - t0) * 1000), len(r.content)
            except httpx.HTTPError as e:
                row["rest_error"] = type(e).__name__ + str(getattr(getattr(e, "response", None), "status_code", ""))
            t0, first, n, size = time.perf_counter(), None, 0, 0
            try:
                async for pcm in tts.stream_pcm(h, k, {**base, "audio_config": cfg}):
                    first = first if first is not None else round((time.perf_counter() - t0) * 1000)
                    n, size = n + 1, size + len(pcm)
                row.update(sse_first_ms=first, sse_total_ms=round((time.perf_counter() - t0) * 1000), sse_chunks=n, sse_bytes=size,
                           audio_seconds=round(size / 2 / rate, 2))
            except (httpx.HTTPError, tts.TTSError) as e:
                row["sse_error"] = type(e).__name__ + str(getattr(getattr(e, "response", None), "status_code", ""))
            out.append(row)
            print(row)
    (ROOT / "tools" / "out").mkdir(exist_ok=True)
    (ROOT / "tools" / "out" / "tts_stream.json").write_text(json.dumps({"rate": rate, "rows": out}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=int, default=16000)
    asyncio.run(main(ap.parse_args().rate))
