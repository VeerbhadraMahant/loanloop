# LoanLoop Demo Video Script

**Target Duration:** 3:30 to 4:00 minutes  
**Format:** Split screen showing live voice call, borrower mock phone (`/phone`), and Ops Dashboard (`/ops`).

---

## 1. Problem & Context (0:00 – 0:45)
**Visual:** Title slide / dashboard metrics showing industry context.
- **Voiceover:**
  > "In India, lenders handle millions of outbound debt collection calls with automation. But when borrowers call back, they are stranded.
  >
  > According to the RBI Ombudsman, customer complaints rose over 13% last year to 13.34 lakh, with loans and advances accounting for nearly 30% of all grievances. Over 70% of calls to RBI's contact centre are in Hindi, and benchmark studies like VoiceCodeBench show top ASR systems misrecognize critical values in over 30% of calls.
  >
  > Borrowers struggle with IFSCs, account numbers, and language barriers, while call centers routinely ask them to share sensitive PINs or OTPs over the phone.
  >
  > Meet **LoanLoop**: a secure voice service desk built on Gnani Agent Builder for the fictional 'Sahyadri Finance Bank'. It completes banking servicing requests end-to-end with zero spoken secrets, zero hallucinations, and multi-tier security."

---

## 2. Demo Call 1: Priya — Servicing & Spoken Secret Interception (0:45 – 2:15)
**Visual:** Live call audio running with `/phone` (mock phone app) and `/ops` (real-time timeline) side by side.
- **Step 1: Spoken Secret Interception**
  - *Caller (Hinglish):* "Namaste, mujhe apna IFSC aur customer ID yaad nahi hai. Mera password Priya1234 hai."
  - *Agent:* Interrupts immediately. "Bank kabhi bhi call par password nahi poochta. Aapka password save nahi hua hai."
  - *Highlight on screen:* Gateway logs `SECRET_DETECTED` with secret type `password`, but the raw password value is never logged, stored, or echoed.
- **Step 2: Tier 1 Verification & Out-of-Band SMS Delivery**
  - *Caller:* Gives registered mobile `9000014417` and DOB `1991-08-14`.
  - *Agent:* Verifies caller (Tier 1 achieved).
  - *Caller:* "Mujhe mere account details bhej do."
  - *Agent:* "Maine aapke registered mobile ending 4417 par SMS bhej diya hai."
  - *Highlight on screen:* Full account number and IFSC appear live on the `/phone` SMS inbox. They are never spoken aloud by the voice agent.
- **Step 3: "I Already Paid" & Tier 2 In-App Tap Approval**
  - *Caller:* "Maine is mahine ki EMI pehle hi bhar di hai."
  - *Agent:* Requests read-back of payment date, amount, and UTR. "Aapke app par approval bheja hai. Kripya approve karein."
  - *Highlight on screen:* An approval card pops up on `/phone`. Priya taps **Approve**.
  - *Agent:* Validates Tier 2 approval, matches the UTR against the core ledger, creates a reconciliation ticket, and pauses recovery reminders.
- **Step 4: Mid-Call Language Switch & EMI Date Change**
  - *Caller switches to Marathi:* "आता मराठीत बोला. माझी EMI ची तारीख 10 करा."
  - *Agent switches to Marathi:* Seamlessly explains the rate reset and charges, reads back the new date 10, confirms, and logs the change without re-verifying.

---

## 3. Demo Call 2: Attacker — Cloned Voice & Spoofing Attempt (2:15 – 2:50)
**Visual:** `/ops` Security Attack View.
- **Step 1: Spoofed Number & Cloned Voice**
  - *Attacker:* Uses Priya's cloned voice and spoofed phone number (`9000014417`) to demand account balance and closure quote.
- **Step 2: Safe By Design**
  - *Agent:* Rejects caller ID as proof of identity.
  - *Attacker:* Attempts to guess details. Sensitive details are dispatched only to Priya's real registered phone.
  - *Highlight on screen:* Tier 2 approval card is pushed to Priya's real device (never tapped). Attacker receives nothing.
  - *Dashboard:* `/ops` live stream flags `BLOCKED` attempts and `APPROVAL_EXPIRED`.

---

## 4. Architecture & Technical Proof (2:50 – 3:30)
**Visual:** Architecture diagram + `/metrics` page.
- **Voiceover:**
  > "Under the hood, LoanLoop runs 100% on Gnani technologies:
  > - **Prisma STT v3** with 100 domain-specific banking keyterms.
  > - **Pampa LLM** with zero-temperature response adherence.
  > - **Timbre TTS** with native Indian rupee grouping and phonetic date formatting.
  >
  > Our FastAPI gateway enforces security tiers, Luhn card checks, and Fernet tokenization at rest. In benchmark load testing with Locust simulating 1,000 concurrent calls, the gateway achieved **p95 latency under 35 ms** across all actions with 0% error rate.
  >
  > Every spoken figure is derived directly from the core banking database via deterministic gateway contracts—preventing hallucinations by design."

---

## 5. Conclusion (3:30 – 3:45)
- **Voiceover:**
  > "LoanLoop transforms inbound borrower support into a safe, instant, and multilingual self-service experience. Thank you."

