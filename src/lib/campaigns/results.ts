import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { brevo } from "@/lib/brevo/client";
import { chunk } from "@/lib/supabase/batch";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CampaignPerson {
  name: string;
  at: string;
}

export interface CampaignResult {
  id: string;
  name: string;
  sentAt: string | null;
  brevoCampaignId: number;
  target: string | null;
  stats: { sent: number; delivered: number; opened: number; clicked: number; unsubscribed: number; bounced: number; spam: number } | null;
  statsError: string | null;
  clickers: CampaignPerson[];
  openers: CampaignPerson[];
  unsubscribed: CampaignPerson[];
  registrations: CampaignPerson[];
}

interface GlobalStats {
  sent?: number;
  delivered?: number;
  uniqueViews?: number;
  uniqueClicks?: number;
  unsubscriptions?: number;
  hardBounces?: number;
  softBounces?: number;
  complaints?: number;
}

const fullName = (c: { first_name: string | null; last_name: string | null } | null) => [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "—";

/** E-mails des destinataires (liste Brevo), pour mesurer les inscriptions obtenues. */
async function listEmails(listId: number): Promise<string[]> {
  const emails: string[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const { data } = await brevo<{ contacts?: { email: string }[] }>(`/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`);
    const page = data?.contacts ?? [];
    emails.push(...page.map((c) => c.email.toLowerCase()));
    if (page.length < 500) break;
  }
  return emails;
}

export async function campaignResults(db: AdminClient, clubId: string): Promise<{ data: CampaignResult[]; error: string | null }> {
  const { data: campaigns, error } = await db
    .from("campaigns")
    .select("id, name, sent_at, brevo_campaign_id, brevo_list_id, target_event_id, tournament_events(label, tournaments(label))")
    .eq("club_id", clubId)
    .not("brevo_campaign_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { data: [], error: error.message };

  const results = await Promise.all(
    (campaigns ?? []).map(async (c): Promise<CampaignResult> => {
      const [stats, touch] = await Promise.all([
        brevo<{ statistics?: { globalStats?: GlobalStats } }>(`/emailCampaigns/${c.brevo_campaign_id}?statistics=globalStats`),
        db.from("touchpoints").select("type, occurred_at, contacts(first_name, last_name)").eq("campaign_id", c.id).in("type", ["opened", "clicked", "unsubscribed"]).order("occurred_at", { ascending: false }).limit(1000),
      ]);
      const g = stats.data?.statistics?.globalStats;
      const rows = (touch.data ?? []) as unknown as { type: string; occurred_at: string; contacts: { first_name: string | null; last_name: string | null } | null }[];
      const people = (type: string) => rows.filter((r) => r.type === type).map((r) => ({ name: fullName(r.contacts), at: r.occurred_at }));

      // Inscriptions à l'épreuve visée, par des destinataires, après l'envoi.
      let registrations: CampaignPerson[] = [];
      if (c.target_event_id && c.brevo_list_id && c.sent_at) {
        const emails = await listEmails(c.brevo_list_id);
        for (const part of chunk(emails, 200)) {
          const { data: regs } = await db
            .from("tournament_registrations")
            .select("registered_at, contacts!inner(first_name, last_name, email)")
            .eq("event_id", c.target_event_id)
            .gte("registered_at", c.sent_at)
            .in("contacts.email", part);
          registrations.push(...((regs ?? []) as unknown as { registered_at: string; contacts: { first_name: string | null; last_name: string | null } }[]).map((r) => ({ name: fullName(r.contacts), at: r.registered_at })));
        }
        registrations = registrations.sort((a, b) => b.at.localeCompare(a.at));
      }

      const ev = c.tournament_events as unknown as { label: string; tournaments: { label: string } | null } | null;
      return {
        id: c.id,
        name: c.name,
        sentAt: c.sent_at,
        brevoCampaignId: c.brevo_campaign_id,
        target: ev ? `${ev.tournaments?.label ?? ""} · ${ev.label}` : null,
        stats: g
          ? { sent: g.sent ?? 0, delivered: g.delivered ?? 0, opened: g.uniqueViews ?? 0, clicked: g.uniqueClicks ?? 0, unsubscribed: g.unsubscriptions ?? 0, bounced: (g.hardBounces ?? 0) + (g.softBounces ?? 0), spam: g.complaints ?? 0 }
          : null,
        statsError: stats.error,
        clickers: people("clicked"),
        openers: people("opened"),
        unsubscribed: people("unsubscribed"),
        registrations,
      };
    }),
  );
  return { data: results, error: null };
}
