import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/selectAll";
import { Card, Empty, PageHeader } from "@/components/ui";
import { daysAgoIso } from "@/lib/data";

const CATEGORY_LABEL: Record<string, string> = {
  email: "E-mail", sms: "SMS", whatsapp: "WhatsApp", phone: "Téléphone", social: "Réseaux sociaux", search: "Recherche",
  marketplace: "Plateforme", tournament: "Tournois", event: "Événement", partnership: "Partenariat", referral: "Recommandation",
  print: "Print", website: "Site internet", other: "Autre",
};

export default async function ChannelsPage() {
  const db = await createClient();
  const since90 = daysAgoIso(90);
  const [{ data: channels, error }, contacts, conversions] = await Promise.all([
    db.from("channels").select("id, kind, name, category, active").order("kind").order("name"),
    selectAll<{ acquisition_channel_id: string | null }>((from, to) => db.from("contacts").select("acquisition_channel_id").order("id").range(from, to)),
    selectAll<{ attributed_channel_id: string | null }>((from, to) => db.from("conversions").select("attributed_channel_id").gte("occurred_at", since90).order("id").range(from, to)),
  ]);
  if (error) throw new Error(error.message);

  const count = <T,>(rows: T[], key: (r: T) => string | null) => rows.reduce((m, r) => m.set(key(r) ?? "", (m.get(key(r) ?? "") ?? 0) + 1), new Map<string, number>());
  const acquired = count(contacts.data, (r) => r.acquisition_channel_id);
  const converted = count(conversions.data, (r) => r.attributed_channel_id);

  const groups = [
    { kind: "acquisition", title: "Acquisition — ils viennent à nous" },
    { kind: "prospection", title: "Prospection — on va les chercher" },
  ];

  return (
    <>
      <PageHeader title="Canaux" subtitle="Chaque canal, ce qu'il a apporté et ce qu'il convertit. Les coûts et campagnes arrivent à l'étape suivante." />
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => {
          const rows = (channels ?? []).filter((c) => c.kind === g.kind);
          return (
            <Card key={g.kind} title={g.title}>
              {!rows.length ? (
                <Empty>Aucun canal.</Empty>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 font-medium">Canal</th>
                      <th className="pb-2 text-right font-medium">Contacts</th>
                      <th className="pb-2 text-right font-medium">Conv. 90 j</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="py-2.5">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted">{CATEGORY_LABEL[c.category] ?? c.category}</p>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{acquired.get(c.id) ?? 0}</td>
                        <td className="py-2.5 text-right tabular-nums">{converted.get(c.id) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
