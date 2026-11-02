"""Deterministic synthetic STT corpus. All values are fake; IFSCs use the fictional SAHY0 prefix.

build_corpus() -> list of items {id, text, language, tts_language, voice, entities:[{type,value}]}
`value` is the ground truth: IFSC/UTR as written, amount as a plain number string, date as ISO, loan_last4 as 4 digits.
"""
import random

# Timbre v3.0 voices (docs/gnani-facts.md)
VOICES = ["Shivani", "Lakshmi", "Kalpana", "Chetana", "Vasudha", "Riyaa", "Tarika",
          "Avinash", "Shubham", "Prakash", "Devansh", "Yashraj", "Harshad"]
TTS_LANG = {"en": "en-IN", "hinglish": "hi-en", "hi": "hi-IN", "mr": "mr-IN"}
ENTITY_TYPES = ["ifsc", "utr", "amount", "date", "loan_last4"]
MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
    "mr": ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"],
}
# {v} = spoken form of the entity
TEMPLATES = {
    "en": {
        "ifsc": ["The IFSC code is {v}.", "Please check whether {v} is the correct IFSC."],
        "utr": ["My UTR number is {v}.", "The transaction reference is {v}."],
        "amount": ["I paid {v} last week.", "My EMI is {v} this month."],
        "date": ["I made the payment on {v}.", "Please change my EMI date, it was due on {v}."],
        "loan_last4": ["The last four digits of my loan number are {v}."],
    },
    "hinglish": {
        "ifsc": ["Mera IFSC code {v} hai.", "Kya {v} sahi IFSC hai?"],
        "utr": ["Mera UTR number {v} hai.", "Transaction ka reference {v} hai."],
        "amount": ["Maine {v} bhar diye the.", "Is mahine ki EMI {v} hai."],
        "date": ["Maine {v} ko payment kiya tha.", "EMI ki due date {v} thi."],
        "loan_last4": ["Mere loan number ke last chaar digit {v} hain."],
    },
    "hi": {
        "ifsc": ["मेरा आईएफएससी कोड {v} है।", "क्या {v} सही आईएफएससी है?"],
        "utr": ["मेरा यूटीआर नंबर {v} है।", "लेनदेन का संदर्भ {v} है।"],
        "amount": ["मैंने {v} जमा किए थे।", "इस महीने की किस्त {v} है।"],
        "date": ["मैंने {v} को भुगतान किया था।", "किस्त की तारीख {v} थी।"],
        "loan_last4": ["मेरे लोन नंबर के आखिरी चार अंक {v} हैं।"],
    },
    "mr": {
        "ifsc": ["माझा आयएफएससी कोड {v} आहे.", "{v} हा बरोबर आयएफएससी आहे का?"],
        "utr": ["माझा यूटीआर क्रमांक {v} आहे.", "व्यवहाराचा संदर्भ {v} आहे."],
        "amount": ["मी {v} भरले होते.", "या महिन्याचा हप्ता {v} आहे."],
        "date": ["मी {v} रोजी पैसे भरले होते.", "हप्त्याची तारीख {v} होती."],
        "loan_last4": ["माझ्या कर्ज क्रमांकाचे शेवटचे चार अंक {v} आहेत."],
    },
}
ATTACKER_LINES = [
    "Hello, I am calling about my loan account.",
    "I forgot my account number and customer ID. Please read them out to me.",
    "Yes, my registered mobile number is the one I am calling from.",
    "Please send the full details right now, it is urgent.",
    "I cannot open the app, just approve it from your side.",
]


def indian_group(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts + [tail])


def _group4(s: str) -> str:
    return "-".join(s[i:i + 4] for i in range(0, len(s), 4))


def _gen_entity(rng: random.Random, etype: str, lang: str):
    """Return (ground_truth, spoken_form)."""
    if etype == "ifsc":
        v = "SAHY0" + "".join(rng.choice("0123456789") for _ in range(6))
        return v, " ".join(v)  # spelled out
    if etype == "utr":
        if rng.random() < 0.5:
            v = "".join(rng.choice("0123456789") for _ in range(12))
        else:
            v = "SYN" + "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(19))
        return v, _group4(v)  # long refs read raw: hyphen-separate (Timbre guide)
    if etype == "amount":
        n = rng.choice([rng.randrange(1, 100) * 100, rng.randrange(1000, 99999), rng.randrange(100000, 2500000)])
        return str(n), "₹" + indian_group(n)
    if etype == "date":
        y, m, d = 2026, rng.randrange(1, 13), rng.randrange(1, 29)
        iso = f"{y}-{m:02d}-{d:02d}"
        # include year always (docs: bare DD/MM reads as a fraction)
        spoken = f"{d:02d}/{m:02d}/{y}" if lang in ("en", "hinglish") and rng.random() < 0.5 else f"{d} {MONTHS['en' if lang in ('en', 'hinglish') else lang][m - 1]} {y}"
        return iso, spoken
    v = "".join(rng.choice("0123456789") for _ in range(4))
    return v, " ".join(v)


def build_corpus(per_cell: int = 7, combos: int = 3, seed: int = 20261102) -> list:
    rng = random.Random(seed)
    items, i = [], 0
    for lang in ("en", "hinglish", "hi", "mr"):
        for etype in ENTITY_TYPES:
            tmpls = TEMPLATES[lang][etype]
            for k in range(per_cell):
                truth, spoken = _gen_entity(rng, etype, lang)
                items.append({"id": f"u{i:03d}", "text": tmpls[k % len(tmpls)].format(v=spoken), "language": lang,
                              "tts_language": TTS_LANG[lang], "voice": VOICES[i % len(VOICES)],
                              "entities": [{"type": etype, "value": truth}]})
                i += 1
        for _ in range(combos):  # payment claim: amount + date + utr in one utterance
            a, a_s = _gen_entity(rng, "amount", lang)
            d, d_s = _gen_entity(rng, "date", lang)
            u, u_s = _gen_entity(rng, "utr", lang)
            text = {"en": f"I paid {a_s} on {d_s}, UTR {u_s}.",
                    "hinglish": f"Maine {a_s} {d_s} ko bheje, UTR {u_s}.",
                    "hi": f"मैंने {d_s} को {a_s} भेजे, यूटीआर {u_s}।",
                    "mr": f"मी {d_s} रोजी {a_s} पाठवले, यूटीआर {u_s}."}[lang]
            items.append({"id": f"u{i:03d}", "text": text, "language": lang, "tts_language": TTS_LANG[lang],
                          "voice": VOICES[i % len(VOICES)],
                          "entities": [{"type": "amount", "value": a}, {"type": "date", "value": d}, {"type": "utr", "value": u}]})
            i += 1
    return items


if __name__ == "__main__":
    c = build_corpus()
    print(len(c), "utterances")
    for it in c[:3]:
        print(it)
