import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Empty, PageHeader, formatDate, formatDateTime } from "@/components/ui";
import { BrevoAudience } from "@/components/BrevoAudience";
import { upcomingPadelEvents } from "@/lib/campaigns/load";
import { campaignResults } from "@/lib/campaigns/results";
import { CampaignResults } from "@/components/CampaignResults";
import { brevoAccount, brevoConfigured } from "@/lib/brevo/client";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export default async function CampaignsPage() {
  const db = createAdminClient();
  const [{ data: events, error }, account, results] = await Promise.all([
    upcomingPadelEvents(db, ACACIAS_CLUB_ID),
    brevoConfigured() ? brevoAccount() : Promise.resolve({ company: null, error: null }),
    brevoConfigured() ? campaignResults(db, ACACIAS_CLUB_ID) : Promise.resolve({ data: [], error: null }),
  ]);
  const connected = brevoConfigured() && !account.error;

  return (
    <>
      <PageHeader title="Campagnes" subtitle="Relancer les joueurs pour remplir un tournoi. Radar prépare la liste, l'envoi se fait dans Brevo." />

      <Card title="Brevo">
        {connected ? (
          <p className="text-sm text-ok">Connecté{account.company ? ` (${account.company})` : ""}.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {account.error && <p className="text-critical">{account.error}</p>}
            <p className="text-muted">Pour connecter Brevo : Brevo → ton nom en haut à droite → SMTP &amp; API → onglet « Clés API » → Générer une clé. Puis Vercel → projet radar → Settings → Environment Variables : <code>BREVO_API_KEY</code>, environnement Production, et redéploie.</p>
          </div>
        )}
      </Card>

      {(results.data.length > 0 || results.error) && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Résultats des campagnes</h2>
          {results.error && <p className="text-sm text-critical">{results.error}</p>}
          <div className="space-y-4">
            {results.data.map((r) => (
              <CampaignResults key={r.id} result={r} />
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Préparer une relance</h2>
      <div className="space-y-4">
        {error && <p className="text-sm text-critical">{error}</p>}
        {!events.length && !error && <Empty>Aucune épreuve de padel à venir avec inscriptions ouvertes dans les 30 prochains jours.</Empty>}
        {events.map((e) => (
          <Card key={e.eventId}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {e.tournament} <span className="text-muted">· {e.event}</span>
              </p>
              <p className="text-sm text-muted">
                {formatDate(e.startsOn)} · {e.registered ?? 0} inscrit(s) · clôture {formatDateTime(e.closesAt)}
              </p>
            </div>
            <BrevoAudience eventId={e.eventId} connected={connected} />
          </Card>
        ))}
      </div>
    </>
  );
}
