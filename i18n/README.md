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

## Newer `words` keys (shortcuts that were English/Hindi/Marathi only)
Added so a beta language takes the same fast path as the core four. Every key is **optional**: `python tools/i18n_check.py` prints
`warning:` for a missing one (the call still works, the shortcut just does not fire in that language) and an error for a malformed one.
Values are merged ADDITIVELY with the built-in en/hi/mr words at load time; they never replace them. English reference values for the
token lists and `faq_cues` / `topics` / `INTENT` are in `source/voice_reference.json` (`PHRASE_PATTERNS` shows the regex behind each phrase key).
**Token** = one word per entry, no spaces (same tokenizer as the other lists). **Phrase** = may hold several words, matched as a substring of the lowercased sentence.
Romanised entries shorter than 4 letters are ignored (they would hijack core-language turns); native-script entries have no minimum.

| key | token / phrase | meaning, English examples | feeds |
|---|---|---|---|
| `why` | token | why / because-of-what: why, kyun, karan | "why did my EMI go up" shortcut (`fallback_action`) |
| `went_up` | token | increased: increased, went up, hike, badha | same shortcut |
| `change_cue` | token | change / move / shift: change, shift, move, badal | "change my EMI date" shortcut |
| `emi_words` | token | the word for EMI / instalment as callers say it: emi, ईएमआय | both EMI shortcuts above |
| `about_secret` | token | words that make a sentence ABOUT a secret, not a disclosure: how, why, reset, forgot, never, someone | `secret_spoken`: "how do I reset my OTP" goes to the FAQ instead of being blocked. Only used when there are no digits in the sentence |
| `big_number_words` | token | magnitude words after a number: thousand, lakh, k | `parse_amount` refuses "5 lakh" and asks again instead of guessing |
| `approval_done` | token | "I did it": done, did, tapped (used with an `approval` word) | `claims_approved` |
| `today_words` / `tomorrow_words` | token | today / tomorrow: today, aaj / tomorrow, kal | `parse_spoken_date` |
| `stopwords` | token | very common function words (the, is, of, my, what) | FAQ keyword scoring (voice and gateway `faq_score`) |
| `txn` | phrase | "last transactions", "mini statement", "recent transactions" | `last_txn_count` |
| `general_topics` | phrase | general-process topics answered from the FAQ even with "my account": fraud, scam, deceased, dormant, KYC, missed EMI, bounce, complaint, block card | `account_specific`, `tool_owned` |
| `tool_owned` | phrase | questions a tool answers, never the FAQ: "my balance", "my emi how much", "last transactions", "already paid", "close my loan", "my ifsc" | `tool_owned` |
| `self_claim` | phrase | "I am the manager / an officer": a claim, not a request for a human | `wants_human` |
| `prompt_leak` | phrase | asking for the system prompt / instructions / tool list, or "ignore previous instructions" | prompt-extraction guard (`_LEAK`, `_INJECT`) |
| `topics` | object, values phrase lists | `{topic: [phrases]}` for topics `branch emi dues balance txn sms f_open f_minbal f_kyc f_upi f_card f_neft f_fraud f_cheque`; English: branch -> ifsc, address, timing; emi -> emi, instalment, due date; balance -> balance; f_kyc -> kyc | `multi_request`: "and" inside ONE topic is still one request |
| `intent_cues` | object, values phrase lists | `{group: [phrases]}` for `closure` (close, foreclose), `document` (statement, certificate), `emi_change` (why, went up), `nominee`, `address`: what the caller said that points at a held action | `intent_ok` (auto-retry of a held action) |
| `faq_cues` | object, values token lists | `{ask, bank, upi, collect, card}`: ask = asks/asked; bank = bank; upi = upi; collect = receive/collect/someone/money; card = card/atm/debit | `faq_args`: "does the bank ask for my PIN" maps to its FAQ topic |
| `secret_words` | object, values phrase lists | `{otp, pin, cvv, password}`: how the secret is written in this language's own script, e.g. otp -> ওটিপি, pin -> পিন, cvv -> সিভিভি, password -> পাসওয়ার্ড. Entries are substrings; a bare word that sits inside ordinary words is written `~word` (whole word only: not inside a longer word of the script, case endings allowed, e.g. `~ਪਿੰਨ`; Telugu `~పిన్` does not catch పిన్ని) or `#word` (as `~`, but only when a 4-8 digit number is also said, e.g. Tamil `#பின்`, which also means "after"). ZWNJ/ZWJ are ignored. Never the postal "pin code" | **gateway and voice secret scrubbing**: a sentence with one of these is treated as a spoken secret exactly like "OTP" / "PIN" |

```json
"words": { "...": "...", "why": ["ஏன்"], "txn": ["கடைசி பரிவர்த்தனைகள்"], "topics": {"emi": ["இஎம்ஐ", "தவணை"]},
           "secret_words": {"otp": ["ஓடிபி"], "pin": ["பின் எண்"], "cvv": ["சிவிவி"], "password": ["கடவுச்சொல்"]} }
```
