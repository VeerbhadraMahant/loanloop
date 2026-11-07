"use client";
import { Button, Card } from "@/components/ui";
import type { Cfg, DevConfig, Knob } from "./api";

const field = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/** Options for a knob under the chosen provider; null = hide the knob. */
function optionsFor(k: Knob, llm: string) {
  return k.options_by_provider ? k.options_by_provider[llm] ?? null : k.options ?? null;
}

function KnobField({ k, opts, value, onChange }: { k: Knob; opts: (string | number)[] | null; value: unknown; onChange: (v: unknown) => void }) {
  const id = `knob-${k.key}`;
  const eff = value === undefined ? k.default : value;
  const nullable = k.default == null || !!k.options_by_provider;
  let input: React.ReactNode;
  if (k.type === "bool") {
    input = <input id={id} type="checkbox" checked={eff === true} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5" />;
  } else if (k.type === "select" && opts) {
    // Options are addressed by index so numeric options keep their type (num_ctx must stay an int).
    const idx = eff == null ? -1 : opts.findIndex((o) => o === eff);
    input = (
      <select id={id} value={idx < 0 ? "" : String(idx)} onChange={(e) => onChange(e.target.value === "" ? null : opts[Number(e.target.value)])} className={field}>
        {(nullable || idx < 0) && <option value="">(provider default)</option>}
        {opts.map((o, i) => <option key={i} value={i}>{String(o)}</option>)}
      </select>
    );
  } else if (k.type === "number") {
    input = (
      <input id={id} type="number" min={k.min} max={k.max} step={k.step} value={value == null ? "" : String(value)}
        placeholder={k.default == null ? "provider default" : `default ${k.default}`}
        onChange={(e) => onChange(e.target.value === "" ? (k.default == null ? null : undefined) : Number(e.target.value))} className={field} />
    );
  } else { // "text" and any unknown type
    input = <input id={id} type="text" value={eff == null ? "" : String(eff)} onChange={(e) => onChange(e.target.value)} className={field} />;
  }
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{k.label}</label>
      {input}
      {k.help && <p className="text-xs text-muted">{k.help}</p>}
    </div>
  );
}

export function ConfigBuilder({ dev, cfg, setCfg, editing, onSave }: {
  dev: DevConfig; cfg: Cfg; setCfg: (c: Cfg) => void; editing: boolean; onSave: () => void;
}) {
  const groups = new Map<string, Knob[]>();
  for (const k of dev.knobs.filter((k) => !k.options_by_provider || k.options_by_provider[cfg.llm])) groups.set(k.group ?? "Other", [...(groups.get(k.group ?? "Other") ?? []), k]);
  const models = dev.providers[cfg.llm]?.models ?? [];
  const setSetting = (key: string, v: unknown) => {
    const s = { ...cfg.settings };
    if (v === undefined) delete s[key]; else s[key] = v;
    setCfg({ ...cfg, settings: s });
  };
  const preset = (p: DevConfig["presets"][number]) =>
    setCfg({ name: p.name, llm: p.llm, model: p.model ?? dev.providers[p.llm]?.default_model ?? "", settings: { ...p.settings } });

  return (
    <Card className="space-y-4 p-4">
      <h2 className="serif text-2xl">Config builder</h2>
      {dev.presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Presets">
          <span className="text-sm text-muted">Presets:</span>
          {dev.presets.map((p) => <Button key={p.name} small variant="secondary" onClick={() => preset(p)}>{p.name}</Button>)}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="cfg-name" className="block text-sm font-medium">Config name</label>
          <input id="cfg-name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} className={field} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cfg-llm" className="block text-sm font-medium">LLM provider</label>
          <select id="cfg-llm" value={cfg.llm} onChange={(e) => {
            // provider-specific option values are not valid for another provider
            const s = { ...cfg.settings };
            for (const k of dev.knobs) if (k.options_by_provider) delete s[k.key];
            setCfg({ ...cfg, llm: e.target.value, model: dev.providers[e.target.value]?.default_model ?? "", settings: s });
          }} className={field}>
            {Object.entries(dev.providers).map(([id, p]) => <option key={id} value={id} disabled={!p.ready}>{id}{p.ready ? "" : " (not configured)"}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cfg-model" className="block text-sm font-medium">Model</label>
          {models.length ? (
            <select id="cfg-model" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} className={field}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input id="cfg-model" value={cfg.model} placeholder="server default" onChange={(e) => setCfg({ ...cfg, model: e.target.value })} className={field} />
          )}
        </div>
      </div>
      {[...groups].map(([g, ks]) => (
        <fieldset key={g} className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted">{g}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ks.map((k) => <KnobField key={k.key} k={k} opts={optionsFor(k, cfg.llm)} value={cfg.settings[k.key]} onChange={(v) => setSetting(k.key, v)} />)}
          </div>
        </fieldset>
      ))}
      <Button onClick={onSave} disabled={!cfg.name.trim()}>{editing ? "Update config" : "Add to comparison"}</Button>
    </Card>
  );
}
