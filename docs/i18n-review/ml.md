# Malayalam (ml) i18n review

**This is a machine review (back-translation by an LLM), not a native-speaker review.** `i18n/ml.json` stays beta.

## Counts
- Strings checked: 86 gateway templates, 47 FAQ answers plus their sms_text, 12 months, 4 voice lines, ASK and 8 field labels. All were back-translated to English and compared with the source.
- Strings changed: 4 (gateway `call_started`, `call_started_out`, `handover_ack`; FAQ `cheque_clearing`). The rest matched the source meaning and security wording.
- Word lists: 10 entries removed, about 90 added (native script plus romanised). `affirm` and `negate` do not overlap.
- FAQ keywords: all 47 intents have 5-7 phrases with English loan words; none looked like they belonged to another intent. No changes.

## Main fixes
| Key | Problem | Fix |
|---|---|---|
| gateway.call_started | Offered "Hinglish" as the last option; source says "another Indian language" | Now "or another Indian language" |
| gateway.handover_ack | "അദ്ദേഹത്തിന്റെ" (his) gendered the colleague | "അവരുടെ" (their) |
| gateway.call_started_out | Awkward "I, on behalf of the bank, LoanLoop..." | "This is LoanLoop calling from Sahyadri Bank, about your loan" |
| faq.cheque_clearing | "ഒപ്പ് ചേരായ്ക" is stilted | "ഒപ്പ് ഒത്തുവരാത്തത്" |
| words.affirm | "ആണ്" (is) is a copula, not a yes; could trigger a false yes | removed |
| words.negate | "wait" is hedging, not a no | removed |
| words.bye | "നമസ്കാരം" is also the normal hello; could end a call mid-conversation | removed with "namaskaram" |
| words.approval | "അനുമതി" (permission) appears in ordinary sentences | removed |
| words.switch_cues | Bare chillu "ൽ" matches inside many words | removed |
| words.human_verb | "മാറ്റൂ" (change) and "പറയണം" (must say) are not connect verbs | removed |
| words.possessive | "എനിക്ക്" means "to me/I want", not "my" | removed |

Checked and correct: all 12 month numbers, weekday indices (Monday=0 ... Sunday=6), `lang_names` (native + romanised). Added romanised weekdays (thinkal, chovva, ...), "sept", "സെപ്തംബർ", and more affirm/negate/bye/already_paid/action_verb forms.

Security wording (never asks OTP/PIN/password/CVV, SMS to registered number only, secret-detected warnings, read-backs, no promises or waivers) matched the source in every string. Collections lines are firm and polite.

## Remaining doubts for a native speaker
- "സഹപ്രവർത്തകൻ" (colleague) is grammatically masculine in all handover lines; a gender-neutral word may be better.
- Register: second person "നിങ്ങൾ" with "...ൂ" imperatives ("പറയൂ") sounds polite but may read slightly informal for collections lines.
- Phrases like "പണം കട്ടായി" (money got cut) and "പൊട്ടിക്കാം" (break an FD) are colloquial; check they suit a bank voice.
- TTS spelling: "ഐഎഫ്എസ്‌സി" (contains a ZWNJ), "ഇഎംഐ", "ഒടിപി", "ആം തീയതി" after {day}.
- Case endings after placeholders ("{loan} ന്റെ", "{date} ന് ") are written with a space; real values may need different suffixes.
- 33 FAQ intents have no Malayalam entry (checker warns; callers get the English answer). Not translated in this pass.
- Romanised word-list forms are guesses at caller typing or STT transliteration; verify against real STT output.
