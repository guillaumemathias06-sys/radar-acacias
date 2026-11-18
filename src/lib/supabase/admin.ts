import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Nature de la clé serveur, sans jamais exposer sa valeur. Une clé publique
 * (publishable / anon) collée par erreur ne lève aucune erreur : la RLS
 * renvoie simplement des listes vides. On la détecte donc explicitement.
 */
export function describeServiceKey(key = process.env.SUPABASE_SERVICE_ROLE_KEY): string {
  if (!key) return "absente";
  if (key.includes("•")) return "masquée (copiée depuis l'affichage •••• au lieu du bouton Copier)";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable (clé publique, pas la secrète)";
  if (key.startsWith("eyJ")) {
    try {
      const role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
      return role === "service_role" ? "secret" : `jwt:${role} (clé publique, pas la service_role)`;
    } catch {
      return "jwt illisible";
    }
  }
  return "format inconnu";
}

/**
 * Client Supabase à privilèges complets. JAMAIS depuis un Client Component —
 * la garde `server-only` casse le build si c'est le cas.
 */
export function createAdminClient() {
  const kind = describeServiceKey();
  if (kind !== "secret") throw new Error(`SUPABASE_SERVICE_ROLE_KEY invalide : ${kind}.`);
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
