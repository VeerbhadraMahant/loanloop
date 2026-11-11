# Kannada (kn) quality pass

**This is a machine review (back-translation by a model), not a native-speaker review.** `i18n/kn.json` stays beta until a native Kannada speaker signs it off.

## Counts

| Item | Number |
|---|---|
| Spoken strings checked (gateway templates, FAQ answers and SMS texts, voice lines, field labels) | 192 |
| Spoken strings changed | 20 (15 gateway, 4 FAQ answers, 1 voice label) |
| FAQ keyword lists touched | 24 (10 content edits, the rest only had invisible ZWNJ characters stripped) |
| Word-list entries removed | 47 (incl. 9 multi-word entries that can never match, and stem entries replaced by full forms) |
| Word-list entries added | 137 |

Back-translation found no wrong-meaning string in the security-critical lines (secret warnings, never-asks-OTP/PIN/password, SMS-only delivery, verification failure, read-backs, PTP lines). Those were left as written.

## Most important fixes

| Key | Problem | Fix |
|---|---|---|
| `gateway.rtp_paid` | Stated as fact "you have already paid"; English only notes that the caller says so. Would sound like the bank accepted the claim. | "I have noted that you say you already paid..." |
| `gateway.balance`, `balance_hold`, `faq.min_balance` | "ಬಾಕಿ ಇದೆ" ("remaining/owed") used for account balance; reads as an amount due. | "ಬ್ಯಾಲೆನ್ಸ್ ಇದೆ" |
| `gateway.call_started` | Offered Hinglish and omitted "or another Indian language". | Matches English: Kannada, English, Hindi, Marathi or another Indian language. |
| `gateway.approval_*`, `need_approval` | "tap what is called Approve" was clumsy. | "press the Approve button" |
| `gateway.mp_line` | Copula missing ("Your X 1234"). | "ನಿಮ್ಮ X ... ಆಗಿದೆ" |
| `gateway.nominee_raised`, `readback_nominee`, `FIELD_LABEL.name` | Formal "ನಾಮನಿರ್ದೇಶಿತ" instead of the word callers use. | "ನಾಮಿನಿ" |
| `faq.upi_wrong_transfer` | "bank alone" translated as the odd "ಒಂದೇ". | "on its own action". Meaning (no guarantee of recovery) unchanged. |
| `words.bye` | "ನಮಸ್ಕಾರ" (also hello) and "ಧನ್ಯವಾದ" (thanks) would end the call mid-conversation. Also multi-word entries cannot match. | Removed; added single-word bye forms. |
| `words.human_verb`, `action_verbs` | Stems such as "ಮಾತನಾಡ" never match (human_verb is whole-token; action_verbs is prefix). | Added full verb forms to human_verb, short stems to action_verbs. |
| `words.already_paid` | "ಪಾವತಿಯಾಗಿದೆ" ("payment has happened") also fires on questions. | Removed; added first-person "I have paid" forms. |
| `words.switch_cues` | "ನಲ್ಲಿ" / "ಅಲ್ಲಿ" are common standalone words ("tap", "there"). | Removed; added real verb forms ("ಮಾತನಾಡೋಣ", "ಬೇಕು"...). |
| `words.affirm` / `negate` | "ದೃಢ" (firm) in affirm; "ನೋ", "ಅಲ್ಲ", "ಸರಿಯಲ್ಲ", "ಕ್ಯಾನ್ಸಲ್" missing from negate. | Fixed. Affirm and negate share no word; no negation or hedge in affirm. |
| ZWNJ (U+200C) in word lists and FAQ keywords | Tokenizer and substring matcher do not strip it, so "ಐಎಫ್‌ಎಸ್‌ಸಿ", "ಸ್ಟೇಟ್‌ಮೆಂಟ್" never matched STT text. | Stripped from keywords and word lists (kept in spoken text). |
| FAQ keywords | Generic or cross-intent phrases: "ವ್ಯತ್ಯಾಸ", "ದಂಡ", "ದಿನದ ಮಿತಿ", "ಪಿನ್ ಮರೆತೆ", "ಕ್ಲೈಮ್", "ವಿದೇಶದಿಂದ ಹಣ", "ಕನಿಷ್ಠ ಬಾಕಿ" (clashes with credit-card minimum due). | Replaced with specific phrases; `loan_restructure` gained "ಬಾಕಿ ಮನ್ನಾ"/"waive overdue" so waiver requests go to a colleague, no promise. |

Checked and fine: months (12 correct), weekdays (Monday=0 ... Sunday=6 per `voice/app.py`), `lang_names` (script plus romanised), `question`, `possessive`.

## Remaining doubts for a native speaker

1. **33 FAQ intents are missing** from `kn.json` (the checker warns; callers get the English answer). This was not part of this pass and is the biggest gap for Kannada callers. Same warning for all 7 new languages.
2. Register and dialect: "ಸಹೋದ್ಯೋಗಿ" for "colleague", "ಆಯ್ತು" vs "ಆಯಿತು", "ಹೌದ್ರಿ", spoken vs written forms across Karnataka regions.
3. Mixed terms: gateway now says "ನಾಮಿನಿ" but FAQ answers still use "ನಾಮನಿರ್ದೇಶಿತ".
4. Numbers: `{day}` is followed by "ನೇ" ("5 ನೇ ತಾರೀಖು"); TTS reading of digit plus "ನೇ" is untested.
5. English acronym transliterations (ಯುಟಿಆರ್, ಎನ್‌ಒಸಿ, ಐಎಫ್‌ಎಸ್‌ಸಿ) are guesses at what the Gnani TTS reads well; listen to them.
6. The app button label "Approve" is rendered "ಅನುಮೋದಿಸಿ"; it must match the mock app's button text.
7. Word lists: "ಹಾ" (also an interjection), "ಅಲ್ಲ" in negate/neg_human, "ಆಗಿದೆ"/"ಮಾಡಿದೆ" in approval, "ಎಲ್ಲಾ"/"ಕೂಡ" are broad. Tokens are matched exactly, so inflected forms (agglutination) of human_target, acct_nouns and action verbs are only partly covered.
8. A caller cannot name another language in Kannada script ("ಹಿಂದಿಯಲ್ಲಿ ಮಾತನಾಡಿ"): the file format has no list for that.
