"use client";
import { Button, Card } from "@/components/ui";
import { SEG } from "@/components/turn-stats";
import type { BenchRun } from "./api";

type Col = { label: string; get: (r: BenchRun) => number; fmt: (v: number) => string };
const ms = (v: number) => String(Math.round(v));
const COLS: Col[] = [
  { label: "Median total (ms)", get: (r) => r.summary.median_total_ms, fmt: ms },
  { label: "p95 total (ms)", get: (r) => r.summary.p95_total_ms, fmt: ms },
  { label: "Max total (ms)", get: (r) => r.summary.max_total_ms, fmt: ms },
  { label: "Avg STT (ms)", get: (r) => r.summary.avg.stt_ms, fmt: ms },
  { label: "Avg LLM (ms)", get: (r) => r.summary.avg.llm_ms, fmt: ms },
  { label: "Avg gateway (ms)", get: (r) => r.summary.avg.gateway_ms, fmt: ms },
  { label: "Avg TTS (ms)", get: (r) => r.summary.avg.tts_ms, fmt: ms },
  { label: "Avg other (ms)", get: (r) => r.summary.avg.other_ms, fmt: ms },
  { label: "Avg LLM calls", get: (r) => r.summary.avg.llm_calls, fmt: (v) => v.toFixed(1) },
  { label: "Errors", get: (r) => r.summary.errors, fmt: ms },
];
const BAR = ["stt", "llm", "gateway", "tts", "other"] as const;

const TURN_FIELDS = ["stt_ms", "llm_ms", "llm_calls", "gateway_ms", "gateway_calls", "tts_ms", "other_ms", "total_ms"] as const;
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function save(name: string, type: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function toCsv(runs: BenchRun[]) {
  const head = ["config", "llm", "model", "settings", "rep", "line_index", "ok", "error", ...TURN_FIELDS, "actions"];
  const rows = runs.flatMap((r) => r.turns.map((t) => [
    r.name, r.llm, r.model, JSON.stringify(r.settings), t.rep, t.index, t.ok, t.error ?? "",
    ...TURN_FIELDS.map((f) => t.timings?.[f] ?? ""), t.actions.join("|"),
  ]));
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function Compare({ runs }: { runs: BenchRun[] }) {
  if (!runs.length) return null;
  const best = COLS.map((c) => Math.min(...runs.map(c.get)));
  const multi = runs.length > 1;
  const maxTotal = Math.max(1, ...runs.map((r) => BAR.reduce((s, k) => s + r.summary.avg[`${k}_ms` as const], 0)));
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="serif text-2xl">Comparison</h2>
        <Button small variant="secondary" onClick={() => save("loanloop-bench.json", "application/json", JSON.stringify(runs, null, 2))}>Export JSON</Button>
        <Button small variant="secondary" onClick={() => save("loanloop-bench.csv", "text/csv", toCsv(runs))}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Benchmark results per config. A star marks the best (lowest) value in each column.</caption>
          <thead className="text-xs text-muted">
            <tr><th scope="col" className="py-1 pr-3 font-medium">Config</th>{COLS.map((c) => <th key={c.label} scope="col" className="px-2 py-1 font-medium">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 font-medium">{r.name}<span className="block text-xs font-normal text-muted">{r.llm} / {r.model}</span></th>
                {COLS.map((c, i) => {
                  const v = c.get(r), isBest = multi && v === best[i];
                  return (
                    <td key={c.label} className={`px-2 py-2 tabular-nums ${isBest ? "bg-sunken font-semibold" : ""}`}>
                      {isBest && <><span aria-hidden>★ </span><span className="sr-only">best: </span></>}{c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Average breakdown per turn</p>
        {runs.map((r) => (
          <div key={r.name} className="text-xs">
            <p>{r.name}</p>
            <div aria-hidden className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-sunken" style={{ width: `${(100 * BAR.reduce((s, k) => s + r.summary.avg[`${k}_ms` as const], 0)) / maxTotal}%` }}>
              {BAR.map((k) => <div key={k} className={SEG[k].c} style={{ flex: `${r.summary.avg[`${k}_ms` as const]} 1 0` }} />)}
            </div>
            <ul className="mt-0.5 flex flex-wrap gap-x-3 text-muted" aria-label={`${r.name} average breakdown`}>
              {BAR.map((k) => <li key={k} className="flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${SEG[k].c}`} />{SEG[k].k} {Math.round(r.summary.avg[`${k}_ms` as const])} ms</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {runs.map((r) => (
          <details key={r.name} className="rounded-lg border border-line bg-bg px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">{r.name}: per-turn detail ({r.turns.length} turns)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="text-muted"><tr>{["Rep", "Line", "OK", "Total", "STT", "LLM", "LLM calls", "Gateway", "TTS", "Other", "Actions"].map((h) => <th key={h} className="pr-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {r.turns.map((t, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td>{t.rep}</td><td>{t.index}</td><td>{t.ok ? "yes" : `no${t.error ? `: ${t.error}` : ""}`}</td>
                      <td>{t.timings?.total_ms ?? "-"}</td><td>{t.timings?.stt_ms ?? "-"}</td><td>{t.timings?.llm_ms ?? "-"}</td><td>{t.timings?.llm_calls === 0 ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-ok-bg text-ok-fg font-semibold border border-ok-border">⚡ 0 (FAQ)</span> : t.timings?.llm_calls ?? "-"}</td>
                      <td>{t.timings?.gateway_ms ?? "-"}</td><td>{t.timings?.tts_ms ?? "-"}</td><td>{t.timings?.other_ms ?? "-"}</td><td>{t.actions.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
