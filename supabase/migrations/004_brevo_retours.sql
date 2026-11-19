-- Retours des campagnes Brevo dans Radar (19/11/2026).
-- Une campagne Radar est reliée à sa liste et à sa campagne Brevo, et à
-- l'épreuve qu'elle doit remplir (pour mesurer les inscriptions obtenues).
alter table public.campaigns
  add column brevo_list_id int,
  add column brevo_campaign_id int unique,
  add column target_event_id uuid references public.tournament_events (id) on delete set null,
  add column sent_at timestamptz;

-- Événements e-mail reçus du webhook Brevo.
alter table public.touchpoints drop constraint touchpoints_type_check;
alter table public.touchpoints add constraint touchpoints_type_check check (type in (
  'sent', 'delivered', 'opened', 'clicked', 'replied', 'unsubscribed', 'bounced', 'spam',
  'call', 'meeting', 'visit', 'note'
));
-- Un seul événement de chaque type par contact et par campagne (ouvreurs /
-- cliqueurs uniques) : les renvois du webhook et les ouvertures répétées
-- n'ajoutent rien.
create unique index touchpoints_campaign_contact_type_uq on public.touchpoints (campaign_id, contact_id, type) where campaign_id is not null;

-- Rattrapage : la relance du P50 Hommes du 21/11 (liste 38, campagne 35).
update public.campaigns c
set brevo_list_id = 38,
    brevo_campaign_id = 35,
    sent_at = '2026-11-19T08:27:13+01:00',
    status = 'active',
    target_event_id = (select e.id from public.tournament_events e join public.tournaments t on t.id = e.tournament_id
                       where t.label = 'P50 HOMMES' and t.starts_on = '2026-11-21' limit 1)
where c.objective like '%liste Brevo #38,%';
