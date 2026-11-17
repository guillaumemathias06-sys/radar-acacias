"use client";

import { useState } from "react";

export function PlaytomicConnect({ connected, venueId }: { connected: boolean; venueId: string | null }) {
  const [form, setForm] = useState({ venueId: venueId ?? "", clientId: "", clientSecret: "" });
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });

  async function call(url: string, body?: unknown) {
    setState({ busy: true, message: null, ok: false });
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.ok !== false, json };
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const { ok, json } = await call("/api/integrations/playtomic/connect", form);
    setState({ busy: false, ok, message: ok ? "Connecté. Lance une première synchronisation." : json.error ?? "Échec de la connexion." });
    if (ok) setForm((f) => ({ ...f, clientId: "", clientSecret: "" }));
  }

  async function sync(days: number) {
    const { ok, json } = await call(`/api/integrations/playtomic/sync?days=${days}`);
    setState({ busy: false, ok, message: ok ? `Synchronisé : ${json.counts?.conversions ?? 0} réservation(s)-joueur, ${json.counts?.contacts_created ?? 0} nouveau(x) contact(s).` : json.error ?? "Échec." });
  }

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-4">
      {connected && (
        <div className="flex flex-wrap gap-2">
          <button disabled={state.busy} onClick={() => sync(30)} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Synchroniser 30 jours</button>
          <button disabled={state.busy} onClick={() => sync(180)} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60">Rattraper 6 mois</button>
        </div>
      )}
      <form onSubmit={connect} className="grid gap-2 sm:grid-cols-3">
        <input required placeholder="Venue ID" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })} className={input} />
        <input required placeholder="Client ID" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={input} />
        <input required type="password" placeholder="Client secret" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} className={input} />
        <button disabled={state.busy} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60 sm:col-span-3 sm:justify-self-start">
          {connected ? "Remplacer les identifiants" : "Connecter Playtomic"}
        </button>
      </form>
      {state.busy && <p className="text-sm text-muted">En cours…</p>}
      {state.message && <p className={`text-sm ${state.ok ? "text-ok" : "text-critical"}`}>{state.message}</p>}
    </div>
  );
}
