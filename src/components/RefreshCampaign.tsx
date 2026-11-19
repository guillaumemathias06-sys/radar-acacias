"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Rapatrie le détail par joueur depuis Brevo, puis recharge la page. */
export function RefreshCampaign({ brevoCampaignId }: { brevoCampaignId: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: true });

  async function refresh() {
    setState({ busy: true, message: null, ok: true });
    const res = await fetch("/api/integrations/brevo/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pull", campaignId: brevoCampaignId }) });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && json.ok !== false;
    setState({ busy: false, ok, message: ok ? null : json.error ?? "Échec." });
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={state.busy} onClick={refresh} className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-60">
        {state.busy ? "Actualisation…" : "Actualiser le détail"}
      </button>
      {state.message && <span className={`text-xs ${state.ok ? "text-muted" : "text-critical"}`}>{state.message}</span>}
    </span>
  );
}
