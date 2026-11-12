"use client";

import { useEffect, useState } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { api, ApiError, postJson, type BenchRun, type Cfg, type DevConfig } from "@/app/dev/api";
import { Bench } from "@/app/dev/bench";
import { Compare } from "@/app/dev/compare";
import { ConfigBuilder } from "@/app/dev/config-builder";
import { LiveCall } from "@/app/dev/live-call";

const KEY = "loanloop.dev.configs";
const MAX = 4;
const CUSTOMER = "priya";
const OFF = "Dev mode is off: start the voice service with VOICE_DEV=1 (start.ps1 -Dev).";

export function DevLabView({
  onLaunchCall: _onLaunchCall,
}: {
  onLaunchCall?: (customer?: string) => void;
} = {}) {
  const [dev, setDev] = useState<DevConfig | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Cfg>({ name: "My config", llm: "ollama", model: "", settings: {} });
  const [saved, setSaved] = useState<Cfg[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        if (Array.isArray(s)) return s.slice(0, MAX);
      } catch {
        /* storage blocked */
      }
    }
    return [];
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [warm, setWarm] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api<DevConfig>("/dev/config")
      .then(setDev)
      .catch((e) =>
        setOff(e instanceof ApiError && e.status === 404 ? OFF : e instanceof Error ? e.message : "Voice service request failed.")
      );
  }, []);

  const persist = (list: Cfg[]) => {
    setSaved(list);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* storage blocked */
    }
  };

  const uniqueName = (name: string, skip: number | null) => {
    let n = name.trim(),
      i = 2;
    while (saved.some((c, j) => j !== skip && c.name === n)) n = `${name.trim()} (${i++})`;
    return n;
  };

  const save = () => {
    setNote(null);
    if (editing !== null) {
      persist(saved.map((c, i) => (i === editing ? { ...cfg, name: uniqueName(cfg.name, editing) } : c)));
      setEditing(null);
      return;
    }
    if (saved.length >= MAX) {
      setNote(`At most ${MAX} configs. Remove one first.`);
      return;
    }
    persist([...saved, { ...cfg, name: uniqueName(cfg.name, null), settings: { ...cfg.settings } }]);
  };

  return (
    <div className="space-y-6">
      {/* Provider Readiness Bar */}
      {dev && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-line bg-card">
          <div>
            <h2 className="text-sm font-bold text-fg">Voice Engine &amp; Model Benchmark Lab</h2>
            <p className="text-xs text-muted mt-0.5">
              Live LLM provider parameters, cold-start warmups &amp; latency benchmark comparison.
            </p>
          </div>

          <ul className="flex flex-wrap gap-1.5" aria-label="Provider readiness">
            {Object.entries(dev.providers).map(([id, p]) => (
              <li key={id}>
                <Pill tone={p.ready ? "ok" : "neutral"} icon={p.ready ? "check" : undefined}>
                  {id}: {p.ready ? "ready" : "not configured"}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      )}

      {off && (
        <p role="alert" className="rounded-lg border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn-fg">
          {off}
        </p>
      )}

      {!dev && !off && <p className="text-xs text-muted">Loading Developer Lab…</p>}

      {dev && (
        <div className="space-y-5">
          <details className="rounded-lg border border-line bg-card px-3.5 py-2.5 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-fg">
              How to read benchmark timings &amp; caller selection
            </summary>
            <div className="mt-2 space-y-1 leading-relaxed">
              <p>
                Total is what the caller waits for. Check which component dominates (STT, LLM, gateway, TTS or server other) to know what to tune. A typed benchmark has no STT or TTS time, so it compares the LLM and gateway only. A star marks the best value per column.
              </p>
              <p>
                There is no customer selector: the voice service ignores it, and caller identity comes from the script or the verify line you type.
              </p>
            </div>
          </details>

          <ConfigBuilder dev={dev} cfg={cfg} setCfg={setCfg} editing={editing !== null} onSave={save} />
          {note && <p role="alert" className="text-xs font-medium text-danger-fg">{note}</p>}

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-3.5 py-2.5">
            <Button
              small
              variant="secondary"
              onClick={async () => {
                setWarm("Warming up…");
                try {
                  const w = await postJson<{ llm_ms?: number }>("/dev/warmup", {
                    llm: cfg.llm,
                    ...(cfg.model ? { model: cfg.model } : {}),
                  });
                  setWarm(`Warm-up done: LLM ${w.llm_ms ?? "?"} ms`);
                } catch (e) {
                  setWarm(`Warm-up failed (${e instanceof Error ? e.message : "error"})`);
                }
              }}
            >
              Warm up
            </Button>
            <span role="status" className="font-mono text-xs text-muted">
              {warm ?? "Loads the selected model so the first measured turn is not a cold start."}
            </span>
          </div>

          <section aria-label="Configs to compare" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Configs to compare ({saved.length}/{MAX})</h2>
            {!saved.length && <p className="text-xs text-muted">None yet. Use Add to comparison above.</p>}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((c, i) => (
                <Card as="li" key={c.name} className="space-y-2 p-3 text-xs">
                  <p className="font-semibold text-fg">{c.name}</p>
                  <p className="font-mono text-[11px] text-muted">
                    {c.llm} / {c.model || dev.providers[c.llm]?.default_model || `${c.llm} default`}
                  </p>
                  <p className="break-words font-mono text-[11px] text-muted">
                    {Object.keys(c.settings).length ? JSON.stringify(c.settings) : "effective runtime defaults"}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button small variant="secondary" onClick={() => { setCfg({ ...c, settings: { ...c.settings } }); setEditing(i); }}>
                      Edit
                    </Button>
                    <Button small variant="secondary" disabled={saved.length >= MAX} onClick={() => persist([...saved, { ...c, name: uniqueName(`${c.name} copy`, null), settings: { ...c.settings } }])}>
                      Duplicate
                    </Button>
                    <Button small variant="secondary" onClick={() => { persist(saved.filter((_, j) => j !== i)); setEditing(null); }}>
                      Remove
                    </Button>
                  </div>
                </Card>
              ))}
            </ul>
          </section>

          <LiveCall cfg={cfg} customer={CUSTOMER} />
          <Bench dev={dev} configs={saved} customer={CUSTOMER} onRuns={setRuns} />
          <Compare runs={runs} />
        </div>
      )}
    </div>
  );
}
