import Link from "next/link";
import { Card, PageHeader, Stat, formatDateTime } from "@/components/ui";
import { FillTable } from "@/components/FillTable";
import { loadDashboardStats, loadFillStatuses } from "@/lib/data";

const SOURCE_LABEL: Record<string, string> = { moja: "Moja (tournois)", playtomic: "Playtomic (réservations)" };
const STATUS_LABEL: Record<string, string> = { completed: "OK", partial: "Partiel", failed: "Échec", running: "En cours" };

export default async function Dashboard() {
  const [stats, fill] = await Promise.all([loadDashboardStats(), loadFillStatuses()]);
  const alerts = fill.filter((s) => s.level === "critical" || s.level === "warning");

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Ce qui demande ton attention aujourd'hui." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Contacts" value={stats.contacts} hint="Toutes sources confondues" />
        <Stat label="Nouveaux (30 j)" value={stats.newContacts30} />
        <Stat label="Conversions (30 j)" value={stats.conversions30} hint="Inscriptions + réservations" />
        <Stat label="Opt-in e-mail" value={stats.emailOptIn} hint="Consentement explicite" />
      </div>

      <Card title={`Tournois à surveiller (${alerts.length})`} className="mt-6">
        <FillTable rows={alerts.slice(0, 8)} />
        {fill.length > 0 && (
          <Link href="/tournois" className="mt-4 inline-block text-sm text-accent hover:underline">
            Voir tous les tournois à venir →
          </Link>
        )}
      </Card>

      <Card title="Synchronisations" className="mt-6">
        <ul className="divide-y divide-border text-sm">
          {(["moja", "playtomic"] as const).map((source) => {
            const run = stats.lastSyncs.get(source);
            return (
              <li key={source} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>{SOURCE_LABEL[source]}</span>
                <span className="text-muted">
                  {run ? `${STATUS_LABEL[run.status] ?? run.status} · ${formatDateTime(run.finished_at ?? run.started_at)}` : "Jamais synchronisé"}
                </span>
                {run?.error && <p className="w-full text-xs text-critical">{run.error}</p>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
