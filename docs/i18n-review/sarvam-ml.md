# Sarvam review: Malayalam (ml)

Reviewed 227 caller-facing strings (gateway, voice, faq answers and SMS texts, months) with a Sarvam model. Flagged 5; 0 not reviewed (bad model output). Machine reviewer: a second opinion, not ground truth.

| issue | count |
|---|---|
| meaning | 2 |
| grammar | 2 |
| unnatural | 1 |

| key | issue | back-translation | current | suggestion |
|---|---|---|---|---|
| gateway.document_raised | meaning | Request {ticket} is registered for your {doc}. It will be sent to your registered email. I have also sent you an SMS. | നിങ്ങളുടെ {doc} നുള്ള അഭ്യർത്ഥന {ticket} രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്. ഇത് നിങ്ങളുടെ രജിസ്റ്റർ ചെയ്ത ഇമെയിലിലേക്ക് അയയ്ക്കും. നിങ്ങൾക്ക് ഒരു എസ്എംഎസും അയച്ചിട്ടുണ്ട്. | നിങ്ങളുടെ {doc} നുള്ള {ticket} അഭ്യർത്ഥന രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്. ഇത് നിങ്ങളുടെ രജിസ്റ്റർ ചെയ്ത ഇമെയിലിലേക്ക് അയയ്ക്കും. നിങ്ങൾക്ക് ഒരു എസ്എംഎസും അയച്ചിട്ടുണ്ട്. |
| gateway.dues_info | grammar | In your loan {loan}, there is an overdue {amount} for {missed} missed EMIs, {dpd} days past due. Charges added so far are {charges}. | നിങ്ങളുടെ ലോൺ {loan} ൽ അടയ്ക്കാത്ത {missed} ഇഎംഐകൾക്കായി {amount} കുടിശ്ശികയുണ്ട്, {dpd} ദിവസത്തെ വൈകൽ. ഇതുവരെ ചേർത്ത ചാർജുകൾ {charges} ആണ്. | നിങ്ങളുടെ ലോൺ {loan} ൽ {missed} ഇഎംഐകൾ കുടിശ്ശികയായി {amount} ആണ്, {dpd} ദിവസത്തെ വൈകൽ. ഇതുവരെ ചേർത്ത ചാർജുകൾ {charges} ആണ്. |
| gateway.emi_date_changed | unnatural | Done. Request {ticket} is registered: from your next cycle your EMI date will become the {day}th of every month. | ചെയ്തു. അഭ്യർത്ഥന {ticket} രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്: അടുത്ത സൈക്കിൾ മുതൽ നിങ്ങളുടെ ഇഎംഐ തീയതി എല്ലാ മാസവും {day} ആം തീയതിയായി മാറും. | ചെയ്തു. അഭ്യർത്ഥന {ticket} രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്: അടുത്ത സൈക്കിൾ മുതൽ എല്ലാ മാസവും {day} ആം തീയതിയായിരിക്കും നിങ്ങളുടെ ഇഎംഐ തീയതി. |
| voice.LANG_OK | meaning | Okay, I will continue in Malayalam. How can I help you? | ശരി, ഞാൻ മലയാളത്തിൽ തുടരാം. ഞാൻ എങ്ങനെ സഹായിക്കണം? | ശരി, ഞാൻ ഇംഗ്ലീഷിൽ തുടരാം. ഞാൻ എങ്ങനെ സഹായിക്കാം? |
| faq.account_closure.answer | grammar | To close an account, after clearing dues and returning the cheque book and cards, submit a closure request at your branch with ID. | അക്കൗണ്ട് ക്ലോസ് ചെയ്യാൻ, കുടിശ്ശികകൾ തീർത്ത്, ചെക്ക് ബുക്കും കാർഡുകളും തിരികെ നൽകി, തിരിച്ചറിയൽ രേഖയുമായി ശാഖയിൽ അപേക്ഷ നൽകുക. തുടങ്ങി അധികം കഴിയുംമുമ്പ് ക്ലോസ് ചെയ്താൽ ചാർജ് വരാം, ശാഖ അറിയിക്കും. | അക്കൗണ്ട് ക്ലോസ് ചെയ്യാൻ, കുടിശ്ശികകൾ തീർത്ത് ചെക്ക് ബുക്കും കാർഡുകളും തിരികെ നൽകി, തിരിച്ചറിയൽ രേഖ സഹിതം ശാഖയിൽ അപേക്ഷ നൽകുക. തുടങ്ങി അധികം കഴിയുംമുമ്പ് ക്ലോസ് ചെയ്താൽ ചാർജ് വരാം, ശാഖ അറിയിക്കും. |
