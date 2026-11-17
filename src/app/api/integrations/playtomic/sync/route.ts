import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamMember } from "@/lib/auth";
import { syncPlaytomic } from "@/lib/playtomic/sync";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export const maxDuration = 300;

/** Synchronisation manuelle. `?days=90` pour rattraper l'historique (max 180 jours). */
export async function POST(req: Request) {
  if (!(await requireTeamMember())) return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const result = await syncPlaytomic(createAdminClient(), ACACIAS_CLUB_ID, days);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
