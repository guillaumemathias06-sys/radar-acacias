import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Empty, PageHeader, formatDate, formatDateTime } from "@/components/ui";
import { BrevoAudience } from "@/components/BrevoAudience";
import { upcomingPadelEvents } from "@/lib/campaigns/load";
import { brevoAccount, brevoConfigured } from "@/lib/brevo/client";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export default async function CampaignsPage() {
  const db = createAdminClient();
  const [{ data: events, error }, account] = await Promise.all([
    upcomingPadelEvents(db, ACACIAS_CLUB_ID),
    brevoConfigured() ? brevoAccount() : Promise.resolve({ company: null, error: null }),
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

      <div className="mt-6 space-y-4">
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
