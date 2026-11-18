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
          Moja n&apos;a pas d&apos;API et la FFT bloque les navigateurs automatisés. La collecte passe donc par l&apos;extension Chrome « Radar — Moja », dans ton Chrome habituel, en lecture seule, avec ta propre session.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li>Ouvre Moja et connecte-toi normalement.</li>
          <li>Clique sur l&apos;extension, puis « Importer tout l&apos;historique » la première fois.</li>
          <li>Ensuite, chaque matin : « Envoyer les tournois récents » (une dizaine de secondes).</li>
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
