"use client";
import { useEffect, useState } from "react";
import { Approval, Sms, useEvents, useGet, post, GwEvent } from "@/lib/api";
import { Empty, ErrorBox, fmtTime } from "@/components/ui";

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return <span>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

export default function PhoneApp({ customer }: { customer: string }) {
  const base = `/phone/${encodeURIComponent(customer)}`;
  const me = useGet<{ name: string; mobile_masked: string }>(base, 0);
  const sms = useGet<Sms[]>(`${base}/sms`, 3000);
  const appr = useGet<Approval[]>(`${base}/approvals`, 3000);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  useEvents((e: GwEvent) => {
    if (e.customer_key !== customer) return;
    if (e.type === "sms") sms.reload();
    if (e.type === "approval") appr.reload();
  });

  const pending = (appr.data ?? []).find((a) => a.status === "pending");
  const act = async (id: string, verb: "approve" | "deny") => {
    setBusy(true); setActErr(null);
    try { await post(`${base}/approvals/${encodeURIComponent(id)}/${verb}`); await appr.reload(); }
    catch (e) { setActErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  };
  const err = me.error ?? sms.error ?? appr.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-200 p-4">
      <div className="flex h-[780px] w-[390px] max-w-full flex-col overflow-hidden rounded-[2.5rem] border-8 border-slate-800 bg-white shadow-xl">
        <header className="bg-blue-900 px-5 pb-3 pt-6 text-white">
          <p className="text-lg font-bold tracking-wide">Sahyadri Finance Bank</p>
          <p className="text-sm text-blue-100">{me.data ? `${me.data.name} · ${me.data.mobile_masked}` : customer}</p>
        </header>
        <p className="bg-amber-100 px-5 py-1 text-xs text-amber-900">Demo app · synthetic data</p>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <ErrorBox error={err} />
          {pending && (
            <section aria-labelledby="ap" className="rounded-xl border-2 border-blue-700 bg-blue-50 p-4">
              <h2 id="ap" className="font-semibold text-blue-900">Approval needed</h2>
              <p className="my-2 text-sm">{pending.purpose}</p>
              <p className="mb-3 text-xs text-slate-700">Expires in <Countdown to={pending.expires_at} /></p>
              {actErr && <p role="alert" className="mb-2 text-xs text-red-800">{actErr}</p>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => act(pending.id, "approve")}
                  className="flex-1 rounded bg-green-700 py-2 font-medium text-white disabled:opacity-50">Approve</button>
                <button disabled={busy} onClick={() => act(pending.id, "deny")}
                  className="flex-1 rounded bg-red-700 py-2 font-medium text-white disabled:opacity-50">Deny</button>
              </div>
            </section>
          )}
          <section aria-labelledby="sm">
            <h2 id="sm" className="mb-2 font-semibold">SMS inbox</h2>
            {!sms.data?.length ? <Empty>No messages yet.</Empty> : (
              <ul className="space-y-2">
                {[...sms.data].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => (
                  <li key={m.id} className="rounded-lg bg-slate-100 p-3 text-sm">
                    <p>{m.body}</p>
                    <p className="mt-1 text-xs text-slate-600">{fmtTime(m.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="ra">
            <h2 id="ra" className="mb-2 font-semibold">Recent activity</h2>
            {!appr.data?.length ? <Empty>No activity.</Empty> : (
              <ul className="divide-y text-sm">
                {[...appr.data].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 py-2">
                    <span>{a.purpose}</span>
                    <span className="shrink-0 text-xs font-medium text-slate-700">{a.status} · {fmtTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
