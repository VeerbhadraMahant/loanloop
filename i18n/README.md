# Languages (contract for the 7 new Gnani languages, 2026-11-10)

Existing modes stay in code: `en`, `hi`, `hinglish`, `mr`. New: `bn` Bengali, `gu` Gujarati, `kn` Kannada,
`ml` Malayalam, `pa` Punjabi, `ta` Tamil, `te` Telugu. All 10 are Gnani Prisma STT + Timbre TTS languages.
New languages are **beta**: machine-written, no native review yet.

## Files
- `i18n/languages.json`: registry of all 11 modes (code, English name, native name, script, Gnani STT code, Gnani TTS code, beta flag). Coordinator-owned.
- `i18n/<code>.json`: one file per new language. One translator owns each file. Format below.
- `i18n/source/`: English source to translate (`gateway_templates.json`, `faq.json`, `voice_reference.json`). Regenerate with `cd gateway && uv run python ../tools/i18n_export.py`.

## `i18n/<code>.json` format
```json
{
  "lang": "ta",
  "months": ["ஜனவரி", "... 12 month names, in order"],
  "gateway": {"<every key in source/gateway_templates.json>": "translation, SAME {placeholders} exactly"},
  "faq": {"<every intent id in source/faq.json>": {"keywords": ["4-10 short phrases, native script, plus common English loan words callers mix in"],
                                                  "answer": "1-3 short spoken sentences", "sms_text": "full detail, only when sms is true"}},
  "voice": {
    "REPROMPT": "", "LANG_OK": "Sure, I will continue in <language>. How can I help you?", "CUSTOMER_Q": "", "SAFE": "",
    "ASK": ["Please tell me the {x}.", " and the "],
    "FIELD_LABEL": {"<same keys as voice_reference FIELD_LABEL.en>": ""}
  },
  "words": {
    "lang_names": ["how a caller names this language: native script + romanised, e.g. tamil, தமிழ், tamizh"],
    "affirm": ["yes / correct / right / ok words"], "negate": ["no / wrong / cancel words"], "bye": ["goodbye words"], "thanks": ["thank-you words: single words, native script + romanised"],
    "approval": ["approved / done / I tapped it"], "switch_cues": ["speak / talk / in (as in 'speak in Tamil')"],
    "month_words": {"<month word as spoken>": 1}, "weekdays": {"<weekday word>": 0},
    "question": ["how / what / why / when / can / does"], "possessive": ["my / mine"],
    "acct_nouns": ["EMI, balance, loan, payment, dues, account, number... in this language"],
    "human_target": ["human / person / agent / officer"], "human_verb": ["talk / speak / connect"],
    "neg_human": ["not / don't"], "full": ["full / entire / whole amount"], "multi": ["and / also"],
    "date": ["date"], "verify": ["birth / born / mobile / number"],
    "already_paid": ["phrases meaning 'I already paid'"], "action_verbs": ["update / change / close / send / cancel / block"]
  }
}
```

## Rules for translators
- Keep every `{placeholder}` exactly as in the English source; never translate or drop one. Numbers, amounts, dates and masked values come in through placeholders.
- Spoken text: short, polite, natural phone-banking register of that language, not word-by-word. Neutral agent gender where the grammar allows.
- Bank name stays "Sahyadri Bank" (transliterate if natural). Keep "EMI", "IFSC", "UPI", "OTP", "PIN", "KYC" as commonly said (native script transliteration is fine).
- Security meaning must survive exactly: the bank never asks for OTP/PIN/password; details go only by SMS to the registered number; no promises, waivers or settlements.
- Collections lines (dues, PTP, RTP): firm and respectful, never threatening.
- Words lists are lowercase for Latin script; include both native script and common romanised forms.
