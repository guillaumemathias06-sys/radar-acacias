import { z } from "zod";

/**
 * Participants of a Playtomic booking (`participant_info.participants`,
 * returned by GET /api/v1/bookings — docs: third-party.playtomic.io/
 * endpoints/bookings/). Parsed on its own, per participant, NEVER as part
 * of `bookingSchema`: the 24-25/09 incident showed one over-strict field
 * rejects every real booking (Playtomic sends explicit `null` where its
 * docs say "optional"). A bad participant is skipped; the booking itself
 * is never lost because of it.
 */
const participantSchema = z
  .object({
    participant_id: z.string().min(1),
    participant_type: z.string().nullish(),
    name: z.string().nullish(),
    email: z.string().nullish(),
    accepts_commercial_communications: z.boolean().nullish(),
  })
  .passthrough();

export interface BookingParticipant {
  participantId: string;
  participantType: string | null;
  name: string | null;
  email: string | null;
  /** True ONLY if Playtomic says the player explicitly accepted marketing
   * from the venue — missing/null is treated as "no consent". */
  acceptsCommercial: boolean;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function extractParticipants(booking: unknown): BookingParticipant[] {
  if (!booking || typeof booking !== "object") return [];
  const info = (booking as Record<string, unknown>).participant_info;
  if (!info || typeof info !== "object") return [];
  const list = (info as Record<string, unknown>).participants;
  if (!Array.isArray(list)) return [];

  const byId = new Map<string, BookingParticipant>();
  for (const raw of list) {
    const parsed = participantSchema.safeParse(raw);
    if (!parsed.success) continue;
    const p = parsed.data;
    byId.set(p.participant_id, {
      participantId: p.participant_id,
      participantType: cleanText(p.participant_type),
      name: cleanText(p.name),
      email: cleanText(p.email)?.toLowerCase() ?? null,
      acceptsCommercial: p.accepts_commercial_communications === true,
    });
  }
  return [...byId.values()];
}
