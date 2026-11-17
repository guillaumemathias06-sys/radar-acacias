-- Radar — socle : contacts unifiés, canaux, campagnes, conversions,
-- tournois Moja, synchronisations. Un seul club (Acacias) pour l'instant,
-- mais chaque table métier porte déjà un club_id pour pouvoir s'ouvrir
-- à d'autres clubs plus tard sans migration de données.

create extension if not exists pgcrypto;

-- ─── Clubs ────────────────────────────────────────────────────────────
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fft_club_code text unique,          -- ex. 62060315 (TC Acacias)
  created_at timestamptz not null default now()
);

insert into public.clubs (id, name, fft_club_code)
values ('00000000-0000-0000-0000-000000000001', 'TC Acacias', '62060315');

-- ─── Canaux (prospection = on va chercher, acquisition = ils viennent) ─
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  kind text not null check (kind in ('prospection', 'acquisition')),
  name text not null,
  category text not null check (category in (
    'email', 'sms', 'whatsapp', 'phone', 'social', 'search', 'marketplace',
    'tournament', 'event', 'partnership', 'referral', 'print', 'website', 'other'
  )),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (club_id, name)
);

-- Canaux de départ : ceux qu'on sait déjà alimenter automatiquement.
insert into public.channels (club_id, kind, name, category) values
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Tournois FFT (Moja / Ten''Up)', 'tournament'),
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Playtomic', 'marketplace'),
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Bouche-à-oreille', 'referral'),
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Instagram', 'social'),
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Google', 'search'),
  ('00000000-0000-0000-0000-000000000001', 'acquisition', 'Site internet', 'website'),
  ('00000000-0000-0000-0000-000000000001', 'prospection', 'E-mail joueurs de tournois', 'email'),
  ('00000000-0000-0000-0000-000000000001', 'prospection', 'Partenariats entreprises / CE', 'partnership');

-- ─── Contacts (une fiche par personne, toutes sources confondues) ─────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  first_name text,
  last_name text,
  email text,                          -- toujours en minuscules
  phone text,                          -- normalisé +33…
  fft_crm_id bigint,                   -- identifiant licencié FFT (Moja idCrm)
  gender text check (gender in ('M', 'F')),
  sporting_age int,
  home_club_code text,
  home_club_name text,
  padel_rank int,
  tennis_rank text,
  lifecycle_stage text not null default 'prospect' check (lifecycle_stage in (
    'prospect', 'contacted', 'interested', 'converted', 'loyal', 'to_reactivate'
  )),
  acquisition_channel_id uuid references public.channels (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_activity_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_club_email_uq on public.contacts (club_id, email) where email is not null;
create unique index contacts_club_fft_uq on public.contacts (club_id, fft_crm_id) where fft_crm_id is not null;
create index contacts_club_phone_idx on public.contacts (club_id, phone);
create index contacts_last_activity_idx on public.contacts (club_id, last_activity_at desc);

-- D'où vient chaque fiche : une ligne par identité externe rattachée.
create table public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  source text not null check (source in ('moja', 'playtomic', 'manual', 'form', 'csv')),
  external_id text not null,
  first_seen_at timestamptz not null default now(),
  unique (source, external_id)
);
create index contact_identities_contact_idx on public.contact_identities (contact_id);

-- Consentement par canal (RGPD). Une ligne par (contact, canal).
create table public.consents (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'phone')),
  status text not null check (status in ('granted', 'denied', 'unknown')),
  legal_basis text check (legal_basis in ('consent', 'legitimate_interest')),
  source text not null,                -- ex. 'playtomic', 'moja_inscription', 'formulaire'
  recorded_at timestamptz not null default now(),
  primary key (contact_id, channel)
);

-- Désinscriptions : prioritaires sur tout le reste, jamais effacées.
create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text,
  phone text,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'phone', 'all')),
  reason text,
  created_at timestamptz not null default now()
);
create index suppressions_email_idx on public.suppressions (club_id, email);

-- ─── Campagnes et interactions ────────────────────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete restrict,
  name text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'done')),
  starts_on date,
  ends_on date,
  budget_cents int not null default 0,
  spent_cents int not null default 0,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create table public.touchpoints (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  channel_id uuid references public.channels (id) on delete set null,
  type text not null check (type in ('sent', 'opened', 'clicked', 'replied', 'call', 'meeting', 'visit', 'note')),
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index touchpoints_contact_idx on public.touchpoints (contact_id, occurred_at desc);

-- Un résultat concret : inscription tournoi, réservation, adhésion…
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null check (type in ('tournament_registration', 'booking', 'membership', 'lesson', 'other')),
  occurred_at timestamptz not null,
  value_cents int,
  source_system text not null check (source_system in ('moja', 'playtomic', 'manual')),
  external_ref text not null,
  attributed_channel_id uuid references public.channels (id) on delete set null,
  attributed_campaign_id uuid references public.campaigns (id) on delete set null,
  unique (source_system, external_ref)
);
create index conversions_contact_idx on public.conversions (contact_id, occurred_at);
create index conversions_club_date_idx on public.conversions (club_id, occurred_at);

