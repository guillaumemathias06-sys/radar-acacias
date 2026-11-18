# Radar — acquisition & prospection (TC Acacias)

Logiciel indépendant de Jarvis. Un fichier contacts unique alimenté par Moja (tournois FFT) et Playtomic (réservations), des canaux d'acquisition et de prospection mesurés jusqu'à la conversion, et des alertes de remplissage des tournois.

## Stack
Next.js 16 (App Router, `proxy.ts`), Supabase (Postgres + Auth, RLS par équipe), Vercel. Tests : Vitest.

## Sources de données
| Source | Comment | Fréquence |
|---|---|---|
| Moja | Extension Chrome `extension/` — clic de Guillaume dans son Chrome habituel, connecté à Moja ; **lecture seule**, envoi vers `POST /api/ingest/moja` (secret `INGEST_SECRET`) | un clic chaque matin |
| Playtomic | API officielle (identifiants chiffrés en base), `GET /api/cron/sync-playtomic` (secret `CRON_SECRET`) | cron Vercel 5 h UTC |

Toute la logique d'import est pure et testée (`src/lib/moja/plan.ts`, `src/lib/playtomic/plan.ts`) ; les fichiers `ingest.ts` / `sync.ts` ne font qu'écrire le plan.

## Règles de conception
- Rapprochement des contacts : licence FFT > e-mail > téléphone + nom. Jamais sur le téléphone seul ; jamais deux licenciés différents fusionnés.
- Une valeur connue n'est jamais remplacée par une valeur vide.
- Consentement : « accordé » uniquement sur un oui explicite (Playtomic) ; Moja → « inconnu ». Un refus n'est jamais écrasé.
- Liste d'attente et statuts inconnus ne comptent jamais comme conversion.
- Toute lecture pouvant dépasser 1 000 lignes passe par `selectAll` (plafond silencieux de PostgREST).
- Toute route appelée par une machine est exemptée dans `proxy.ts` et vérifie son propre secret.

## Démarrage
```bash
cp .env.example .env.local   # puis remplir
supabase db push             # applique supabase/migrations
npm run dev
```
Après création du compte dans Supabase Auth, l'ajouter à l'équipe :
```sql
insert into team_members (user_id, club_id) values ('<uuid du compte>', '00000000-0000-0000-0000-000000000001');
```

## Extension Moja
La FFT bloque les navigateurs automatisés (« Accès temporairement restreint ») : **pas de script piloté, pas de contournement**. La collecte est déclenchée par un humain, dans son vrai Chrome.

1. `chrome://extensions` → Mode développeur → « Charger l'extension non empaquetée » → dossier `extension/`.
2. Réglages de l'extension → coller `INGEST_SECRET` (testé auprès de Radar avant d'être enregistré).
3. Sur Moja, connecté : cliquer l'extension → « Importer tout l'historique » (1re fois) ou « Envoyer les tournois récents ».

Si l'adresse de Radar change : `extension/config.js` et `host_permissions` dans `extension/manifest.json`.
