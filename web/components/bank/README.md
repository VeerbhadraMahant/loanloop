# Bank app kit (`/bank`)

Staff console for Sahyadri Finance Bank (synthetic). Shell in `shell.tsx`, scoped tokens in `app/bank/bank.css`. Never link to /dev, /test-cases, /metrics, /call, /phone.

## Tokens (Tailwind classes, auto light/dark)
- Surfaces: `bg-bank-bg` (page), `bg-bank-surface` (cards/tables), `bg-bank-sunken` (headers, hover). Lines: `border-bank-line`, `border-bank-line-strong` (inputs).
- Text: `text-bank-fg`, `text-bank-muted` (secondary; AA on all surfaces).
- Accent (one, deep blue): `bg-bank-accent text-bank-accent-fg`, `bg-bank-accent-soft text-bank-accent-ink` (selected).
- Status: `bg-bank-{ok,warn,danger,info}-bg text-bank-{ok,warn,danger,info}-fg`.
- Type: Inter UI 14px (13 compact). Titles: class `b-title` (Newsreader). Figures: class `b-num` (tabular). Scale: 12 / 14 / 18-20 / 28-30.
- Density: `--b-cell-y` (12px / 6px compact). Use `py-[var(--b-cell-y)]` in custom rows.
- Motion: 140-200ms ease-out, `b-pressable` on buttons. No page-load animation. Reduced motion respected.

## Components (`@/components/bank/...`)
- `page-header`: `<PageHeader title description? actions? />`
- `kpi-tile`: `<KpiTile label value hint? tone? loading? />` (tone = ok|warn|danger|info|neutral, left edge)
- `status-badge`: `<StatusBadge tone="warn">Pending</StatusBadge>`
- `data-table`: `<DataTable caption columns rows rowKey onRowClick? loading? empty? selectedKey? />`; `Column = {key, header, cell(row), align?, num?, className?}`. Rows focusable, Enter/Space opens, arrows move.
- `detail-drawer`: `<DetailDrawer open onClose title subtitle?>...</DetailDrawer>` (focus trap, Esc, aria-modal, restores focus). Keep `selected` row in state; `open={!!selected}`.
- `filter-bar`: `<FilterBar search={{value,onChange,placeholder}} filters={[{label,value,onChange,options:[{value,label,count?}]}]}>right slot</FilterBar>`
- `states`: `<EmptyState title description? action? />`, `<ErrorState message onRetry? />` (pass `error` from useGet)
- `format`: `inr(n)` ₹12,34,567; `inrCompact(n)` ₹4.5 L / ₹1.2 Cr; `num(n)`; `relTime(iso)` "5 min ago"; `istTime(iso)` "12 Nov, 4:05 pm" (IST).

## Page conventions
- Page = `<div className="space-y-6">` with `PageHeader`, then optional `FilterBar`, then content. Shell supplies max-w 1280 and padding (16/24/32).
- Spacing scale 4/8/12/16/24/32 only. Grids: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`.
- Page files that fetch are `"use client"`; server-only pages may export `metadata = { title: "Name" }` (becomes "Name · Sahyadri Bank"). Client pages: title comes from layout default.
- Fetch with `useGet<T>(path, pollMs)` from `@/lib/api` (returns data, error, loading, reload). Live: `useEvents(cb)`; the shell already shows connection state. No second fetch layer.
- Render order: `error` -> `ErrorState`; `loading` -> `DataTable loading` / `KpiTile loading`; empty -> `EmptyState`.
- Only masked/redacted values from the gateway reach the browser; never display or request full identifiers.
- Cards: `rounded-lg border border-bank-line bg-bank-surface p-4`. One primary button per view: `b-pressable min-h-10 rounded-md bg-bank-accent px-4 font-medium text-bank-accent-fg`.
- Touch targets >= 40px; do not rely on colour alone (StatusBadge adds a shape).
