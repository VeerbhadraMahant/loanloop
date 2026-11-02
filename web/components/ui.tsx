import Link from "next/link";

export function Shell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-4 py-6 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <nav aria-label="Main" className="flex gap-4 text-sm text-blue-800 underline">
          <Link href="/">Home</Link>
          <Link href="/ops">Ops</Link>
          <Link href="/metrics">Metrics</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
      Cannot reach the gateway ({error}). Showing the last data received, retrying.
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">{children}</p>;
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleTimeString();
}
