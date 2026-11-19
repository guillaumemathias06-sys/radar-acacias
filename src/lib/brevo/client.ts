import "server-only";

/**
 * Appels à l'API Brevo (v3). La clé vit uniquement dans la variable
 * d'environnement BREVO_API_KEY (Vercel) — jamais en base, jamais côté client.
 * Radar ne fait QUE préparer des listes : la rédaction et l'envoi de la
 * campagne restent un geste humain, dans Brevo.
 */
const BASE = "https://api.brevo.com/v3";

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

export async function brevo<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T | null; error: string | null }> {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) return { data: null, error: "Brevo n'est pas connecté (BREVO_API_KEY absente sur Vercel)." };
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { "api-key": key, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (json as { message?: string } | null)?.message ?? res.statusText;
    if (res.status === 401) return { data: null, error: `Clé Brevo refusée (401) : ${message}` };
    return { data: null, error: `Brevo ${res.status} : ${message}` };
  }
  return { data: json as T, error: null };
}

/** Nom de l'entreprise du compte Brevo, pour afficher l'état de connexion. */
export async function brevoAccount(): Promise<{ company: string | null; error: string | null }> {
  const { data, error } = await brevo<{ companyName?: string }>("/account");
  return { company: data?.companyName ?? null, error };
}

async function radarFolderId(): Promise<{ id: number | null; error: string | null }> {
  const list = await brevo<{ folders?: { id: number; name: string }[] }>("/contacts/folders?limit=50&offset=0");
  if (list.error) return { id: null, error: list.error };
  const found = list.data?.folders?.find((f) => f.name === "Radar");
  if (found) return { id: found.id, error: null };
  const created = await brevo<{ id: number }>("/contacts/folders", { method: "POST", body: { name: "Radar" } });
  return { id: created.data?.id ?? null, error: created.error };
}

/** Attributs prénom / nom tels que le compte les nomme (FIRSTNAME ou PRENOM selon l'ancienneté du compte). */
async function nameAttributes(): Promise<{ first: string | null; last: string | null }> {
  const { data } = await brevo<{ attributes?: { name: string; category: string }[] }>("/contacts/attributes");
  const names = new Set((data?.attributes ?? []).filter((a) => a.category === "normal").map((a) => a.name));
  return {
    first: ["FIRSTNAME", "PRENOM"].find((n) => names.has(n)) ?? null,
    last: ["LASTNAME", "NOM"].find((n) => names.has(n)) ?? null,
  };
}

export interface BrevoContact {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Crée une liste dans le dossier « Radar » et y importe les contacts.
 * Un contact déjà désinscrit dans Brevo le reste : l'import ne lève pas
 * la liste noire.
 */
export async function createBrevoList(name: string, contacts: BrevoContact[]): Promise<{ listId: number | null; error: string | null }> {
  const folder = await radarFolderId();
  if (folder.error || folder.id === null) return { listId: null, error: folder.error ?? "Dossier Brevo introuvable." };
  const list = await brevo<{ id: number }>("/contacts/lists", { method: "POST", body: { name, folderId: folder.id } });
  if (list.error || !list.data) return { listId: null, error: list.error ?? "Création de la liste Brevo impossible." };

  const attrs = await nameAttributes();
  const jsonBody = contacts.map((c) => {
    const attributes: Record<string, string> = {};
    if (attrs.first && c.firstName) attributes[attrs.first] = c.firstName;
    if (attrs.last && c.lastName) attributes[attrs.last] = c.lastName;
    return { email: c.email, attributes };
  });
  const imported = await brevo<{ processId: number }>("/contacts/import", {
    method: "POST",
    body: { jsonBody, listIds: [list.data.id], updateExistingContacts: true, emptyContactsAttributes: false },
  });
  if (imported.error) return { listId: list.data.id, error: `Liste créée mais import refusé : ${imported.error}` };
  return { listId: list.data.id, error: null };
}
