"""Weighted FAQ keyword scorer. Pure stdlib, no app imports: the gateway (faq_lookup `query`) and the voice service
(pre-route + grounding block, loaded by file path) share it.

A keyword's weight is the sum of its words' IDF over the intents (computed once per intent set), generic words count little,
multi-word phrases get a bonus. An intent's score is the sum of its matched keywords (a keyword inside another matched keyword is
dropped; the call language counts fully, other languages OTHER_LANG). Three outcomes, see `classify`.
"""
import math
import re

HIGH_MIN = 4.0      # top score needed to answer without the LLM
HIGH_MARGIN = 2.0   # and the lead over the 2nd intent
COVER_MIN = 0.5    # and the share of the question's content words the matched keywords account for
MED_MIN = 1.2       # below this: no FAQ at all
OTHER_LANG = 0.6    # weight of a keyword written for another language than the call's
PHRASE_BONUS = 0.25  # per extra word in a keyword
GENERIC_W = 0.15
GENERIC = frozenset({
    "account", "accounts", "loan", "card", "money", "help", "payment", "bank", "banking", "my", "the", "a", "an", "to", "of", "for",
    "in", "on", "is", "do", "i", "how", "what", "can", "not", "no", "new", "number", "amount", "mobile", "me", "kya", "hai", "ka", "ki",
    "ke", "karna", "karne", "kaise", "mera", "meri", "mere", "paisa", "paise", "khata", "खाता", "खाते", "बैंक", "बँक", "कार्ड", "लोन",
    "गया", "गई", "गयी", "हूँ", "हो", "gaya", "gayi", "ho", "kar", "karo", "karun", "kare", "mein", "se", "ko", "ne", "ka", "kab", "hota", "hoga", "सकता", "सकते", "शकतो", "आहे", "का", "पैसे", "पैसा", "कैसे", "क्या", "कसे", "का", "की", "के", "है", "मेरा", "मेरी", "माझे", "माझा", "खाते", "पैसे", "बँकेत",
})
_WORD = re.compile(r"[^\s.,?!;:\"()\[\]]+")
_ASCII = re.compile(r"^[ -~]+$")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().replace("’", "'")).strip()


STOP = GENERIC | frozenset({
    "i", "me", "we", "you", "your", "it", "this", "that", "there", "does", "did", "will", "would", "should", "could", "have", "has", "had", "am",
    "are", "was", "be", "get", "got", "and", "or", "if", "when", "where", "why", "which", "who", "with", "from", "at", "as", "by", "any", "so",
    "please", "tell", "want", "need", "difference", "between", "versus", "vs", "explain", "mean", "means", "meaning", "english", "hinglish", "hindi", "marathi", "हिंदी", "मराठी", "मराठीत", "about", "after", "before", "into", "than", "then", "also", "just", "still", "some", "one", "much", "many",
    "kaun", "kaunse", "kyun", "kya", "par", "pe", "aur", "ya", "toh", "to", "bhi", "nahi", "koi", "mujhe", "hum", "aap", "ap", "kitna", "kitni",
    "मैं", "मुझे", "और", "या", "में", "से", "को", "पर", "भी", "नहीं", "कोई", "कितना", "कितनी", "कब", "कहाँ", "कौन", "मला", "आणि", "किंवा", "मध्ये", "नाही", "कोणती", "कुठे", "कधी",
})
_extra: frozenset = frozenset()  # words.stopwords of the loaded language files: added to GENERIC and STOP, never replacing them


def set_extra_stopwords(words) -> None:
    """Language files' stopwords (single words). The caller (gateway faq loader / voice load_languages) passes them on every reload."""
    global _extra
    new = frozenset(norm(w) for w in words if isinstance(w, str) and w.strip())
    if new != _extra:
        _extra = new
        _tables.clear()


SCATTER = 0.7  # a keyword whose words all appear in the question, not next to each other


def _stem(t: str) -> str:
    for suf in ("ing", "es", "ed", "s"):
        if len(t) > len(suf) + 2 and t.endswith(suf):
            return t[: -len(suf)]
    return t


