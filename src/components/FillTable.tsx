import type { FillStatus } from "@/lib/tournaments/fill";
import { Empty, LevelBadge, formatDate } from "@/components/ui";

export function FillTable({ rows }: { rows: FillStatus[] }) {
  if (!rows.length) return <Empty>Aucun tournoi à venir. Envoie tes tournois depuis Moja avec l&apos;extension Chrome (voir Réglages).</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-2 font-medium">Tournoi / épreuve</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Inscrits</th>
            <th className="px-3 py-2 font-medium">État</th>
            <th className="px-5 py-2 font-medium">Pourquoi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.event.id} className="border-b border-border last:border-0">
              <td className="px-5 py-3">
                <p className="font-medium">{s.event.tournamentLabel}</p>
                <p className="text-xs text-muted">{s.event.label}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {formatDate(s.event.startsOn)}
                <p className="text-xs text-muted">J-{s.daysLeft}</p>
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{s.event.registeredCount}</td>
              <td className="px-3 py-3">
                <LevelBadge level={s.level} />
              </td>
              <td className="px-5 py-3 text-xs text-muted">{s.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
