# i18n review: Telugu (te)

This is a **machine review** (back-translation to English and rule checks by an AI model). It is **not a native-speaker review**. Treat the language as beta until a Telugu speaker has signed it off.

## Counts

| Item | Count |
|---|---|
| Spoken strings checked (86 gateway, 47 FAQ answers, 31 FAQ SMS texts, 14 voice, 12 months) | 190 |
| Strings changed | 20 (12 gateway, 8 FAQ answers/SMS/keywords touched) |
| FAQ keyword lists changed | 5 (`account_types`, `min_balance`, `loan_restructure`, `fraud_report`, `fd_premature`) |
| Word-list entries removed | 6 |
| Word-list entries added | 123 |
| Checks | `i18n_check.py`: te ok (0 problems, 33 warnings); `pytest -k i18n`: 10 passed |

The 33 warnings are FAQ intents that `te.json` does not have; callers get the English answer for those (see doubts).

## Most important fixes

| Key | Problem | Fix |
|---|---|---|
| `words.bye` | "namaskaram" (a greeting) and "dhanyavadalu" (thanks) were bye words, so a thank-you or hello mid-call could end the call | Removed both (native + romanised). Added real goodbyes: selavu, untanu, tata |
| `words.human_verb` | "ivvandi" (give) is far too generic and could trigger a human handover on ordinary requests | Removed; added specific connect/speak forms |
| `gateway.call_started` | Language menu offered "Hinglish" instead of "another Indian language" (meaning changed) | Now "Telugu, English, Hindi, Marathi or another Indian language" |
| `gateway.approval_pending`, `approval_sent`, `need_approval` | "tap the thing called Approve" was a stiff word-by-word calque | "Tap the Approve button" (natural phrasing) |
| `gateway.dues_info` | "missed" was rendered as "slipped/lost"; sentence unclear on EMIs vs amount | "{amount} overdue against {missed} unpaid EMIs, {dpd} days past due" |
| `gateway.payment_unmatched` | Reminders-paused clause was garbled ("until checking is going on until {until}") | "Reminders are paused until {until} while we check" |
| `gateway.ptp_bad_amount` | "above zero and not more than outstanding" was clumsy and could read as two contradictory limits | "above zero and not exceeding your outstanding" |
| `gateway.rtp_hardship` | "kashta-kala paristhiti" (a hard time) is vague | "recorded as a financial difficulty" |
| `gateway.ineligible_overdue` | "cannot change the date" omitted that it is the EMI date | Added EMI |
| `faq.tds_15g_15h` | "to evade TDS" connotation (tappinchukovadam) | "to avoid the TDS deduction" |
| `faq.fd_premature` | "vichchinnam" (shatter) used for breaking an FD | "close early and take the money" |
| `faq` keywords | generic single words "difference" (`account_types`) and "penalty" (`min_balance`) could pull in wrong intents; two lists had 11 keywords | Replaced with specific phrases; trimmed to 10 |
| `words.affirm` | Contained "hmm", a hedging sound | Removed. Added polite forms (avunandi, sarenandi, ante, yes) |
| `words.negate`, weekdays, months | Missing common polite/romanised forms | Added vaddandi, ledandi, no; romanised weekdays and months, spelling variants (-ru endings) |

Secrets/security lines were checked back against the English and are intact: OTP/PIN/password/CVV never asked (`secret_warning`, `secret_reassure`, `pw_app`, `pw_netbanking`, `bank_never_asks`, `card_pin`), SMS-only to the registered number (`sms_sent`, `faq_sms_offer`), read-backs, verify-failed, rate-limit handover, no promises (`hardship_ack`, `rtp_*`, `ptp_*`, `loan_restructure`). Weekday indices follow Monday=0 and month words 1-12 as in the source; both verified.

## Remaining doubts for a native speaker

- 33 FAQ intents are not translated at all (callers hear English for them). This review did not add them.
- Register: answers use plain "-andi" imperatives and "mee" forms; a native check on whether the bank voice should be more formal or more colloquial.
- "Approve button" is transliterated (అప్రూవ్) to match the app label; confirm the app UI wording.
- "సహ్యాద్రి" as the transliteration of Sahyadri, and "లోన్‌లూప్" for LoanLoop: confirm how TTS pronounces them.
- Ordinal "{day} వ తేదీ" is written with a space; native writing is usually "{day}వ తేదీ". Harmless in speech.
- Numerals in `{placeholders}` (dates, amounts) will be read by TTS; the Telugu connector words around them (న, కు) were not tested with real numbers.
- `words.affirm` still contains "సరే"/"sare" (can be reluctant) and "అలాగే"/"alage" (also a multi word); kept because they are the common ways to say yes.
- `words.verify` includes filler words (is, of, the, and, నా, ఉంది) copied from the source pattern; they match the other languages but are broad.
- Single-letter question word "ఏ" is kept for the logic; a native check on false positives is worthwhile.
- The Telugu speech-to-text output spelling (e.g. అవును vs ఔను, -రు vs -ర్ endings for months) may differ from the variants listed.

## FAQ additions (machine translation)

Added 33 FAQ intents to `i18n/te.json` (machine translation, no native review): account_frozen, account_number_ifsc, bank_charges, bank_wrong_transfer, banking_password_reset, branch_locator, car_loan, cash_without_card, dbt_subsidy, debit_card_activate, education_loan, emi_date_tenure_change, fd_maturity, gold_loan, identity_theft_loan, insurance_products, international_transfer, internet_banking_register, investments_demat_mf, joint_account, kyc_basics, loan_status_disbursement, minor_account, mobile_banking_new_phone, other_bank_atm, otp_not_received, pan_aadhaar_link, pension_credit, savings_interest, shared_otp_or_link, standing_instruction, update_personal_details, upi_features.

Doubts for a native speaker:
- Loan words kept in Telugu script (ఓటిపి, ఎంపిన్, కెవైసి, ఎఫ్‌డి, ఎస్ఐపి, ఐఎఫ్ఎస్‌సి, జీఎస్‌టి); check the spellings callers actually say.
- Register of the "చెప్పకండి" prohibitions in security answers (otp_not_received, shared_otp_or_link, banking_password_reset): confirm they sound firm but polite.
- Colloquial keywords such as "ఓటిపి రావడం లేదు", "చెప్పేశాను", "ఖాతా స్తంభించింది" are guesses at spoken phrasing.
- "జాయింట్లీ", "ఎదర్ ఆర్ సర్వైవర్" in the joint_account SMS are transliterated English terms; a Telugu banking equivalent may be preferred.
- The helpline "1930" is kept as digits, as in the existing fraud_report answer.
