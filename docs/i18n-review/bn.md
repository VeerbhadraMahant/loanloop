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

## FAQ additions (machine translation)

33 intents added to `i18n/bn.json` (machine translation, no native review yet):
account_frozen, account_number_ifsc, bank_charges, bank_wrong_transfer, banking_password_reset, branch_locator, car_loan, cash_without_card, dbt_subsidy, debit_card_activate, education_loan, emi_date_tenure_change, fd_maturity, gold_loan, identity_theft_loan, insurance_products, international_transfer, internet_banking_register, investments_demat_mf, joint_account, kyc_basics, loan_status_disbursement, minor_account, mobile_banking_new_phone, other_bank_atm, otp_not_received, pan_aadhaar_link, pension_credit, savings_interest, shared_otp_or_link, standing_instruction, update_personal_details, upi_features.

Doubts for a native speaker:
- Security intents (shared_otp_or_link, identity_theft_loan, banking_password_reset, otp_not_received, bank_wrong_transfer, account_frozen): check the register is firm but calm, and that the 1930 helpline and the three-working-day liability wording read naturally.
- Loan-word spellings (ইএমআই, এফডি, ডিম্যাট, এসআইপি, মাইক্রো এটিএম) follow the existing bn entries; confirm callers say them this way.
- Joint-account operating modes ("এক বা জীবিত", "প্রথম বা জীবিত") are literal renderings of either-or-survivor / former-or-survivor; a banker may prefer standard Bengali banking terms.
- Keywords were auto-checked against all other intents; colliding phrases were dropped.
