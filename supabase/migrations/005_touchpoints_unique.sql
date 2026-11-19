-- L'index unique partiel de 004 ne peut pas servir à « ON CONFLICT » via
-- PostgREST (qui ne sait pas passer le prédicat WHERE). Index complet : les
-- touchpoints sans campagne (campaign_id NULL) restent libres, car deux NULL
-- ne sont jamais égaux pour un index unique.
drop index if exists public.touchpoints_campaign_contact_type_uq;
create unique index touchpoints_campaign_contact_type_uq on public.touchpoints (campaign_id, contact_id, type);
