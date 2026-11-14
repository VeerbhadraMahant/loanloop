# LoanLoop: design information

Reference for a designer. It describes what exists today (main, commit b50e1fd, 2026-11-13). It is not a prompt and it does not propose a look.

## 1. What the product is

LoanLoop is a **voice service desk for a lender's borrowers**. A borrower calls in, in their own language, and the agent finishes the request on the same call: EMI amount and due date, "I already paid", why the EMI went up, change the EMI date, close the loan, send a statement, update the nominee or address, or hand over to a human.

- **Fictional lender:** "Sahyadri Finance Bank" (IFSC prefix `SAHY0`). All data is synthetic. No real bank branding.
- **Languages:** 11 modes: English, Hindi, Marathi, Hinglish, plus Bengali, Gujarati, Kannada, Malayalam, Punjabi, Tamil, Telugu. The seven non-core ones are marked **beta**.
- **Safe by design:** the agent never asks for or stores passwords, PINs, OTPs, CVV or card numbers. Screens never show a full account number, loan number, customer ID, mobile or email; only masked values (for example "ending 4417"). Full details go only to the customer's registered phone by SMS.
- **Trust tiers:** 0 public info; 1 registered mobile + DOB verified; 2 tier 1 + approval tapped in the bank app; 3 never (secrets).
- **Built for:** the Gnani.ai Great Indian AI Internship Challenge (deadline 15 Nov 2026). Speech (STT, TTS) is Gnani. The LLM is Sarvam by default, local qwen3:8b as fallback.

### Who uses it

| Person | Role | Door | Lands on |
|---|---|---|---|
| Borrower | `customer` | `/login` | `/user/home` |
| Bank manager | `bank_manager` | `/staff/login` | `/bank` |
| Engineer | `engineer` | `/staff/login` | `/dev` |
| Admin | `admin` | `/staff/login` | `/bank` (can open everything) |

Two separate sign-in doors, with no link switching between them. A page the role is not allowed to open returns a plain 404, not a "forbidden" screen.

## 2. The three surfaces

### 2.1 Landing page (`/`, public)

Marketing page for visitors with no session. Visitors who already have a session are redirected to their home.

Sections in order: top nav, Hero, Problem, Features, How it works, Security, Languages, Results, Two Doors (customer vs staff sign-in), About, Footer.
Content type: static text and plain links. Large type, wide layout (max width 1200px), alternating tonal panels (dawn, blush, mist, sand, lagoon, wine).
Components: `TopNav`, `Hero`, `Problem`, `Features`, `How`, `Security`, `Languages`, `Results`, `TwoDoors`, `About`, `Footer`, `Panel`, `Wordmark`, `Arrow`, button styles (primary, secondary, ghost on dark), link style.

### 2.2 Bank Console (`/bank`, staff: bank manager and admin)

A desktop control room for the bank's service team. Sidebar plus content area.

| Page | Purpose |
|---|---|
| `/bank` ("Today") | KPI tiles and what needs attention now |
| `/bank/conversations` | List of calls; opens a detail drawer with the call timeline (outcome, language, tier) |
| `/bank/handovers` | Queue of calls handed to humans, each with a case summary |
| `/bank/collections` | Collections cases and outbound calling |
| `/bank/requests` | Service requests raised by calls (EMI date change, closure, statement, nominee, address, reconciliation) |
| `/bank/security` | Blocked attempts, detected secrets, unapproved approvals (the attack view) |
| `/ops` | Live calls, per-call timeline, handover queue |
| `/collections`, `/call/outbound/[caseId]` | Collections view and an outbound call screen |
| `/staff`, `/staff/overview` | Unified staff desk: tabs for Collections and Ops views, with a slide-over call app |

Bank kit components (`components/bank/`):
- `BankShell`: sidebar (Today, Conversations, Handovers, Collections, Service requests, Security), mobile menu button, "Skip to content" link, connection state.
- `PageHeader` (title, description, actions)
- `KpiTile` (label, value, hint, tone, loading; coloured left edge)
- `StatusBadge` (tone: ok, warn, danger, info, neutral; adds a shape so colour is not the only signal)
- `DataTable` (typed columns, focusable rows, Enter/Space opens, arrow keys move, loading and empty states, caption)
- `DetailDrawer` (side drawer with focus trap, Esc to close)
- `FilterBar` (search box, filter groups with counts, right-hand slot)
- `EmptyState`, `ErrorState` (with retry)
- Formatters: rupees in Indian grouping (₹12,34,567), compact (₹4.5 L / ₹1.2 Cr), relative time, IST time.

Rules from the kit: one accent colour (deep blue), one primary button per view, spacing scale 4/8/12/16/24/32, touch targets at least 40px, compact density option, motion 140-200ms with reduced-motion respected, no page-load animation. Cards are `rounded-lg border p-4`.

### 2.3 Dev Console (`/dev`, engineer and admin)

A lab for engineers to measure and tune the voice agent.

| Page | Purpose |
|---|---|
| `/dev` (Lab) | Test the voice stack. Four tools: `LiveCall` (talk to the agent), `Compare` (same prompt across LLMs, with latency), `Bench` (STT and latency benchmark), `ConfigBuilder` (voice and LLM settings) |
| `/metrics` | Gateway latency p50/p95/p99 per action, task completion, handover rate, secrets detected, load-test and STT benchmark results |
| `/test-cases` | Scripted test calls and results |

