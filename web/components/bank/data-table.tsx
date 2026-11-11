"use client";
import type { KeyboardEvent, ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Tabular numerals, for figures. */
  num?: boolean;
  /** Tailwind width/visibility classes for the column, e.g. "w-32" or "hidden md:table-cell". */
  className?: string;
}

/** Sticky-header table. Rows are focusable when onRowClick is set: Enter/Space opens, Up/Down moves. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, empty, caption, selectedKey }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Rendered instead of the table when there are no rows (use EmptyState). */
  empty?: ReactNode;
  caption: string;
  selectedKey?: string | null;
}) {
  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick?.(row); }
    const sib = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.key === "ArrowUp" ? e.currentTarget.previousElementSibling : null;
    if (sib instanceof HTMLElement) { e.preventDefault(); sib.focus(); }
  };
  const cell = "px-3 py-[var(--b-cell-y)] align-middle";

  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-bank-line bg-bank-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-bank-sunken">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 text-xs font-medium text-bank-muted border-b border-bank-line ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-bank-line last:border-b-0" aria-hidden>
                  {columns.map((c) => (
                    <td key={c.key} className={`${cell} ${c.className ?? ""}`}><div className="skeleton h-4 w-3/4" /></td>
                  ))}
                </tr>
              ))
            : rows.map((r) => {
                const k = rowKey(r);
                return (
                  <tr
                    key={k}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={onRowClick ? k === selectedKey : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    onKeyDown={onRowClick ? (e) => onKey(e, r) : undefined}
                    className={`border-b border-bank-line last:border-b-0 ${onRowClick ? "cursor-pointer transition-colors duration-150 hover:bg-bank-sunken focus-visible:bg-bank-sunken" : ""} ${k === selectedKey ? "bg-bank-accent-soft" : ""}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`${cell} ${c.align === "right" ? "text-right" : ""} ${c.num ? "b-num" : ""} ${c.className ?? ""}`}>{c.cell(r)}</td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
