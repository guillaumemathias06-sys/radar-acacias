"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Trophy, Users, Radio, Settings } from "lucide-react";

const NAV = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/tournois", label: "Tournois", icon: Trophy },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/canaux", label: "Canaux", icon: Radio },
  { href: "/reglages", label: "Réglages", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:h-screen md:w-56 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-6">
      <div className="hidden px-3 pb-6 md:block">
        <p className="text-lg font-semibold tracking-tight">Radar</p>
        <p className="text-xs text-muted">TC Acacias</p>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={clsx("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm", active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-background hover:text-foreground")}>
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
