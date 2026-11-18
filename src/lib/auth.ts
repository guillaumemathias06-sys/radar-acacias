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
  // Une erreur (clé serveur absente ou invalide) doit se voir, pas passer pour « non membre ».
  const { data, error } = await createAdminClient().from("team_members").select("user_id").eq("user_id", user.id).eq("club_id", ACACIAS_CLUB_ID).maybeSingle();
  if (error) throw new Error(`Vérification de l'équipe impossible : ${error.message}`);
  return data ? { userId: user.id } : null;
}
