import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBearer } from "@/lib/security/bearer";
import { mojaSnapshotSchema } from "@/lib/moja/schemas";
import { ingestMojaSnapshot } from "@/lib/moja/ingest";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export const maxDuration = 300;

/**
 * Reçoit les données collectées sur le Mac de Guillaume par
 * scripts/moja/collect.ts. Appelée sans session Supabase (le proxy la
 * laisse passer) : l'authentification est le secret INGEST_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBearer(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = mojaSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Format inattendu", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const result = await ingestMojaSnapshot(createAdminClient(), ACACIAS_CLUB_ID, parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
