import { Card, PageHeader } from "@/components/ui";
import { FillTable } from "@/components/FillTable";
import { loadFillStatuses } from "@/lib/data";

export default async function TournamentsPage() {
  const fill = await loadFillStatuses();
  return (
    <>
      <PageHeader
        title="Tournois à venir"
        subtitle="Remplissage comparé aux épreuves passées équivalentes (même catégorie). Mis à jour à chaque synchronisation Moja."
      />
      <Card>
        <FillTable rows={fill} />
      </Card>
    </>
  );
}