-- ─── Tournois (miroir lecture seule de Moja) ──────────────────────────
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  moja_hom_id bigint not null unique,
  code text not null,                  -- code d'homologation
  label text not null,
  type_code text,                      -- T = tennis, P = padel
  category_code text,
  season int,                          -- millésime FFT
  starts_on date,
  ends_on date,
  ja_status text,
  league_status text,
  registered_count int,
  players_count int,
  events_count int,
  online_registration boolean,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);
create index tournaments_club_start_idx on public.tournaments (club_id, starts_on);

create table public.tournament_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  moja_epr_id bigint not null unique,
  label text not null,
  nature text,                         -- SM, SD, DM, DD, DX…
  age_category text,
  padel_category text,                 -- P25, P50, P100…
  rank_min text,
  rank_max text,
  age_min int,
  age_max int,
  fee_adult_cents int,
  fee_junior_cents int,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  registered_count int,
  starts_on date,
  ends_on date,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

-- Une ligne par joueur inscrit à une épreuve (une paire = 2 lignes).
create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tournament_events (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  moja_ins_id bigint not null,
  status_code text not null,           -- PAR, ATT… (code brut Moja)
  status text not null check (status in ('participant', 'waiting_list', 'other')),
  registered_at timestamptz,
  amount_due_cents int,
  amount_paid_cents int,
  synced_at timestamptz not null default now(),
  unique (moja_ins_id, contact_id)
);
create index tournament_registrations_contact_idx on public.tournament_registrations (contact_id);

-- Photo quotidienne du remplissage : sert aux courbes et aux alertes.
create table public.event_fill_snapshots (
  event_id uuid not null references public.tournament_events (id) on delete cascade,
  snapshot_date date not null,
  registered_count int not null,
  primary key (event_id, snapshot_date)
);

create table public.player_availabilities (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  general jsonb not null,              -- [{day:1..7, slots:[{from,to,available}]}]
  specific jsonb not null default '[]'::jsonb,
  updated_on date,
  primary key (tournament_id, contact_id)
);

-- ─── Segments ─────────────────────────────────────────────────────────
create table public.segments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null,
  created_at timestamptz not null default now()
);

-- ─── Connexions et synchronisations ───────────────────────────────────
create table public.playtomic_connections (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  venue_id text not null unique,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  encrypted_secret text,
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  source text not null check (source in ('moja', 'playtomic')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  error text
);
create index sync_runs_source_idx on public.sync_runs (club_id, source, started_at desc);

-- ─── Accès ────────────────────────────────────────────────────────────
-- Outil interne : seuls les membres de l'équipe listés ici ont accès.
-- Les inscriptions publiques Supabase doivent rester désactivées.
create table public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member(target_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where user_id = auth.uid() and club_id = target_club);
$$;

alter table public.clubs enable row level security;
alter table public.channels enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.consents enable row level security;
alter table public.suppressions enable row level security;
alter table public.campaigns enable row level security;
alter table public.touchpoints enable row level security;
alter table public.conversions enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_events enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.event_fill_snapshots enable row level security;
alter table public.player_availabilities enable row level security;
alter table public.segments enable row level security;
alter table public.playtomic_connections enable row level security; -- aucune policy : service-role uniquement
alter table public.sync_runs enable row level security;
alter table public.team_members enable row level security;

create policy team_read_club on public.clubs for select using (public.is_team_member(id));
create policy team_self on public.team_members for select using (user_id = auth.uid());

-- Tables portant directement club_id : lecture + écriture équipe.
do $$
declare t text;
begin
  foreach t in array array['channels', 'contacts', 'suppressions', 'campaigns', 'conversions', 'tournaments', 'segments', 'sync_runs'] loop
    execute format('create policy team_all on public.%I for all using (public.is_team_member(club_id)) with check (public.is_team_member(club_id))', t);
  end loop;
end $$;

create policy team_all on public.contact_identities for all
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.is_team_member(c.club_id)));
create policy team_all on public.consents for all
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.is_team_member(c.club_id)));
create policy team_all on public.touchpoints for all
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.is_team_member(c.club_id)));
create policy team_read on public.tournament_events for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_team_member(t.club_id)));
create policy team_read on public.tournament_registrations for select
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.is_team_member(c.club_id)));
create policy team_read on public.event_fill_snapshots for select
  using (exists (select 1 from public.tournament_events e join public.tournaments t on t.id = e.tournament_id
                 where e.id = event_id and public.is_team_member(t.club_id)));
create policy team_read on public.player_availabilities for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_team_member(t.club_id)));
