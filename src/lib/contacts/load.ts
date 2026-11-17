import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/selectAll";
import type { ContactRecord } from "./merge";

type AdminClient = ReturnType<typeof createAdminClient>;

export const CONTACT_COLUMNS =
  "id, first_name, last_name, email, phone, fft_crm_id, gender, sporting_age, home_club_code, home_club_name, padel_rank, tennis_rank, first_seen_at, last_activity_at";

export async function loadAllContacts(db: AdminClient, clubId: string): Promise<{ data: ContactRecord[]; error: { message: string } | null }> {
  return selectAll<ContactRecord>((from, to) => db.from("contacts").select(CONTACT_COLUMNS).eq("club_id", clubId).order("id").range(from, to));
}

export async function channelIdByName(db: AdminClient, clubId: string, name: string): Promise<string | null> {
  const { data } = await db.from("channels").select("id").eq("club_id", clubId).eq("name", name).maybeSingle();
  return data?.id ?? null;
}
