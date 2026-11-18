-- Moja « NPA » : inscrit mais n'a pas joué (non retenu, désinscrit ou forfait).
-- Déduit le 18/11/2026 des données : jamais payé ni dû, uniquement sur des
-- tournois passés, jamais cumulé avec PAR sur la même épreuve. Validé par Guillaume.
-- Jamais une conversion ; re-contactable comme la liste d'attente.
alter table public.tournament_registrations drop constraint tournament_registrations_status_check;
alter table public.tournament_registrations add constraint tournament_registrations_status_check
  check (status in ('participant', 'waiting_list', 'not_participant', 'other'));
update public.tournament_registrations set status = 'not_participant' where upper(trim(status_code)) = 'NPA';
