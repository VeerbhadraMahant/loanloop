# Punjabi (pa) i18n review

**This is a machine review (Claude back-translation against the English source). It is NOT a native-speaker review.** Treat pa as beta until a native speaker signs off.

## Counts
- Strings checked: 12 months, 79 gateway templates, 33 FAQ intents (answers, SMS texts, keyword lists), 4 voice lines + 8 field labels, all `words.*` lists.
- Strings changed: 27 (22 gateway, 3 FAQ answers/SMS texts, 1 FAQ keyword, 1 further FAQ SMS fix); 0 months.
- Word-list entries: removed 5 (`bye`: "sat sri akal" in two scripts; `possessive`: ਮੈਨੂੰ, mainu, menu); added about 60 (affirm, negate, bye, lang_names, human_target, question, acct_nouns, verify, already_paid, action_verbs, month and weekday variants). Weekdays use Monday=0 (matches `date.weekday()` in `voice/app.py`); all 12 month numbers verified. Affirm and negate are disjoint (asserted).

## Most important fixes
| Key | Problem | Fix |
|---|---|---|
| `words.bye` | "Sat Sri Akal" is the normal greeting, so a mid-call hello could end the call | Removed from bye (still used as the spoken goodbye in `call_ended`) |
| `call_started` | Language menu listed Punjabi/Hinglish; English says "or another Indian language" | Restored English, Hindi, Marathi or another Indian language |
| `balance`, `balance_hold` | "ਬਕਾਇਆ" means both balance and overdue dues; confusing next to collections lines | Use "ਬੈਲੇਂਸ" for savings balance |
| `emi_info`, `emi_no_due` | "ਬਕਾਇਆ ਤਾਰੀਖ਼" reads as "overdue date" | "ਭੁਗਤਾਨ ਦੀ ਤਾਰੀਖ਼" (payment due date) |
| `rtp_paid` | Garbled "I noted that you say..." | "According to you the payment is already made" (claim stays unverified) |
| `deceased_claim` | "cannot give access" became "cannot give information" | "cannot give access to the account" |
| `address_raised`, `charge_item`, `ptp_bad_amount`, `readback_document` | Unnatural or ambiguous grammar | Rewritten naturally, meaning unchanged |
| Approve button lines (3) | "ਮਨਜ਼ੂਰ ਕਰੋ ਨੂੰ ਟੈਪ ਕਰੋ" ungrammatical | Quoted button name + "ਦਬਾਓ" |
| `words.possessive` | "ਮੈਨੂੰ" means "to me", false positives | Removed |
| `faq.card_pin` keyword | "ਪਿਨ ਭੁੱਲ ਗਿਆ" is a substring of the UPI PIN keyword | "ਕਾਰਡ ਦਾ ਪਿਨ ਭੁੱਲ ਗਿਆ" |

Security meaning (bank never asks OTP/PIN/password/CVV, SMS-only details, secret warnings, verification failure, handover, read-back, no promises/waivers) was checked line by line and was already correct. Collections lines are firm and respectful.

## Gaps and doubts for a native speaker
- 47 of 80 FAQ intents are missing from pa.json (validator warns; callers get the English answer). Not translated in this pass.
- Register: agent speaks as masculine ("ਕਰਾਂਗਾ", "ਜੋੜਦਾ ਹਾਂ"); a neutral or female agent voice may need forms changed.
- "ਸਹਿਆਦਰੀ" spelling of Sahyadri for TTS; bare "ਜੀ" as yes may be only a politeness filler.
- "ਨਾ" is both "no" and a particle; kept in negate because it is in the shared source lists.
- Whether "ਬੈਲੇਂਸ" vs "ਬਕਾਇਆ" is preferred for savings balance, and "ਹਰਜਾਨਾ" for compensation.
- Gurmukhi and romanised month/weekday spellings are guesses of what Gnani STT emits.
- App menu paths in SMS texts are kept as in English and unverified against the real app.
