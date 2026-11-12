"""Weighted FAQ keyword scorer. Pure stdlib, no app imports: the gateway (faq_lookup `query`) and the voice service
(pre-route + grounding block, loaded by file path) share it.

A keyword's weight is the sum of its words' IDF over the intents (computed once per intent set), generic words count little,
multi-word phrases get a bonus. An intent's score is the sum of its matched keywords (a keyword inside another matched keyword is
dropped; the call language counts fully, other languages OTHER_LANG). Three outcomes, see `classify`.
"""
import math
import re
import unicodedata

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


# Beta scripts (bn, pa, gu, ta, te, kn, ml). Their spelling varies a lot in ASR text and keyword lists, and their inflection is suffixal,
# so text in them is folded (_fold) and matched by token prefix (_pm). Devanagari (hi/mr) and ASCII are untouched: core behaviour is unchanged.
_BETA = re.compile("[\u0980-\u0dff]")
_FOLD = {ord(c): None for c in "\u200c\u200d\u09bc\u0a3c\u0abc"}  # ZWNJ/ZWJ, nukta
_FOLD.update({ord(c): None for c in "\u0981\u0982\u0a01\u0a02\u0a70\u0a71\u0a81\u0a82\u0b82\u0c01\u0c02\u0c81\u0c82\u0d02"})  # chandrabindu/anusvara/tippi/addak
# ai/ee matra -> e matra, long ii/uu -> short i/u (one code point each, per script)
_FOLD.update({int(a, 16): int(b, 16) for a, b in (
    ("09c8", "09c7"), ("0a48", "0a47"), ("0ac8", "0ac7"), ("0bc7", "0bc6"), ("0bc8", "0bc6"), ("0c47", "0c46"), ("0c48", "0c46"),
    ("0cc7", "0cc6"), ("0cc8", "0cc6"), ("0d47", "0d46"), ("0d48", "0d46"),
    ("09c0", "09bf"), ("09c2", "09c1"), ("0a40", "0a3f"), ("0a42", "0a41"), ("0ac0", "0abf"), ("0ac2", "0ac1"), ("0bc0", "0bbf"), ("0bc2", "0bc1"),
    ("0c40", "0c3f"), ("0c42", "0c41"), ("0cc0", "0cbf"), ("0cc2", "0cc1"), ("0d40", "0d3f"), ("0d42", "0d41"))})
_LAT_BETA = re.compile(r"(?<=[a-z0-9])-?(?=[ঀ-෿])|(?<=[ঀ-෿])-?(?=[a-z0-9])")
PREFIX = 0.8     # weight of a keyword whose content tokens all match question tokens only by prefix
PREFIX_ONE = 0.5  # ...and for a keyword with a single content token (one inflected word is weak evidence)
BETA_RATIO = 0.6  # beta-script questions: the runner-up may score at most this share of the top, else the top is a near-neighbour tie (its coverage is zeroed, so classify says medium)
PREFIX_MIN = 4   # shared leading characters needed (a shorter keyword token must be a prefix of the question token)


def norm(s: str) -> str:
    s = s.lower().replace("’", "'")
    if _BETA.search(s):
        s = _LAT_BETA.sub(" ", unicodedata.normalize("NFC", s).translate(_FOLD))  # "imps-এর" -> "imps এর": a Latin word and its suffix are two tokens
    return re.sub(r"\s+", " ", s).strip()


def _pm(kt: str, qt: str) -> bool:
    """Does keyword token kt match question token qt? Beta-script tokens by prefix (inflection), everything else exactly (after _stem)."""
    if kt == qt:
        return True
    if not _BETA.search(kt):
        return _stem(kt) == _stem(qt)
    n = min(len(kt), PREFIX_MIN)
    return qt.startswith(kt) or (len(kt) >= PREFIX_MIN and qt[:n] == kt[:n])


STOP = GENERIC | frozenset({
    "i", "me", "we", "you", "your", "it", "this", "that", "there", "does", "did", "will", "would", "should", "could", "have", "has", "had", "am",
    "are", "was", "be", "get", "got", "and", "or", "if", "when", "where", "why", "which", "who", "with", "from", "at", "as", "by", "any", "so",
    "please", "tell", "want", "need", "difference", "between", "versus", "vs", "explain", "mean", "means", "meaning", "english", "hinglish", "hindi", "marathi", "हिंदी", "मराठी", "मराठीत", "about", "after", "before", "into", "than", "then", "also", "just", "still", "some", "one", "much", "many",
    "kaun", "kaunse", "kyun", "kya", "par", "pe", "aur", "ya", "toh", "to", "bhi", "nahi", "koi", "mujhe", "hum", "aap", "ap", "kitna", "kitni",
    "मैं", "मुझे", "और", "या", "में", "से", "को", "पर", "भी", "नहीं", "कोई", "कितना", "कितनी", "कब", "कहाँ", "कौन", "मला", "आणि", "किंवा", "मध्ये", "नाही", "कोणती", "कुठे", "कधी",
})
_extra_beta: frozenset = frozenset()  # the beta-script ones of those that are STOP_PREFIX_MIN+ long: inflected forms count too
STOP_PREFIX_MIN = 4
_extra: frozenset = frozenset()  # words.stopwords of the loaded language files: added to GENERIC and STOP, never replacing them


