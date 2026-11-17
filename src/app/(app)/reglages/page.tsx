import { createAdminClient } from "@/lib/supabase/admin";
import { Card, PageHeader, formatDateTime } from "@/components/ui";
import { PlaytomicConnect } from "@/components/PlaytomicConnect";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export default async function SettingsPage() {
  // playtomic_connections n'est lisible que côté serveur (secret chiffré) ;
  // on n'en extrait que l'état, jamais le secret.
  const { data: conn } = await createAdminClient()
    .from("playtomic_connections")
    .select("venue_id, status, last_success_at, last_error")
    .eq("club_id", ACACIAS_CLUB_ID)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Réglages" subtitle="Sources de données." />

      <Card title="Moja — tournois FFT">
        <p className="text-sm text-muted">
          Moja n&apos;a pas d&apos;API publique : la collecte tourne sur ton Mac, en lecture seule, avec ta propre session FFT. Depuis le dossier du projet :
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li><code className="rounded bg-background px-1.5 py-0.5">npm run moja:login</code> — une seule fois : tu te connectes dans la fenêtre qui s&apos;ouvre.</li>
          <li><code className="rounded bg-background px-1.5 py-0.5">npm run moja:collect -- --all</code> — premier import, tout l&apos;historique.</li>
          <li><code className="rounded bg-background px-1.5 py-0.5">npm run moja:collect</code> — ensuite, chaque matin (automatisable).</li>
        </ol>
      </Card>

      <Card title="Playtomic — réservations" className="mt-6">
        <p className="mb-4 text-sm text-muted">
          {conn?.status === "connected"
            ? `Connecté (lieu ${conn.venue_id}). Dernière synchronisation réussie : ${formatDateTime(conn.last_success_at)}. Synchronisation automatique chaque matin.`
            : "Non connecté. Les identifiants API sont dans ton espace Playtomic Manager ; ils sont testés puis stockés chiffrés."}
        </p>
        {conn?.last_error && <p className="mb-4 text-sm text-critical">Dernière erreur : {conn.last_error}</p>}
        <PlaytomicConnect connected={conn?.status === "connected"} venueId={conn?.venue_id ?? null} />
      </Card>
    </>
  );
}
