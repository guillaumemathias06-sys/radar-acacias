import { Card, formatDateTime } from "@/components/ui";
import type { CampaignResult, CampaignPerson } from "@/lib/campaigns/results";
import { RefreshCampaign } from "@/components/RefreshCampaign";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : "—");

function Kpi({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "ok" | "critical" }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "ok" ? "text-ok" : tone === "critical" ? "text-critical" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function People({ title, people, empty }: { title: string; people: CampaignPerson[]; empty: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} ({people.length})
      </p>
      {people.length ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {people.map((p, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(p.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

export function CampaignResults({ result: r }: { result: CampaignResult }) {
  const s = r.stats;
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">{r.name}</p>
          {r.target && <p className="text-sm text-muted">Objectif : remplir {r.target}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Envoyée {formatDateTime(r.sentAt)} · Brevo n° {r.brevoCampaignId}</p>
          <RefreshCampaign brevoCampaignId={r.brevoCampaignId} />
        </div>
      </div>

      {r.statsError && <p className="mb-3 text-sm text-critical">Statistiques Brevo indisponibles : {r.statsError}</p>}
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Délivrés" value={s.delivered} hint={`sur ${s.sent} envoyés`} />
          <Kpi label="Ouvreurs" value={s.opened} hint={pct(s.opened, s.delivered)} />
          <Kpi label="Cliqueurs" value={s.clicked} hint={pct(s.clicked, s.delivered)} />
          <Kpi label="Inscrits obtenus" value={r.registrations.length} tone={r.registrations.length ? "ok" : undefined} hint="après l'envoi" />
          <Kpi label="Désinscrits" value={s.unsubscribed} tone={s.unsubscribed ? "critical" : undefined} />
          <Kpi label="Rebonds · spam" value={s.bounced + s.spam} tone={s.bounced + s.spam ? "critical" : undefined} hint={`${s.bounced} rebond(s), ${s.spam} plainte(s)`} />
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <People title="Inscrits après l'e-mail" people={r.registrations} empty="Aucun pour l'instant (mis à jour à chaque import Moja)." />
        <People title="Ont cliqué" people={r.clickers} empty="Aucun clic reçu pour l'instant." />
        <People title="Ont ouvert" people={r.openers} empty="Clique sur « Actualiser le détail »." />
        <People title="Se sont désinscrits" people={r.unsubscribed} empty="Aucune désinscription." />
      </div>
      <p className="mt-4 text-xs text-muted">
        Chiffres globaux : Brevo, en direct. Détail par joueur : webhook Brevo en temps réel, sinon « Actualiser le détail » (fait aussi chaque matin ; Radar n'exporte chez Brevo que ce qui a changé, chaque export déclenche un mail de Brevo). Les ouvertures sont approximatives (Apple Mail ouvre automatiquement).
      </p>
    </Card>
  );
}
