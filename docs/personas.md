# Personas (fixed values, produced by `app/db/seed.py`)

All seed dates are relative to today (IST) at seed time; amounts, UTRs and rates are fixed. Reseed also flushes Redis `ll:*` keys. All data is synthetic.

## Priya Deshmukh (customer id 1) - Hinglish/Marathi, floating home loan
- Registered mobile `9000014417` (ending 4417), DOB `1991-08-14`, email priya.deshmukh@example.com, CIF `SFB00000001`
- Account ending `0417`, branch Sahyadri Finance Bank Kothrud, IFSC `SAHY0000101`
- Home loan, loan_last4 `7391`, principal 35,00,000, 240 months, floating, EMI day 5
- Rate reset effective 41 days ago (about 6 weeks): 8.75% -> 9.25%, EMI Rs 30,930 -> Rs 32,055 (current EMI 32,055), outstanding Rs 32,86,450
- Charges: bounce Rs 590 56 days ago, penal Rs 354 42 days ago
- Unmatched payment: 28 days ago (4 weeks), Rs 32,055, UTR `SAHYR61004738291`, channel upi

## Ramesh Patil (id 2) - Hindi, personal loan
- Mobile `9000023158`, DOB `1984-03-22`, Nashik Road branch, loan_last4 `5520`
- Personal loan Rs 5,00,000, 48 months, fixed 13.5%, EMI Rs 13,538, EMI day 10, outstanding Rs 3,91,800

## Sunita Kulkarni (id 3) - Marathi, vehicle loan, hardship
- Mobile `9000030912`, DOB `1979-11-05`, loan_last4 `8864`
- Vehicle loan Rs 8,00,000, 60 months, fixed 10.5%, EMI Rs 17,195, EMI day 15, outstanding Rs 6,12,300, loan status `hardship`

Seed: `cd gateway && uv run python ../tools/seed_data.py` (drops and recreates all tables in DATABASE_URL; 200 customers, 25 branches, 35 rate resets, 40 loans with charges, 25 unmatched payments, 5 hardship loans).

## Vikram Sawant (id 201, v2) - Hinglish, OUTBOUND collections demo persona
- Mobile `9000200201`, DOB `1988-06-17`, Hinjewadi branch, personal loan loan_last4 `9172`, Rs 4,00,000, 48 months, fixed 13%, outstanding Rs 3,31,500
- Two bounced EMIs, about 38-41 days past due (bucket 31-60); bounce charges Rs 590 each plus one penal charge. Low savings balance, no salary credit
- Collection case id = 201 (case id equals loan id for every seeded case). Start the outbound call: `POST /actions/start_call` body `{"call_id": "...", "language": "hinglish", "direction": "outbound", "case_id": 201}`; the agent asks for DOB only (`verify_caller` with `dob`, no mobile)
- v2 seed adds: balance and ~10 transactions per savings account (every 7th account has a hold), 32 more overdue loans (16 in 1-30, 8 in 31-60, 5 in 61-90, 3 in 90+) with bounced EMIs and charges, plus a few PTPs (open, kept, broken) and RTPs. Customers now total 201.
