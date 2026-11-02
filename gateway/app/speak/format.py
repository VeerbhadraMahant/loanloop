from datetime import date

MONTHS = {
    "en": "January February March April May June July August September October November December".split(),
    "hinglish": "January February March April May June July August September October November December".split(),
    "hi": "जनवरी फ़रवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर अक्टूबर नवंबर दिसंबर".split(),
    "mr": "जानेवारी फेब्रुवारी मार्च एप्रिल मे जून जुलै ऑगस्ट सप्टेंबर ऑक्टोबर नोव्हेंबर डिसेंबर".split(),
}


def rupees(n: int | float) -> str:
    """₹2,50,000 (Indian grouping); paise only when non-zero. Gnani TTS reads this natively."""
    n = round(float(n), 2)
    whole, paise = int(n), round((n - int(n)) * 100)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return f"₹{s}" + (f".{paise:02d}" if paise else "")


def fmt_date(d: date, lang: str = "en") -> str:
    """DD Month YYYY with month name (never DD/MM alone: TTS reads it as a fraction)."""
    return f"{d.day} {MONTHS.get(lang, MONTHS['en'])[d.month - 1]} {d.year}"


def digits(s: str, group: int = 2) -> str:
    """Space-group digits for speech: '4417' -> '44 17'."""
    s = "".join(s.split())
    return " ".join(s[i : i + group] for i in range(0, len(s), group))
