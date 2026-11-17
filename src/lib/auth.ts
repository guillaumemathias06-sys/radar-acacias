import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACACIAS_CLUB_ID } from "@/lib/club";

/** Utilisateur connecté ET membre de l'équipe du club, sinon null. */
export async function requireTeamMember(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("team_members").select("user_id").eq("user_id", user.id).eq("club_id", ACACIAS_CLUB_ID).maybeSingle();
  return data ? { userId: user.id } : null;
}
