-- Une adresse e-mail familiale peut appartenir à plusieurs licenciés FFT
-- (parent + enfants). Radar ne fusionne jamais deux licenciés différents :
-- l'e-mail ne peut donc pas être unique. Index simple pour les recherches.
drop index if exists public.contacts_club_email_uq;
create index if not exists contacts_club_email_idx on public.contacts (club_id, email) where email is not null;
