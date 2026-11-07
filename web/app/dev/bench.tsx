"use client";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, postJson, type BenchJob, type BenchRun, type Cfg, type DevConfig } from "./api";

const field = "min-h-11 rounded-lg border border-line bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function Bench({ dev, configs, customer, onRuns }: {
  dev: DevConfig; configs: Cfg[]; customer: string; onRuns: (r: BenchRun[]) => void;
}) {
  const [script, setScript] = useState(dev.scripts[0]?.name ?? "");
  const [lines, setLines] = useState((dev.scripts[0]?.lines ?? []).join("\n"));
  const [repeat, setRepeat] = useState(1);
  const [tts, setTts] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BenchJob | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = lines.split("\n").map((l) => l.trim()).filter(Boolean);
  const running = !!jobId && !err && (job === null || job.status === "running");
  const problem = !configs.length ? "Add at least one config to compare." : list.length < 1 || list.length > 12 ? "The script needs 1 to 12 lines." : null;

  useEffect(() => {
    if (!jobId) return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api<BenchJob>(`/dev/bench/${jobId}`);
        if (stop) return;
        setJob(j); if (j.runs) onRuns(j.runs);
        if (j.status === "error") { setErr(j.error ?? "benchmark failed"); return; }
        if (j.status === "done") return;
      } catch (e) { if (!stop) setErr(e instanceof Error ? e.message : "failed"); return; }
      t = setTimeout(tick, 1000);
    };
    t = setTimeout(tick, 0);
    return () => { stop = true; clearTimeout(t); };
  }, [jobId, onRuns]);

  const run = async () => {
    setErr(null); setJob(null); setJobId(null);
    try {
      const r = await postJson<{ job_id: string }>("/dev/bench", {
        configs: configs.map((c) => ({ name: c.name, llm: c.llm, ...(c.model ? { model: c.model } : {}), settings: c.settings })),
        script: list, repeat, tts, customer,
      });
      setJobId(r.job_id);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  };
  const pct = job && job.total_turns ? Math.round((100 * job.done_turns) / job.total_turns) : 0;

  return (
    <Card className="space-y-3 p-4">
      <h2 className="serif text-2xl">Benchmark</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">Script
          <select value={script} className={`${field} w-full font-normal`} onChange={(e) => {
            setScript(e.target.value); setLines((dev.scripts.find((s) => s.name === e.target.value)?.lines ?? []).join("\n"));
          }}>
            <option value="">(custom)</option>
            {dev.scripts.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Repeat (1 to 3)
          <input type="number" min={1} max={3} value={repeat} onChange={(e) => setRepeat(Math.min(3, Math.max(1, Number(e.target.value) || 1)))} className={`${field} w-full font-normal`} />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} className="h-5 w-5" /> TTS on
        </label>
      </div>
      <p className={`text-xs ${tts ? "font-medium text-warn-fg" : "text-muted"}`}>
        {tts ? "Warning: TTS (and voice input) spend Gnani credits. " : "Typed bench with TTS off spends no Gnani credits. "}
        Script lines are synthetic test lines.
      </p>
      <label className="block space-y-1 text-sm font-medium">Script lines (one per line, max 12)
        <textarea value={lines} rows={6} onChange={(e) => { setLines(e.target.value); setScript(""); }} className="w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={running || !!problem}>{running ? "Running…" : `Run on ${configs.length} config${configs.length === 1 ? "" : "s"}`}</Button>
        {problem && <span className="text-sm text-muted">{problem}</span>}
      </div>
      {jobId && (
        <div className="space-y-1">
          <progress max={100} value={pct} className="h-2 w-full" aria-label="Benchmark progress" />
          <p role="status" className="text-xs text-muted">{job ? `${job.done_turns} of ${job.total_turns} turns (${job.status})` : "Starting…"}</p>
        </div>
      )}
      {err && <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">Benchmark failed ({err}).</p>}
    </Card>
  );
}
