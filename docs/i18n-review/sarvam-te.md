# Sarvam review: Telugu (te)

Reviewed 227 caller-facing strings (gateway, voice, faq answers and SMS texts, months) with a Sarvam model. Flagged 3; 0 not reviewed (bad model output). Machine reviewer: a second opinion, not ground truth.

| issue | count |
|---|---|
| grammar | 1 |
| unnatural | 1 |
| meaning | 1 |

| key | issue | back-translation | current | suggestion |
|---|---|---|---|---|
| gateway.mp_line | grammar | Your {label} is {v}. | మీ {label} {v}. | మీ {label} {v}. |
| gateway.readback_payment | unnatural | I will confirm once: UTR {utr} and amount {amount}. Is this correct? Please say yes, then I will check. | ఒకసారి నిర్ధారిస్తాను: యుటిఆర్ {utr} మరియు మొత్తం {amount}. ఇది సరైనదేనా? దయచేసి అవును అనండి, తర్వాత పరిశీలిస్తాను. | ఒకసారి నిర్ధారిస్తాను: యుటిఆర్ {utr} మరియు మొత్తం {amount}. ఇది సరైనదేనా? అవును అని చెబితే, నేను తనిఖీ చేస్తాను. |
| voice.LANG_OK | meaning | Sure, I will continue in Telugu. How can I help you? | సరే, నేను తెలుగులో కొనసాగిస్తాను. నేను మీకు ఎలా సహాయం చేయగలను? | సరే, నేను ఇంగ్లీషులో కొనసాగిస్తాను. నేను మీకు ఎలా సహాయం చేయగలను? |
