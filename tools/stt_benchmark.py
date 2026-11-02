"""Prisma v3 entity benchmark: exact-match per entity type, with vs without keyterms.

  uv run python tools/stt_benchmark.py --dry-run
  GNANI_SPEECH_API_KEY=... uv run python tools/stt_benchmark.py [--limit N]

Input: tools/out/audio/manifest.json (from make_test_audio.py).
Output: tools/out/stt_benchmark.json  {rows:[{entity, with_keyterms, without_keyterms, n}]}  (rates 0..1)
        tools/out/stt_benchmark.csv   per item/entity.
"""
import argparse, csv, json, os, re, sys, time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from stt_corpus import MONTHS  # noqa: E402

OUT = Path(__file__).parent / "out"
KEYTERMS_FILE = Path(__file__).parent.parent / "agent" / "keyterms.txt"
STT_URL = "https://api.vachana.ai/stt/v3"
LANG_HINT = {"en": "en-IN", "hinglish": "hi-IN,en-IN", "hi": "hi-IN,en-IN", "mr": "mr-IN,en-IN"}

# ---------- pure scoring (no network; unit-tested) ----------
_DEV = str.maketrans("०१२३४५६७८९", "0123456789")
_MONTH = {}
for _lang, _names in MONTHS.items():
    for _i, _n in enumerate(_names, 1):
        _MONTH[_n.lower()] = _i
        if _lang == "en":
            _MONTH[_n[:3].lower()] = _i
_MONTH.update({"सितम्बर": 9, "फरवरी": 2})  # common spelling variants


def ascii_digits(s: str) -> str:
    return s.translate(_DEV)


def compact(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", ascii_digits(s).upper())


def numbers_in(s: str) -> set:
    out = set()
    for m in re.findall(r"\d[\d,]*(?:\.\d+)?", ascii_digits(s)):
        m = m.replace(",", "").rstrip(".")
        try:
            out.add(float(m))
        except ValueError:
            pass
    return out


def dates_in(s: str) -> set:
    s = ascii_digits(s).lower()
    out = set()
    for d, m, y in re.findall(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b", s):
        out.add(f"{y}-{int(m):02d}-{int(d):02d}")
    for d, name, y in re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([^\s\d,/.\-]+)[,\s]+(\d{4})", s):
        if name in _MONTH:
            out.add(f"{y}-{_MONTH[name]:02d}-{int(d):02d}")
    for name, d, y in re.findall(r"([^\s\d,/.\-]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", s):
        if name in _MONTH:
            out.add(f"{y}-{_MONTH[name]:02d}-{int(d):02d}")
    return out


def entity_match(etype: str, truth: str, transcript: str) -> bool:
    """Exact match after normalisation. shortcut: spelled-out words ('double four', 'lakh') are not parsed, so they count as misses."""
    if etype in ("ifsc", "utr"):
        return compact(truth) in compact(transcript)
    if etype == "amount":
        return float(truth) in numbers_in(transcript)
    if etype == "date":
        return truth in dates_in(transcript)
    if etype == "loan_last4":
        return truth in re.sub(r"\D", "", ascii_digits(transcript))
    raise ValueError(etype)


def aggregate(results: list) -> dict:
    """results: [{entity, with_ok, without_ok}] -> {rows:[{entity, with_keyterms, without_keyterms, n}]}"""
    by = defaultdict(list)
    for r in results:
        by[r["entity"]].append(r)
    rows = [{"entity": e, "with_keyterms": round(sum(x["with_ok"] for x in v) / len(v), 4),
             "without_keyterms": round(sum(x["without_ok"] for x in v) / len(v), 4), "n": len(v)} for e, v in sorted(by.items())]
    return {"rows": rows}


# ---------- network ----------
def load_keyterms():
    return [l.strip() for l in KEYTERMS_FILE.read_text(encoding="utf-8").splitlines() if l.strip()][:200]


def stt(client, key, wav: Path, lang: str, keyterms, mode_state: dict):
    """keyterms wire format is not spelled out in the docs: try a JSON-encoded list, fall back to comma-separated."""
    def once(kt_mode):
        data = {"model": "prisma-v3.0", "language_code": LANG_HINT[lang], "format": "transcribe"}
        if keyterms:
            data["keyterms"] = json.dumps(keyterms, ensure_ascii=False) if kt_mode == "json" else ",".join(keyterms)
        for delay in (0.5, 1, 2, None):
            with open(wav, "rb") as f:
                r = client.post(STT_URL, headers={"X-API-Key-ID": key}, data=data, files={"audio_file": (wav.name, f, "audio/wav")}, timeout=60)
            if r.status_code not in (429, 500, 503, 504) or delay is None:
                return r
            time.sleep(delay)
    r = once(mode_state["kt"])
    if keyterms and r.status_code in (400, 422) and mode_state["kt"] == "json":
        r2 = once("csv")
        if r2.status_code == 200:
            mode_state["kt"] = "csv"
            return r2
    return r


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp1252 consoles
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    manifest_path = OUT / "audio" / "manifest.json"
    items = json.loads(manifest_path.read_text(encoding="utf-8"))["items"] if manifest_path.exists() else []
    items = [i for i in items if i["entities"]]
    if args.limit:
        items = items[:args.limit]
    kt = load_keyterms()
    print(f"{len(items)} clips x 2 runs (with/without {len(kt)} keyterms); manifest {'found' if items else 'missing - run make_test_audio.py first'}")
    if args.dry_run:
        print("dry-run: no requests sent")
        return
    key = os.environ.get("GNANI_SPEECH_API_KEY")
    if not key or not items:
        sys.exit("need GNANI_SPEECH_API_KEY and a manifest")
    import httpx

    results, state = [], {"kt": "json"}
    with httpx.Client() as client, open(OUT / "stt_benchmark.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "variant", "language", "entity", "truth", "with_keyterms_ok", "without_keyterms_ok", "transcript_with", "transcript_without"])
        for n, it in enumerate(items):
            wav = OUT / it["file"]
            tr = {}
            for name, terms in (("with", kt), ("without", None)):
                r = stt(client, key, wav, it["language"], terms, state)
                tr[name] = r.json().get("transcript", "") if r.status_code == 200 else ""
                if r.status_code != 200:
                    print(f"{it['id']} {name}: HTTP {r.status_code} {r.text[:120]}", file=sys.stderr)
            for e in it["entities"]:
                ok_w, ok_wo = entity_match(e["type"], e["value"], tr["with"]), entity_match(e["type"], e["value"], tr["without"])
                results.append({"entity": e["type"], "with_ok": ok_w, "without_ok": ok_wo})
                w.writerow([it["id"], it["variant"], it["language"], e["type"], e["value"], int(ok_w), int(ok_wo), tr["with"], tr["without"]])
            print(f"[{n + 1}/{len(items)}] {it['id']}")
    agg = aggregate(results)
    agg["keyterms_wire_format"] = state["kt"]
    (OUT / "stt_benchmark.json").write_text(json.dumps(agg, indent=1), encoding="utf-8")
    print(json.dumps(agg["rows"], indent=1))


if __name__ == "__main__":
    main()
