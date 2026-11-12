# Sarvam review: Bengali (bn)

Reviewed 227 caller-facing strings (gateway, voice, faq answers and SMS texts, months) with a Sarvam model. Flagged 6; 0 not reviewed (bad model output). Machine reviewer: a second opinion, not ground truth.

| issue | count |
|---|---|
| meaning | 3 |
| unnatural | 2 |
| register | 1 |

| key | issue | back-translation | current | suggestion |
|---|---|---|---|---|
| gateway.nominee_raised | unnatural | Request {ticket} has been raised to set {name} ({relation}) as your nominee. | {name} ({relation})-কে আপনার নমিনি করার অনুরোধ {ticket} করা হয়েছে। | {ticket} নম্বর অনুরোধ করা হয়েছে {name} ({relation})-কে আপনার নমিনি হিসেবে সেট করার জন্য। |
| gateway.txn_item | meaning | {date}, {dir} of {amount}, {narr} | {date}, {amount} {dir}, {narr} | {date}, {amount} {dir}, {narr} |
| voice.LANG_OK | meaning | Okay, I will speak in Bengali. How can I help you? | ঠিক আছে, আমি বাংলায় কথা বলব। আমি আপনাকে কীভাবে সাহায্য করতে পারি? | ঠিক আছে, আমি ইংরেজিতে কথা বলব। আমি আপনাকে কীভাবে সাহায্য করতে পারি? |
| voice.FIELD_LABEL.amount | register | amount | অঙ্ক | অ্যামাউন্ট |
| voice.FIELD_LABEL.name | unnatural | nominee's name | নমিনির নাম | নমিনির নাম বলুন |
| voice.FIELD_LABEL.promised_date | meaning | payment date | পেমেন্টের তারিখ | আপনি যে তারিখে টাকা দেবেন তার তারিখ |
