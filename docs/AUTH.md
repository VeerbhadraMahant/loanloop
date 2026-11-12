# Multi-Console Authentication & Route Guarding Specification

LoanLoop (Sahyadri Finance Bank voice servicing) operates across three distinct operational consoles with strict role isolation:

1. **Borrower (User)**: Phone-first console (`/user/*`). Mobile number + SMS OTP verification.
2. **Bank Staff**: Laptop/desktop operations desk (`/staff/*`, `/collections`, `/ops`, `/bank`). Staff ID + passcode / SSO.
3. **Developer**: Laptop/desktop engineering workbench (`/dev`, `/test-cases`, `/metrics`). Developer ID + API key/passcode.

---

## 1. Session Isolation Model

Signing into one console grants **zero permissions** in another console. Each role has independent session cookies and storage keys:

| Console Role | Session Cookie Key | LocalStorage Key | Idle Timeout | Default Route |
| :--- | :--- | :--- | :--- | :--- |
| **Borrower (`user`)** | `loanloop_session_user` | `loanloop.user_session` | 30 minutes | `/user/home` |
| **Bank Staff (`staff`)** | `loanloop_session_staff` | `loanloop.staff_session` | 60 minutes | `/staff/overview` |
| **Developer (`dev`)** | `loanloop_session_dev` | `loanloop.dev_session` | 4 hours | `/dev` |

Signing out of a console clears only that role's session cookie and cached local state.

---

## 2. Route Guarding Architecture (`web/proxy.ts`)

Next.js Turbopack proxy intercepts incoming HTTP requests and matches against the route access matrix in `web/lib/auth/auth-config.ts`:

- **Public Routes**: `/`, `/staff/login`, `/dev/login`, `/user/welcome`, `/user/language`, `/user/mobile`, `/user/otp`, static assets (`/_next/*`), and backend proxies (`/gw/*`, `/vx/*`).
- **Shared Engineering Tools**: `/call/*`, `/phone/*`, `/user/[customer]` remain unblocked to allow test automation harnesses, collections dialers, and cross-console inspection without deadlocks.
- **Protected Routes**:
  - Unauthenticated deep-link $\rightarrow$ redirects to `/<role>/login?returnTo=<encodedPath>`.
  - Authenticated with wrong role $\rightarrow$ redirects to `/<targetRole>/login?error=unauthorized&returnTo=<encodedPath>`.
  - Expired session $\rightarrow$ redirects to `/<role>/login?error=expired` and purges the stale cookie.
- **Bypass Flag**: Setting `AUTH_ENFORCE=0` in `.env.local` disables proxy guarding for isolated local debugging.
- **Fail-Closed Security**: If `AUTH_MODE !== 'dummy'` and no real auth adapter is configured, access is refused with `HTTP 403`.

---

## 3. Adapters Contract (`web/lib/auth/adapters/types.ts`)

Each console auth adapter implements `ConsoleAuthAdapter`:

```typescript
export interface ConsoleAuthAdapter {
  role: "user" | "staff" | "dev";
  getSession(): Promise<ConsoleSession | null> | ConsoleSession | null;
  signIn(credentials: SignInCredentials): Promise<SignInResult>;
  signOut(): Promise<void> | void;
}
```

Current dummy implementations live in:
- `web/lib/auth/adapters/user-adapter.ts`
- `web/lib/auth/adapters/staff-adapter.ts`
- `web/lib/auth/adapters/dev-adapter.ts`
- Factory lookup: `getAuthAdapter(role: ConsoleRole)` in `web/lib/auth/adapters/index.ts`.

---

## 4. How to Swap Dummy Auth for Real Auth When Teammate's Code Lands

When your teammate's backend authentication service is ready:

### Step 1: Create Real Adapters
Create `RealStaffAuthAdapter`, `RealDevAuthAdapter`, and `RealUserAuthAdapter` implementing `ConsoleAuthAdapter`:

```typescript
// Example: web/lib/auth/adapters/real-staff-adapter.ts
export class RealStaffAuthAdapter implements ConsoleAuthAdapter {
  role = "staff" as const;

  async signIn(credentials: SignInCredentials): Promise<SignInResult> {
    const res = await fetch("/api/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: credentials.identifier, passcode: credentials.passcode }),
    });
    if (!res.ok) return { success: false, error: (await res.json()).detail };
    const session = await res.json();
    // Set httpOnly cookie or client session
    return { success: true, session };
  }

  // ... implement getSession() and signOut()
}
```

### Step 2: Register in `web/lib/auth/adapters/index.ts`
Update `getAuthAdapter()` to check `AUTH_MODE`:

```typescript
export function getAuthAdapter(role: ConsoleRole): ConsoleAuthAdapter {
  if (process.env.AUTH_MODE === "real") {
    // return real adapter
  }
  // return dummy adapter
}
```

### Step 3: Switch Environment Configuration
In `.env` or production deployment variables:
```bash
AUTH_MODE=real
AUTH_ENFORCE=1
DEMO_HINTS_VISIBLE=0
```

No UI components, routing guards, or console dashboards need to be rewritten.
