import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { brevo } from "./client";
import { ingestBrevoEvents } from "./webhook";
import type { BrevoWebhookEvent, EmailEventType } from "./events";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Récupère chez Brevo le détail par destinataire (ouvreurs, cliqueurs,
 * désinscrits, rebonds) via l'export des destinataires d'une campagne, et
 * l'enregistre comme le ferait le webhook. Complète le webhook : il couvre
 * les campagnes envoyées avant son activation et les événements manqués.
 */
const EXPORTS: [string, EmailEventType][] = [
  ["openers", "opened"],
  ["clickers", "clicked"],
  ["unsubscribed", "unsubscribed"],
  ["hardBounces", "bounced"],
];

/** Colonne e-mail d'un CSV Brevo (séparateur ; ou ,). */
export function emailsFromCsv(csv: string): string[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim().toLowerCase());
  const col = header.findIndex((h) => h === "email" || h === "e-mail" || h === "email_id" || h.includes("email"));
  if (col < 0) return [];
  return [...new Set(lines.slice(1).map((l) => l.split(sep)[col]?.replace(/"/g, "").trim().toLowerCase()).filter((e): e is string => Boolean(e && e.includes("@"))))];
}

async function exportRecipients(campaignId: number, recipientsType: string): Promise<{ emails: string[]; error: string | null }> {
  const started = await brevo<{ processId: number }>(`/emailCampaigns/${campaignId}/exportRecipients`, { method: "POST", body: { recipientsType } });
  if (started.error || !started.data) return { emails: [], error: started.error ?? "Export Brevo impossible." };
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await brevo<{ status: string; export_url?: string }>(`/processes/${started.data.processId}`);
    // Export sans aucun destinataire (ex. personne n'a cliqué) : Brevo ne garde pas le processus.
    if (p.error && /processId is invalid/i.test(p.error)) return { emails: [], error: null };
    if (p.error) return { emails: [], error: p.error };
    if (p.data?.status === "completed") {
      if (!p.data.export_url) return { emails: [], error: null };
      const res = await fetch(p.data.export_url, { cache: "no-store" });
      if (!res.ok) return { emails: [], error: `Téléchargement de l'export : ${res.status}` };
      return { emails: emailsFromCsv(await res.text()), error: null };
    }
  }
  return { emails: [], error: `Export « ${recipientsType} » toujours en cours chez Brevo, réessaie dans une minute.` };
}

export async function pullCampaignDetail(db: AdminClient, clubId: string, brevoCampaignId: number): Promise<{ counts: Record<string, number>; errors: string[] }> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const results = await Promise.all(EXPORTS.map(async ([recipientsType, type]) => ({ type, ...(await exportRecipients(brevoCampaignId, recipientsType)) })));
  const events: BrevoWebhookEvent[] = [];
  const now = new Date().toISOString();
  for (const r of results) {
    if (r.error) errors.push(r.error);
    counts[r.type] = r.emails.length;
    events.push(...r.emails.map((email) => ({ type: r.type, email, brevoCampaignId, occurredAt: now, url: null, rawEvent: `export:${r.type}` })));
  }
  const ingest = await ingestBrevoEvents(db, clubId, events);
  return { counts: { ...counts, recorded: ingest.recorded }, errors };
}