Components: `DevShell` (tabs: Lab, Metrics, Test cases), `DevLabView`, `MetricsView`, `TestCasesView`, `TurnStats` (per-turn timings for STT, LLM, tools, TTS).
Uses monospaced type for numbers and timings. Hosted-LLM selection appears only in dev mode.

### 2.4 Customer app (`/user/*`, `/phone`, `/call`)

Phone-shaped borrower app. Onboarding screens are public; the rest need a customer sign-in.

| Route | Purpose |
|---|---|
| `/user/welcome` | Welcome |
| `/user/language` | Pick one of the 11 languages |
| `/user/mobile` | Enter registered mobile |
| `/user/otp` | Enter OTP (PIN-style boxes) |
| `/user/home` | Home: voice card ("talk to us") and quick actions |
| `/user/talk` | Hold-to-talk voice call screen |
| `/user/inbox` | SMS inbox (mock outbox) and approval requests |
| `/user/help` | Help |
| `/phone` | Mock bank app: live SMS inbox, approval card (Approve / Deny), recent activity, labelled "Demo app, synthetic data" |
| `/call` | Hold-to-talk caller page |

Components (`components/user/`): `UserShell`, `UnifiedUserShell` (four tabs: Console, Calling desk, Bank app, Account), `BottomNav`, `BottomSheet`, `LanguageSelector` (segmented or list), `OtpPinInput`, `QuickActionsGrid`, `VoiceCard`, `ApprovalCard`, and the tab views `ConsoleTab`, `CallingDeskTab`, `BankAppTab`, `AccountTab`. `SlideOver` (calling desk) embeds the call app inside staff screens.

### 2.5 Sign-in pages

`/login` (customer: mobile + passcode) and `/staff/login` (staff: email + password). Both use `LoginForm`. They render even if the gateway is down.

## 3. Shared building blocks

- `components/ui.tsx`: `Wordmark`, `Button`, `Card`, `Pill`, `Eyebrow`, `StatTile`, `Icon` (inline SVG paths), `ErrorBox`, `Empty`, `Skeleton`, `fmtTime`, `stagger` (staggered entrance helper).
- `components/ui/`: `Button` (variants), `Tooltip` (with floating-surface, anchor, portal and dismiss helpers).
- `components/sidebar-nav.tsx`: `SidebarProvider`, `SidebarNav`, `AppHeader`, `SidebarLayout`, `ThemeSelector`.
- `components/auth.tsx`, `components/login-form.tsx`: session and sign-in forms.
- `lib/i18n`: dictionaries for en, hi, mr (UI strings). `lib/languages.ts`: the 11 language modes.

## 4. Visual system today

- **Themes (three):** Bright (default: daylight slate with institutional cobalt `#1D4ED8`), Classic (lower-glare stone with slate-navy accent), Dark. Switch with `ThemeSelector`; stored per browser.
- **Tokens:** `--bg`, `--card`, `--line`, `--fg`, `--muted`, `--primary`, `--accent` (+ hover, soft, ink), status pairs `--ok-*`, `--warn-*`, `--danger-*`, surface layers (`--surface`, `--sunken`, container low/high), `--ring`, `--bezel` (phone frame). Bank screens add scoped `bank-*` tokens.
- **Type:** Plus Jakarta Sans (Latin UI), Noto Sans Devanagari (Hindi and Marathi), IBM Plex Mono (numbers, IDs, timings). Bank kit docs also name Inter for UI and Newsreader for titles, plus a tabular-figures class for money. Scale 12 / 14 / 18-20 / 28-30.
- **Status colours:** green ok, amber warn, red danger, blue info, grey neutral.
- **Motion:** ease-out `cubic-bezier(0.2, 0.8, 0.2, 1)`; short transitions; reduced motion respected.
- **Stack:** Next.js 16 (App Router), React 19, Tailwind 4. Plain prefixed CSS is used where CSS modules break (see `loanloop-css-modules-broken` note: module class lookups are undefined here).

## 5. Content and tone constraints that affect design

- Everything on screen is synthetic and should say so on demo surfaces ("Demo app, synthetic data").
- Only masked values appear: phone numbers as "ending 4417", account and loan numbers masked, never full.
- Money uses Indian digit grouping and the ₹ sign; times are IST.
- Numbers spoken by the agent come from the server's `speak` text, so screens should show that same text rather than re-formatting it.
- Language switching mid-call must be visible (current language chip). Beta languages need a beta marker.
- Security events (secret spoken, blocked attacker, unapproved approval) are first-class content on the Security page, not footnotes.
- Accessibility: skip link, focus trap in drawers, keyboard row navigation, 40px touch targets, colour never the only signal.

## 6. Live data behaviour

Bank, ops and metrics screens update live (server-sent events from the gateway) and also poll. The shell shows a connection state. Every list needs loading, empty and error states (components exist for all three).

## 7. Known gaps and notes

- A Refero-based redesign (`docs/DESIGN.md`, branch `feat/redesign`) was started and stopped on 2026-11-13. The current frontend is the last GitHub main.
- The customer app and staff desk shells came from two builders, so some screens use `ui.tsx` and others the `bank/` kit. Visual consistency between them is not guaranteed.
- `/user/home` has no loan or EMI figures yet (the gateway does not return them).
- `/user/talk` greets in Hindi regardless of the chosen language (known bug).
- Not built: multi-bank console, sign-up, password reset.
