import clsx from "clsx";
import type { ReactNode } from "react";
import type { FillLevel } from "@/lib/tournaments/fill";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-border bg-surface p-5", className)}>
      {title && <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const LEVEL_STYLE: Record<FillLevel, { label: string; className: string }> = {
  critical: { label: "Critique", className: "bg-critical-soft text-critical" },
  warning: { label: "À surveiller", className: "bg-warning-soft text-warning" },
  ok: { label: "Dans le rythme", className: "bg-ok-soft text-ok" },
  unknown: { label: "Sans référence", className: "bg-background text-muted" },
};

export function LevelBadge({ level }: { level: FillLevel }) {
  const s = LEVEL_STYLE[level];
  return <span className={clsx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));
}
