# Bengali (bn) review

Machine review only (back-translation by an LLM). It is NOT a native-speaker review.

## Counts
- Strings checked: about 190 (86 gateway templates, 47 FAQ answers, FAQ SMS texts, 4 voice lines + ASK + 8 field labels, 12 months) plus all word lists and FAQ keywords.
- Strings changed: 30 gateway templates, 7 FAQ answer/SMS strings, 5 FAQ keyword lists.
- Word lists: 6 entries removed (including 1 duplicate), about 60 added.
- Months map to 1-12 and weekdays to Monday=0 correctly; affirm/negate have no overlap.

## Main fixes
| Key | Problem | Fix |
|---|---|---|
| call_started | Offered "Hinglish" instead of "another Indian language" | Now "or another Indian language" |
| approval_ok | "Received" instead of "confirmed" | Now says the approval is confirmed |
| approval_*, need_approval | "Approve" button rendered as a vague phrase | Uses "Approve" as shown in the app |
| foreclosure_quote*, ptp_bad_amount | "Outstanding" became "outstanding principal" | Neutral "outstanding amount" |
| ptp_ok_* | "Make sure payment is done" read as "confirm the payment" | Asks them to make the payment by that date |
| dues_info | "Missed EMIs" was ambiguous | States EMIs not paid |
| emi_info, emi_no_due | "Due date" was an awkward phrase | "Next payment date" |
| mp_line, tier_too_low, rtp_dispute | Clumsy or inexact wording | Rewritten naturally |
| loan_prepayment, home_loan_apply | "individuals" and "bank needs proof" mistranslated | Fixed |
| complaint_escalation SMS | "Escalation" rendered as "appeal" | Fixed |
| words.bye | "Namaskar" is also a mid-call greeting | Removed |
| words.affirm | Bare "ha" is too short and "thikoi" is hedgy | Removed |
| words.multi | "Abar" means "again", not "and" | Removed |

## Remaining doubts for a native speaker
- Register: "tumi/apni" is "apni" throughout; check TTS naturalness.
- The Bengali numerals in SMS texts and a spoken "1930" written as words.
- Transliterated English terms (EMI, NOC, forgot password, approve) vs. native terms.
- The word "borrowed" bank terms like "bokeya" and "kisti": confirm callers use them.
- Romanised word-list spellings are guesses; Bengali has no fixed romanisation.
- 33 FAQ intents exist in the English source but are missing from bn.json (callers get English). The checker only warns; this was out of scope here.
