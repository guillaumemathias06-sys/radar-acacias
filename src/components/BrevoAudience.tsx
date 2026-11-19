"use client";

import { useState } from "react";

type Counts = Record<string, number>;

const LABELS: [string, string][] = [
  ["joueurs_compatibles", "joueurs compatibles"],
  ["deja_inscrits", "déjà inscrits (exclus)"],
  ["sans_email", "sans e-mail"],
  ["refus", "refus e-mail"],
  ["desinscrits", "désinscrits"],
  ["emails_partages", "e-mails de famille fusionnés"],
];

export function BrevoAudience({ eventId, connected }: { eventId: string; connected: boolean }) {
  const [scope, setScope] = useState<"proche" | "tout">("proche");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });

  async function call(action: "preview" | "export", s = scope) {
    setState({ busy: true, message: null, ok: false });
    const res = await fetch("/api/integrations/brevo/audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, scope: s, action }) });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && json.ok !== false;
    if (json.counts) setCounts(json.counts);
    setState({
      busy: false,
      ok,
      message: !ok ? json.error ?? "Échec." : action === "export" ? `Liste « ${json.listName} » créée dans Brevo (${json.counts.audience} contacts). Brevo finit l'import en une minute environ ; crée ensuite ta campagne sur cette liste.` : null,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scope}
          onChange={(e) => { const s = e.target.value as "proche" | "tout"; setScope(s); setCounts(null); void call("preview", s); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm"
        >
          <option value="proche">Niveaux proches (± 1 catégorie)</option>
          <option value="tout">Tout le padel, même tableau</option>
        </select>
        <button disabled={state.busy} onClick={() => call("preview")} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60">Calculer l&apos;audience</button>
        <button
          disabled={state.busy || !connected || !counts?.audience}
          onClick={() => { if (confirm(`Créer une liste Brevo de ${counts?.audience} contacts ? (aucun e-mail n'est envoyé)`)) void call("export"); }}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Créer la liste dans Brevo
        </button>
      </div>
      {counts && (
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{counts.audience}</span> e-mails à contacter
          <span className="text-muted"> · {LABELS.filter(([k]) => counts[k]).map(([k, l]) => `${counts[k]} ${l}`).join(" · ")}</span>
        </p>
      )}
      {state.busy && <p className="text-sm text-muted">En cours…</p>}
      {state.message && <p className={`text-sm ${state.ok ? "text-ok" : "text-critical"}`}>{state.message}</p>}
    </div>
  );
}
