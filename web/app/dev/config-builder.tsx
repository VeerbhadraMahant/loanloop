"use client";
import { useState } from "react";
import { Button, Card, Icon } from "@/components/ui";
import type { Cfg, DevConfig, Knob } from "./api";

const field =
  "h-9 w-full min-w-0 rounded-md border border-line bg-bg px-2.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]";

/** Options for a knob under the chosen provider; null = hide the knob. */
function optionsFor(k: Knob, llm: string) {
  return k.options_by_provider ? k.options_by_provider[llm] ?? null : k.options ?? null;
}

function StyledSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} appearance-none pr-8 cursor-pointer`}
      >
        {children}
      </select>
      <Icon
        name="chevron_down"
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

function StyledSwitch({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-line bg-bg px-2.5 text-xs transition-colors hover:bg-sunken/60"
    >
      <span className="font-mono text-[11px] text-fg">{checked ? "Enabled" : "Disabled"}</span>
      <span className="relative inline-flex items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full border border-line bg-sunken transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]" />
        <span className="pointer-events-none absolute left-0.5 h-3.5 w-3.5 rounded-full bg-card border border-line transition-transform peer-checked:translate-x-4 peer-checked:border-transparent" />
      </span>
    </label>
  );
}

function KnobField({
  k,
  llm,
  opts,
  value,
  onChange,
}: {
  k: Knob;
  llm: string;
  opts: (string | number)[] | null;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `knob-${k.key}`;
  const eff = value === undefined ? k.default : value;
  const isOverridden = value !== undefined && value !== k.default;
  const nullable = k.default == null || !!k.options_by_provider;
  const effLabel =
    eff == null || eff === ""
      ? `Effective: ${llm} default`
      : `Effective: ${String(eff)}`;

  let input: React.ReactNode;
  if (k.type === "bool") {
    input = (
      <StyledSwitch
        id={id}
        checked={eff === true}
        onChange={(checked) => onChange(checked)}
        label={k.label}
      />
    );
  } else if (k.type === "select" && opts) {
    // Options are addressed by index so numeric options keep their type (num_ctx must stay an int).
    const idx = eff == null ? -1 : opts.findIndex((o) => o === eff);
    input = (
      <StyledSelect
        id={id}
        value={idx < 0 ? "" : String(idx)}
        onChange={(v) => onChange(v === "" ? null : opts[Number(v)])}
      >
        {(nullable || idx < 0) && (
          <option value="">{`${llm} runtime default`}</option>
        )}
        {opts.map((o, i) => (
          <option key={i} value={i}>
            {String(o)}
          </option>
        ))}
      </StyledSelect>
    );
  } else if (k.type === "number") {
    input = (
      <input
        id={id}
        type="number"
        min={k.min}
        max={k.max}
        step={k.step}
        value={value == null ? "" : String(value)}
        placeholder={k.default == null ? `${llm} runtime default` : `${k.default} (default)`}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? k.default == null
                ? null
                : undefined
              : Number(e.target.value)
          )
        }
        className={`${field} num`}
      />
    );
  } else {
    input = (
      <input
        id={id}
        type="text"
        value={eff == null ? "" : String(eff)}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-line bg-surface-container-low p-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-semibold text-fg">
          {k.label}
        </label>
        <span
          className={`font-mono text-[10px] ${
            isOverridden ? "font-semibold text-primary" : "text-muted"
          }`}
        >
          {effLabel}
        </span>
      </div>
      {input}
      {k.help && <p className="text-[11px] leading-snug text-muted">{k.help}</p>}
    </div>
  );
}

export function ConfigBuilder({
  dev,
  cfg,
  setCfg,
  editing,
  onSave,
}: {
  dev: DevConfig;
  cfg: Cfg;
  setCfg: (c: Cfg) => void;
  editing: boolean;
  onSave: () => void;
}) {
  const groups = new Map<string, Knob[]>();
  for (const k of dev.knobs.filter(
    (k) => !k.options_by_provider || k.options_by_provider[cfg.llm]
  )) {
    const g = k.group ?? "Other";
    groups.set(g, [...(groups.get(g) ?? []), k]);
  }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    LLM: true,
    Latency: true,
    Speech: false,
    Conversation: false,
  });

  const models = dev.providers[cfg.llm]?.models ?? [];
  const effectiveModel = cfg.model || dev.providers[cfg.llm]?.default_model || `${cfg.llm} default`;

  const setSetting = (key: string, v: unknown) => {
    const s = { ...cfg.settings };
    if (v === undefined) delete s[key];
    else s[key] = v;
    setCfg({ ...cfg, settings: s });
  };
  const preset = (p: DevConfig["presets"][number]) =>
    setCfg({
      name: p.name,
      llm: p.llm,
      model: p.model ?? dev.providers[p.llm]?.default_model ?? "",
      settings: { ...p.settings },
    });

  return (
    <Card className="overflow-visible">
      {/* Sticky Preset & Save Bar */}
      <div className="sticky top-12 z-20 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-line bg-card/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Presets">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Presets:
          </span>
          {dev.presets.map((p) => (
            <Button key={p.name} small variant="secondary" onClick={() => preset(p)}>
              {p.name}
            </Button>
          ))}
        </div>
        <Button small onClick={onSave} disabled={!cfg.name.trim()}>
          {editing ? "Update config" : "Add to comparison"}
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Config builder</h2>
          <span className="font-mono text-[11px] text-muted">
            Effective runtime: {cfg.llm} / {effectiveModel}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="cfg-name" className="block text-xs font-medium text-fg">
              Config name
            </label>
            <input
              id="cfg-name"
              value={cfg.name}
              onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
              className={field}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cfg-llm" className="block text-xs font-medium text-fg">
              LLM provider
            </label>
            <StyledSelect
              id="cfg-llm"
              value={cfg.llm}
              onChange={(nextLlm) => {
                // provider-specific option values are not valid for another provider
                const s = { ...cfg.settings };
                for (const k of dev.knobs) if (k.options_by_provider) delete s[k.key];
                setCfg({
                  ...cfg,
                  llm: nextLlm,
                  model: dev.providers[nextLlm]?.default_model ?? "",
                  settings: s,
                });
              }}
            >
              {Object.entries(dev.providers).map(([id, p]) => (
                <option key={id} value={id} disabled={!p.ready}>
                  {id}
                  {p.ready ? "" : " (not configured)"}
                </option>
              ))}
            </StyledSelect>
          </div>
          <div className="space-y-1">
            <label htmlFor="cfg-model" className="block text-xs font-medium text-fg">
              Model
            </label>
            {models.length ? (
              <StyledSelect
                id="cfg-model"
                value={cfg.model}
                onChange={(m) => setCfg({ ...cfg, model: m })}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </StyledSelect>
            ) : (
              <input
                id="cfg-model"
                value={cfg.model}
                placeholder={dev.providers[cfg.llm]?.default_model ?? `${cfg.llm} default`}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                className={field}
              />
            )}
          </div>
        </div>

        {/* Collapsible Parameter Sections */}
        <div className="space-y-2">
          {[...groups].map(([g, ks]) => {
            const isOpen = openGroups[g] ?? false;
            const modCount = ks.filter(
              (k) => cfg.settings[k.key] !== undefined && cfg.settings[k.key] !== k.default
            ).length;
            return (
              <fieldset key={g} className="rounded-md border border-line bg-card">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [g]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-fg hover:bg-sunken/60 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon name={isOpen ? "chevron_down" : "chevron_right"} size={13} className="text-muted" />
                    <span>{g}</span>
                    <span className="font-mono text-[10px] font-normal text-muted">
                      ({ks.length} params)
                    </span>
                  </span>
                  {modCount > 0 && (
                    <span className="rounded border border-primary/25 bg-secondary-container px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-ink">
                      {modCount} modified
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="grid gap-2.5 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ks.map((k) => (
                      <KnobField
                        key={k.key}
                        k={k}
                        llm={cfg.llm}
                        opts={optionsFor(k, cfg.llm)}
                        value={cfg.settings[k.key]}
                        onChange={(v) => setSetting(k.key, v)}
                      />
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