def set_extra_stopwords(words) -> None:
    """Language files' stopwords (single words). The caller (gateway faq loader / voice load_languages) passes them on every reload."""
    global _extra, _extra_beta
    new = frozenset(norm(w) for w in words if isinstance(w, str) and w.strip())
    if new != _extra:
        _extra = new
        _extra_beta = frozenset(w for w in new if len(w) >= STOP_PREFIX_MIN and _BETA.search(w))
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
            ct = [t for t in toks if t not in GENERIC and t not in _extra] or toks
            pref = tuple(ct) if not ascii_ and _BETA.search(kn) else None  # beta scripts: order-free prefix match of the content tokens
            self.rows.append((iid, lg, kn, w, rx, stems, toks, pref))
        self._by_stem: dict[str, list[int]] = {}  # loose-match rows by each distinct stem / prefix token, and how many they need
        self._by_ptok: dict[str, list[int]] = {}
        self._need: dict[int, int] = {}
        for i, r in enumerate(self.rows):
            for ix, units in ((self._by_stem, r[5]), (self._by_ptok, r[7])):
                if units:
                    self._need[i] = len(set(units))
                    for u in set(units):
                        ix.setdefault(u, []).append(i)
        # token index for the prefix rows, so a query token finds its matching keyword tokens by lookup instead of scanning every row
        ptoks = {k for r in self.rows if r[7] for k in r[7]}
        self._p4: dict[str, list[str]] = {}
        self._stem_ix: dict[str, list[str]] = {}
        for k in ptoks:
            if _BETA.search(k):
                if len(k) >= PREFIX_MIN:
                    self._p4.setdefault(k[:PREFIX_MIN], []).append(k)
            else:
                self._stem_ix.setdefault(_stem(k), []).append(k)
        self._ptoks = ptoks

    def _matched(self, qt: list[str]) -> set[str]:
        """Prefix-row tokens k with some question token t such that _pm(k, t)."""
        out = set()
        for t in qt:
            out.update(t[:j] for j in range(1, len(t) + 1) if t[:j] in self._ptoks)  # k is a prefix of t (or equal)
            out.update(self._p4.get(t[:PREFIX_MIN], ()))  # k and t share their first PREFIX_MIN chars
            out.update(self._stem_ix.get(_stem(t), ()))   # non-beta token: equal stems
        return out

    def rank(self, query: str, lang: str) -> list[tuple[str, float, float]]:
        """[(intent id, score, coverage)] best first, only intents with a match. coverage = share of the question's content words
        that the intent's matched keywords contain."""
        q = norm(query)
        qt = _WORD.findall(q)
        qs = {_stem(t) for t in qt}
        hit: dict[str, dict[str, tuple[float, list]]] = {}
        pm = self._matched(qt)
        def add(row, f):
            iid, lg, kn, w, _, _, toks, _ = row
            d = hit.setdefault(iid, {})
            m = w * f * (1.0 if lg == lang else OTHER_LANG)
            if m > d.get(kn, (0, 0))[0]:
                d[kn] = (m, toks)

        exact = set()
        for i, row in enumerate(self.rows):
            if row[2] in q and (row[4].search(q) if row[4] else True):  # the regex only adds a word-boundary/suffix check on top of the substring
                add(row, 1.0)
                exact.add(i)
        for ix, f, keys in ((self._by_stem, SCATTER, qs), (self._by_ptok, PREFIX, pm)):
            seen: dict[int, int] = {}  # loose match = every distinct unit (stem / prefix token) of the row is in the question; count via the index
            for k in keys:
                for i in ix.get(k, ()):
                    seen[i] = seen.get(i, 0) + 1
            for i, n in seen.items():
                if n == self._need[i] and i not in exact:
                    add(self.rows[i], PREFIX_ONE if f == PREFIX and len(self.rows[i][7]) == 1 else f)
        content = [t for t in qt if t not in STOP and t not in _extra and not (_extra_beta and _BETA.search(t) and any(t[:j] in _extra_beta for j in range(STOP_PREFIX_MIN, len(t) + 1)))]
        out = []
        for iid, d in hit.items():
            keep = {kn: v for kn, v in d.items() if not any(kn != o and kn in o for o in d)}
            words = {_stem(t) for _, toks in keep.values() for t in toks}
            kts = {t for _, toks in keep.values() for t in toks if _BETA.search(t)}
            cov = sum(1 for t in content if _stem(t) in words or any(t in kn for kn in keep) or (_BETA.search(t) and any(_pm(k, t) for k in kts))) / len(content) if content else 1.0
            out.append((iid, sum(v[0] for v in keep.values()), cov))
        out.sort(key=lambda x: -x[1])
        if _BETA.search(q) and len(out) > 1 and out[1][1] > BETA_RATIO * out[0][1]:
            out[0] = (out[0][0], out[0][1], 0.0)
        return out


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
