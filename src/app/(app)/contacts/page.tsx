import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, formatDate } from "@/components/ui";

const PAGE_SIZE = 50;

const STAGE_LABEL: Record<string, string> = {
  prospect: "Prospect",
  contacted: "Contacté",
  interested: "Intéressé",
  converted: "Converti",
  loyal: "Fidèle",
  to_reactivate: "À réactiver",
};

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);

  const db = await createClient();
  let query = db
    .from("contacts")
    .select("id, first_name, last_name, email, phone, home_club_name, padel_rank, tennis_rank, lifecycle_stage, last_activity_at, channels(name)", { count: "exact" })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`last_name.ilike.%${safe}%,first_name.ilike.%${safe}%,email.ilike.%${safe}%,home_club_name.ilike.%${safe}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Contacts" subtitle={`${total} fiche(s) — joueurs de tournois, clients Playtomic et prospects réunis.`} />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Rechercher un nom, un e-mail, un club…" className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      </form>
      <Card>
        {!data?.length ? (
          <Empty>{q ? "Aucun contact ne correspond." : "Aucun contact pour l'instant — ils arrivent avec les synchronisations Moja et Playtomic."}</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Club</th>
                  <th className="px-3 py-2 font-medium">Niveau</th>
                  <th className="px-3 py-2 font-medium">Origine</th>
                  <th className="px-3 py-2 font-medium">Étape</th>
                  <th className="px-5 py-2 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const channel = c.channels as unknown as { name: string } | null;
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-xs text-muted">{c.email ?? c.phone ?? "Pas de coordonnées"}</p>
                      </td>
                      <td className="px-3 py-3 text-muted">{c.home_club_name ?? "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted">
                        {[c.padel_rank ? `Padel ${c.padel_rank}` : null, c.tennis_rank ? `Tennis ${c.tennis_rank}` : null].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{channel?.name ?? "—"}</td>
                      <td className="px-3 py-3 text-xs">{STAGE_LABEL[c.lifecycle_stage] ?? c.lifecycle_stage}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDate(c.last_activity_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? <Link href={href(page - 1)} className="text-accent">← Précédent</Link> : <span />}
            <span className="text-muted">Page {page} / {pages}</span>
            {page < pages ? <Link href={href(page + 1)} className="text-accent">Suivant →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}
