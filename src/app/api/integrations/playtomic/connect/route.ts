import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamMember } from "@/lib/auth";
import { encryptPlaytomicSecret, testPlaytomicCredentials } from "@/lib/playtomic/tokenManager";
import { testBookingsAccess } from "@/lib/playtomic/provider";
import { isSecretEncryptionConfigured } from "@/lib/security/secretEncryption";
import { ACACIAS_CLUB_ID } from "@/lib/club";

const bodySchema = z.object({
  venueId: z.string().trim().min(1),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
});

/** Teste réellement les identifiants Playtomic avant de les enregistrer, chiffrés. */
export async function POST(req: Request) {
  if (!(await requireTeamMember())) return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  if (!isSecretEncryptionConfigured()) {
    return NextResponse.json({ ok: false, error: "SECRETS_ENCRYPTION_KEY n'est pas configurée côté serveur." }, { status: 500 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Champs invalides" }, { status: 400 });
  const { venueId, clientId, clientSecret } = parsed.data;

  const token = await testPlaytomicCredentials(clientId, clientSecret);
  if (!token.token) return NextResponse.json({ ok: false, error: token.error ?? "Connexion refusée." });
  const access = await testBookingsAccess(token.token, venueId);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error ?? "Lecture des réservations impossible." });

  const encrypted = encryptPlaytomicSecret({ clientId, clientSecret });
  if (!encrypted) return NextResponse.json({ ok: false, error: "Échec du chiffrement." }, { status: 500 });

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("playtomic_connections")
    .upsert(
      { club_id: ACACIAS_CLUB_ID, venue_id: venueId, status: "connected", encrypted_secret: encrypted, connected_at: now, last_verified_at: now, last_error: null, updated_at: now },
      { onConflict: "venue_id" },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
