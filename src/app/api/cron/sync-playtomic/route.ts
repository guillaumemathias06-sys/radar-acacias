import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBearer } from "@/lib/security/bearer";
import { syncPlaytomic } from "@/lib/playtomic/sync";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export const maxDuration = 300;

/** Cron Vercel quotidien (vercel.json) : les 3 derniers jours, pour rattraper un éventuel raté. */
export async function GET(request: NextRequest) {
  if (!hasValidBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await syncPlaytomic(createAdminClient(), ACACIAS_CLUB_ID, 3);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
