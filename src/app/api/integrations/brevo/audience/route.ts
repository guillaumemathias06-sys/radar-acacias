import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamMember } from "@/lib/auth";
import { audienceFor } from "@/lib/campaigns/load";
import { createBrevoList } from "@/lib/brevo/client";
import { channelIdByName } from "@/lib/contacts/load";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export const maxDuration = 60;

const bodySchema = z.object({
  eventId: z.string().uuid(),
  scope: z.enum(["proche", "inferieur", "tout"]),
  action: z.enum(["preview", "export"]),
});

const EMAIL_CHANNEL = "E-mail joueurs de tournois";

/**
 * preview : compte l'audience. export : crée la liste dans Brevo et trace
 * une campagne « brouillon » dans Radar. Aucun e-mail n'est envoyé ici.
 */
export async function POST(req: Request) {
  if (!(await requireTeamMember())) return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  const { eventId, scope, action } = parsed.data;
  const db = createAdminClient();

  try {
    const { members, counts, target } = await audienceFor(db, ACACIAS_CLUB_ID, eventId, scope);
    if (action === "preview") return NextResponse.json({ ok: true, counts });
    if (!members.length) return NextResponse.json({ ok: false, error: "Audience vide : rien à envoyer à Brevo." }, { status: 400 });

    const stamp = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date());
    const name = `Radar · ${target.tournament} · ${{ proche: "niveaux proches", inferieur: "même niveau et en dessous", tout: "tout le padel" }[scope]} · ${stamp}`;
    const { listId, error } = await createBrevoList(name, members);
    if (error) return NextResponse.json({ ok: false, error, listId }, { status: 502 });

    const channelId = await channelIdByName(db, ACACIAS_CLUB_ID, EMAIL_CHANNEL);
    if (channelId) {
      await db.from("campaigns").insert({
        club_id: ACACIAS_CLUB_ID,
        channel_id: channelId,
        name,
        objective: `Remplir ${target.tournament} (${target.event}) — liste Brevo #${listId}, ${members.length} contact(s).`,
        status: "draft",
        starts_on: new Date().toISOString().slice(0, 10),
        utm_campaign: `radar-${target.padelCategory?.toLowerCase() ?? "padel"}-${eventId.slice(0, 8)}`,
      });
    }
    return NextResponse.json({ ok: true, counts, listId, listName: name });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
