"use client";
import { useEffect, useState } from "react";
import { Button, Card, Pill, Shell } from "@/components/ui";
import { api, ApiError, type BenchRun, type Cfg, type DevConfig } from "./api";
import { Bench } from "./bench";
import { Compare } from "./compare";
import { ConfigBuilder } from "./config-builder";
import { LiveCall } from "./live-call";

const KEY = "loanloop.dev.configs";
const MAX = 4;
const CUSTOMERS = ["priya", "ramesh", "sunita"];
const OFF = "Dev mode is off: start the voice service with VOICE_DEV=1 (start.ps1 -Dev).";

export default function DevLab() {
  const [dev, setDev] = useState<DevConfig | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Cfg>({ name: "My config", llm: "ollama", model: "", settings: {} });
  const [saved, setSaved] = useState<Cfg[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [customer, setCustomer] = useState("priya");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage after mount
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "[]"); if (Array.isArray(s)) setSaved(s.slice(0, MAX)); } catch { /* storage blocked */ }
    api<DevConfig>("/dev/config").then(setDev)
      .catch((e) => setOff(e instanceof ApiError && e.status === 404 ? OFF : `Cannot reach the voice service (${e instanceof Error ? e.message : "failed"}).`));
  }, []);

  const persist = (list: Cfg[]) => {
    setSaved(list);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  };
  const uniqueName = (name: string, skip: number | null) => {
    let n = name.trim(), i = 2;
    while (saved.some((c, j) => j !== skip && c.name === n)) n = `${name.trim()} (${i++})`;
    return n;
  };
  const save = () => {
    setNote(null);
    if (editing !== null) {
      persist(saved.map((c, i) => (i === editing ? { ...cfg, name: uniqueName(cfg.name, editing) } : c)));
      setEditing(null); return;
    }
    if (saved.length >= MAX) { setNote(`At most ${MAX} configs. Remove one first.`); return; }
    persist([...saved, { ...cfg, name: uniqueName(cfg.name, null), settings: { ...cfg.settings } }]);
  };

  return (
    <Shell title="Developer lab" sub="Developer lab - dev only, synthetic data"
      status={dev && (
        <ul className="flex flex-wrap gap-1" aria-label="Provider readiness">
          {Object.entries(dev.providers).map(([id, p]) => <li key={id}><Pill tone={p.ready ? "ok" : "neutral"} icon={p.ready ? "check" : undefined}>{id}: {p.ready ? "ready" : "not configured"}</Pill></li>)}
        </ul>
      )}>
      {off && <p role="alert" className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">{off}</p>}
      {!dev && !off && <p className="text-muted">Loading…</p>}
      {dev && (
        <div className="space-y-6">
          <Card className="space-y-1 p-4 text-sm text-muted">
            <h2 className="font-medium text-fg">How to read this</h2>
            <p>Total is what the caller waits for. Check which component dominates (STT, LLM, gateway, TTS or server other) to know what to tune. A typed benchmark has no STT or TTS time, so it compares the LLM and gateway only. A star marks the best value per column.</p>
          </Card>
          <label className="flex max-w-xs items-center gap-3 text-sm font-medium">Customer
            <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-line bg-bg px-2 text-sm font-normal">
              {CUSTOMERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <ConfigBuilder dev={dev} cfg={cfg} setCfg={setCfg} editing={editing !== null} onSave={save} />
          {note && <p role="alert" className="text-sm text-danger-fg">{note}</p>}

          <section aria-label="Configs to compare" className="space-y-2">
            <h2 className="serif text-2xl">Configs to compare ({saved.length}/{MAX})</h2>
            {!saved.length && <p className="text-sm text-muted">None yet. Use Add to comparison above.</p>}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((c, i) => (
                <Card as="li" key={c.name} className="space-y-2 p-3 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">{c.llm} / {c.model || "default model"}</p>
                  <p className="break-words text-xs text-muted">{Object.keys(c.settings).length ? JSON.stringify(c.settings) : "default settings"}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button small variant="secondary" onClick={() => { setCfg({ ...c, settings: { ...c.settings } }); setEditing(i); }}>Edit</Button>
                    <Button small variant="secondary" disabled={saved.length >= MAX} onClick={() => persist([...saved, { ...c, name: uniqueName(`${c.name} copy`, null), settings: { ...c.settings } }])}>Duplicate</Button>
                    <Button small variant="secondary" onClick={() => { persist(saved.filter((_, j) => j !== i)); setEditing(null); }}>Remove</Button>
                  </div>
                </Card>
              ))}
            </ul>
          </section>

          <LiveCall cfg={cfg} customer={customer} />
          <Bench dev={dev} configs={saved} customer={customer} onRuns={setRuns} />
          <Compare runs={runs} />
        </div>
      )}
    </Shell>
  );
}
