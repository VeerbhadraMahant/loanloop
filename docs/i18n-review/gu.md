# Gujarati (gu) quality pass

**This is a machine review (Claude back-translation and consistency check), not a native-speaker review.** A Gujarati speaker must still sign it off before any real use.

## Counts
- Strings checked: 86 gateway templates, 47 FAQ intents (answer + sms_text + keywords), 4 fixed voice lines, 8 field labels, 12 months, all word lists.
- Strings changed: 20 gateway, 8 FAQ intents, 2 voice lines.
- Word-list entries: 7 removed, 89 added (incl. weekday/month romanised forms); `action_verbs` rewritten as stems.
- Affirm/negate overlap: none. All FAQ keyword lists are 4-10 phrases.

## Most important fixes
| Key | Problem | Fix |
|---|---|---|
| words.approval | "કર્યું" (did) as an approval word: "I have not done it" could count as approved | Removed |
| words.action_verbs | Full imperatives ("બદલો") missed other verb forms (બદલવું, મોકલવું) | Replaced with stems (બદલ, મોકલ, ફેરફાર...) |
| words.already_paid | Missing common phrasings (ભરી દીધી, પેમેન્ટ થઈ ગયું); two Hindi/English duplicates | Added native + romanised forms, dropped duplicates |
| words.negate / affirm | Missing common forms (નહી, નઈ, ખોટી; ચોક્કસ, હાં) | Added; no cross-overlap, no hedging words in affirm |
| faq.card_pin keywords | "પિન ભૂલી ગયો" is a substring of the UPI PIN keyword, could steal the intent | Now "કાર્ડ પિન ભૂલી ગયો" |
| gateway.call_started | Listed Gujarati and Hinglish as the only choices; source says "or another Indian language" | Matches source |
| gateway.balance, balance_hold | "બાકી છે" (outstanding) used for a savings balance, reads as dues | "બેલેન્સ ... છે" |
| gateway.payment_unmatched | "મેળવી શક્યો નથી" meant "could not receive", not "could not match" | Rewritten: not found in our records |
| gateway.txn_dr | "ઉધાર" also means "borrowed/on credit" in speech | "ડેબિટ" |
| gateway.ctype_penal | "પેનલ" reads as "panel" | "પેનલ્ટી ચાર્જ" |
| gateway.emi_date_changed, readback_new_day, ineligible_same | "દર મહિનાની {day}" lacked "તારીખ" | "{day} તારીખ" |
| gateway.sms_sent | "હું બોલીને કહેતો નથી" (gendered, awkward) | Passive: details are not read out on the phone |
| gateway.rtp_hardship | "મુશ્કેલી" alone was vague | "આર્થિક મુશ્કેલી", colleague "reviews" |
| faq.loan_prepayment | "ફોરક્લોઝર કોટ" (coat); SMS step 1 missing "ઘટાડવી" | "ક્વોટ"; step fixed |
| faq.deceased_claim | "access to the account" had become "information"; condolence line unnatural | Meaning restored; condolence reworded |
| faq.positive_pay, cheque_clearing, emi_missed, cheque_stop_payment, nominee_info | Wrong verb ("receives" for "matches"; "સહી ન મળવી"; "ચૂકવાથી"; "રોકાવવા"; awkward nominee definition) | Reworded |
| gateway approval_*, ineligible_*, invalid_input | Gendered "શકતો/રહ્યો" where neutral was possible | Neutral phrasing where grammar allowed |

Security lines (secret warnings, "bank never asks for OTP/PIN/password", SMS-only details, verify/lockout, read-backs, no promises) were checked and kept; meaning matches the English.

## Remaining doubts for a native speaker
- Register: "તમે" is used throughout; confirm that is right for a bank (versus "આપ"). Only call_started uses "આપનું".
- Some lines still use masculine first person ("શકતો નથી", "જોડું છું" is neutral); a native speaker should choose the agent's gender or approve neutral forms.
- Transliterations (ઇએમઆઈ, આઈએફએસસી, એનઓસી, પૉઝિટિવ પે) may not match the TTS pronunciation; listen to them.
- "ચાલશે નહીં" (ptp_bad_date) is colloquial; check tone for a collections call.
- "જી" as a bare yes and "પણ" in `multi` can be ambiguous in real speech.
- 33 FAQ intents present in the English source are not translated (callers get the English answer): the checker reports these as warnings.
- Spoken Latin items inside answers (UPI DR, URLs, "Help") are left as is.
