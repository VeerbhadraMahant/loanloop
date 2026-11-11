import type { ReactNode } from "react";

export interface FilterGroup {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}

/** Search box plus any number of segmented filter groups. `children` goes on the right. */
export function FilterBar({ search, filters = [], children }: {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: FilterGroup[];
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {search && (
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">{search.placeholder ?? "Search"}</span>
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search"}
            className="min-h-10 w-full rounded-md border border-bank-line-strong bg-bank-surface px-3 text-bank-fg placeholder:text-bank-muted"
          />
        </label>
      )}
      {filters.map((f) => (
        <div key={f.label} role="radiogroup" aria-label={f.label} className="inline-flex overflow-hidden rounded-md border border-bank-line-strong bg-bank-surface">
          {f.options.map((o) => {
            const on = o.value === f.value;
            return (
              <button
                key={o.value} type="button" role="radio" aria-checked={on} onClick={() => f.onChange(o.value)}
                className={`min-h-10 cursor-pointer border-r border-bank-line px-3 text-sm font-medium transition-colors duration-150 last:border-r-0 ${on ? "bg-bank-accent text-bank-accent-fg" : "text-bank-fg hover:bg-bank-sunken"}`}
              >
                {o.label}
                {o.count != null && <span className="b-num ml-1.5 opacity-80">{o.count}</span>}
              </button>
            );
          })}
        </div>
      ))}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