class Table:
    """Precomputed keyword rows for one intent set: (intent id, language, keyword, weight, regex, stems, tokens)."""

    def __init__(self, intents: dict[str, dict]):
        df: dict[str, set] = {}
        raw = []
        for iid, it in intents.items():
            for lg, ks in (it.get("keywords") or {}).items():
                for k in ks:
                    kn = norm(k)
                    if kn:
                        toks = _WORD.findall(kn)
                        raw.append((iid, lg, kn, toks))
                        for t in toks:
                            df.setdefault(t, set()).add(iid)
        n = max(1, len(intents))
        idf = {t: math.log(1 + n / len(s)) for t, s in df.items()}
        self.rows = []
        for iid, lg, kn, toks in raw:
            w = sum(idf[t] * (GENERIC_W if t in GENERIC or t in _extra else 1.0) for t in toks) * (1 + PHRASE_BONUS * (len(toks) - 1))
            ascii_ = bool(_ASCII.match(kn))
            suffix = r"[a-z]*" if len(toks[-1]) >= 4 else r"(?:s|es|ed|d|ing)?(?![a-z0-9])"  # "khol" -> "kholna", "scam" -> "scammed"; short words stay exact
            rx = re.compile(r"(?<![a-z0-9])" + re.escape(kn) + suffix) if ascii_ else None
            stems = tuple(_stem(t) for t in toks) if ascii_ and sum(t not in GENERIC and t not in _extra for t in toks) > 1 else None  # scatter needs 2+ distinctive words
            self.rows.append((iid, lg, kn, w, rx, stems, toks))

    def rank(self, query: str, lang: str) -> list[tuple[str, float, float]]:
        """[(intent id, score, coverage)] best first, only intents with a match. coverage = share of the question's content words
        that the intent's matched keywords contain."""
        q = norm(query)
        qt = _WORD.findall(q)
        qs = {_stem(t) for t in qt}
        hit: dict[str, dict[str, tuple[float, list]]] = {}
        for iid, lg, kn, w, rx, stems, toks in self.rows:
            if (rx.search(q) if rx else kn in q):
                f = 1.0
            elif stems and all(t in qs for t in stems):
                f = SCATTER
            else:
                continue
            d = hit.setdefault(iid, {})
            m = w * f * (1.0 if lg == lang else OTHER_LANG)
            if m > d.get(kn, (0, 0))[0]:
                d[kn] = (m, toks)
        content = [t for t in qt if t not in STOP and t not in _extra]
        out = []
        for iid, d in hit.items():
            keep = {kn: v for kn, v in d.items() if not any(kn != o and kn in o for o in d)}
            words = {_stem(t) for _, toks in keep.values() for t in toks}
            cov = sum(1 for t in content if _stem(t) in words or any(t in kn for kn in keep)) / len(content) if content else 1.0
            out.append((iid, sum(v[0] for v in keep.values()), cov))
        return sorted(out, key=lambda x: -x[1])


_tables: dict[int, tuple[dict, Table]] = {}


def table_for(intents: dict[str, dict]) -> Table:
    """One Table per intents dict object (load_faq returns the same dict until a file changes)."""
    hit = _tables.get(id(intents))
    if hit is None or hit[0] is not intents:
        _tables.clear()
        hit = _tables[id(intents)] = (intents, Table(intents))
    return hit[1]


def classify(ranked: list[tuple[str, float, float]], high_min: float = HIGH_MIN, margin: float = HIGH_MARGIN, med_min: float = MED_MIN,
             cover_min: float = COVER_MIN) -> tuple[str, str | None]:
    """('high', id): answer directly. ('medium', id): the LLM answers with the FAQ block. ('low', None): no FAQ."""
    if not ranked or ranked[0][1] < med_min:
        return "low", None
    s1, cov = ranked[0][1], ranked[0][2]
    s2 = ranked[1][1] if len(ranked) > 1 else 0.0
    return ("high" if s1 >= high_min and s1 - s2 >= margin and cov >= cover_min else "medium"), ranked[0][0]
