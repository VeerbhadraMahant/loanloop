# Tamil (ta) i18n review

**This is a machine review (Claude back-translation and rule checks), not a native-speaker review.** A native Tamil speaker must still check the file before it leaves beta.

## Counts
- Strings checked: 12 months, 62 gateway templates, 47 FAQ answers, 47 FAQ keyword sets, about 40 FAQ sms_text bodies (checked mechanically for numbers and step counts; the security-relevant ones were read in full), 4 voice lines plus ASK and FIELD_LABEL, and all 18 word lists.
- Strings changed: 4 gateway templates, 3 secret/password warnings (pin wording), 3 FAQ answers, 2 FAQ sms_text bodies, 4 FAQ keyword edits. 11 spoken-string edits and 4 keyword edits in total.
- Word-list entries removed: 5. Added: 93, counting month and weekday forms.
- Not done: 33 of the 80 FAQ intents are absent from ta.json. The check only warns, and callers get the English answer for them. Translating them is a separate task.

## Most important fixes
| Key | Problem | Fix |
|---|---|---|
| words.bye `வணக்கம்`, `vanakkam` | Normal Tamil greeting, so it would hang up the call when said mid-call | Removed. Added `டாட்டா`, `tata`, `bye bye`, `போயிட்டு வரேன்` |
| words.human_verb `மாற்று` | Means "change" as well as "transfer", so "change my EMI date" could trigger human handover | Removed. Added unambiguous connect and contact verbs |
| words.multi `உம்`, words.switch_cues `ல` | Bare suffix or letter that false-matches inside ordinary words | Removed |
| gateway.call_started | Offered "Hinglish" where the English source says "another Indian language" | Now "any other Indian language" |
| faq.loan_restructure | Garbled sentence, the object of "tell a colleague" was unclear | Rewritten so the colleague discusses options and receives the situation |
| gateway.secret_warning, pw_app, pw_netbanking | Tamil `பின்` also means "after", so the PIN refusal could be misheard | Now `பின் நம்பர்` |
| faq.rd_basics keyword `ஆர்டி` | Substring of `ஆர்டிஜிஎஸ்` (RTGS), so it could steal RTGS queries | Replaced with `rd account` |
| faq.kyc_update keyword `pan link` | Belongs to the pan_aadhaar_link intent | Replaced with `ekyc` |
| gateway.call_started_out, faq_sms_offer, ptp_bad_amount | Awkward word order, or "verify" meant the wrong thing | Reworded, same meaning |
| faq upi_setup, upi_pin_reset | Wrong verb for "set a PIN" | Fixed |

## Checked and found correct
- Security meaning in these strings: bank never asks for OTP/PIN/password; SMS-only details to the registered number; verification failure; rate limit and handover; read-back-before-change confirmations; hardship and handover lines.
- No promises, waivers or settlements appear anywhere.
- Collections lines are firm and respectful.
- Weekdays use Monday=0 through Sunday=6. Months map to 1-12.
- affirm and negate share no entries.
- Placeholders match the English source exactly (i18n_check passes).

## Remaining doubts for a native speaker
- Register and honorific level (`-ங்க` forms versus formal) across all lines.
- `செலவு` for "debit" in txn_dr (natural, or should it be `டெபிட்`/`பற்று`?).
- Colloquial or Sri Lankan Tamil variants are only partly covered in the word lists.
- Transliterated terms (`ஐஎஃப்எஸ்சி`, `யூடிஆர்`, `என்ஓசி`) may read poorly in TTS. Spelled-out letters may sound better.
- `சரி` (okay) is in affirm. It could be a hedge in some phrasings.
- FAQ SMS bodies were only mechanically compared, apart from the security-relevant ones.
- Some FAQ keywords are loan-word transliterations. Real caller phrasing may differ.
- The 33 missing FAQ intents.

## FAQ additions (machine translation)

33 intents added to `i18n/ta.json` (machine translation, no native review yet): internet_banking_register, banking_password_reset, otp_not_received, mobile_banking_new_phone, account_frozen, joint_account, minor_account, account_number_ifsc, bank_wrong_transfer, standing_instruction, fd_maturity, car_loan, education_loan, gold_loan, emi_date_tenure_change, loan_status_disbursement, international_transfer, bank_charges, savings_interest, dbt_subsidy, pension_credit, insurance_products, investments_demat_mf, kyc_basics, pan_aadhaar_link, update_personal_details, identity_theft_loan, shared_otp_or_link, branch_locator, cash_without_card, other_bank_atm, debit_card_activate, upi_features.

Doubts for a native speaker:
- Helpline 1930 is written as digits spoken out ("ஒன்று ஒன்பது மூன்று பூஜ்ஜியம்") and "*99#" as "ஸ்டார் ஒன்பது ஒன்பது ஹேஷ்"; confirm TTS reads these naturally.
- Register: formal bank-Tamil terms (நிலுவை இல்லாச் சான்றிதழ், அரசிதழ் அறிவிப்பு, பிணையம்) may be too written for a phone call; check for simpler spoken alternatives.
- Loan words transliterated (ஆக்டிவேட், அன்பிளாக், டிமேட், எஸ்ஐபி, ஏஇபிஎஸ்) follow the existing file; confirm they match what callers say.
- Security lines (shared_otp_or_link, identity_theft_loan, otp_not_received, bank_wrong_transfer, account_frozen) were back-translated to match the English meaning; a native check of the "no OTP/PIN/password" and "report within three working days" wording is advised.
