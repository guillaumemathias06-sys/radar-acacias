/**
 * Collecteur Moja — tourne sur le Mac de Guillaume, en LECTURE SEULE.
 *
 * Moja n'a pas d'API publique : ce script ouvre Moja dans un navigateur
 * piloté (Playwright) avec un profil dédié et persistant, puis lit les
 * mêmes données JSON que l'interface charge elle-même. Il n'écrit jamais
 * rien dans Moja et ne manipule jamais de mot de passe : la connexion
 * FFT se fait à la main, une seule fois, avec `npm run moja:login`.
 *
 *   npm run moja:login              ouvre Moja, tu te connectes, la session est gardée
 *   npm run moja:collect            tournois récents/à venir → Radar
 *   npm run moja:collect -- --all   tout l'historique (1er import, stats sur 6 ans)
 *   npm run moja:collect -- --dry-run   écrit le résultat dans un fichier, n'envoie rien
 *
 * Variables lues dans .env.local : RADAR_URL, INGEST_SECRET.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MOJA_HOME = "https://moja.fft.fr/moja/#/home";
const PROFILE_DIR = path.join(os.homedir(), ".radar", "moja-profile");
const PAUSE_MS = 700; // une requête toutes les ~0,7 s : on reste un utilisateur normal
const RECENT_DAYS = 14; // sans --all : tournois terminés depuis moins de 14 jours + à venir
const DETAILS_PER_UPLOAD = 8; // la limite de taille d'une requête Vercel est ~4,5 Mo
const MAX_PLAYER_PAGES = 40;

const args = new Set(process.argv.slice(2));
const LOGIN = args.has("--login");
const ALL = args.has("--all");
const DRY_RUN = args.has("--dry-run");

function loadEnv(): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(MOJA_HOME, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  return new URL(page.url()).host === "moja.fft.fr";
}

/** Appelle l'API interne depuis la page Moja elle-même (mêmes cookies, même origine). */
async function getJson<T>(page: Page, apiPath: string): Promise<T> {
  await sleep(PAUSE_MS);
  const result = await page.evaluate(async (p) => {
    const res = await fetch(p, { credentials: "include", headers: { Accept: "application/json" } });
    return { status: res.status, body: res.ok ? await res.json() : null };
  }, apiPath);
  if (result.status === 401 || result.status === 403) throw new Error(`Session Moja expirée (${result.status}) — relance « npm run moja:login ».`);
  if (result.status !== 200) throw new Error(`Moja a répondu ${result.status} sur ${apiPath}`);
  return result.body as T;
}

async function getAllPlayers(page: Page, homId: number): Promise<unknown[]> {
  const all: unknown[] = [];
  const seen = new Set<string>();
  for (let pack = 1; pack <= MAX_PLAYER_PAGES; pack++) {
    const batch = await getJson<unknown[]>(page, `/moja/api/spa/joueurs?homId=${homId}&packIndex=${pack}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    let fresh = 0;
    for (const j of batch) {
      const key = String((j as { idCrm?: number }).idCrm ?? JSON.stringify(j));
      if (!seen.has(key)) {
        seen.add(key);
        all.push(j);
        fresh++;
      }
    }
    if (fresh === 0) break; // Moja renvoie la même page : fin de liste
  }
  return all;
}

interface Homologation {
  homId: number;
  dateFin?: string | null;
  libelle?: string;
}

async function main() {
  const env = loadEnv();
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // channel "chrome" : utilise le Google Chrome déjà installé sur le Mac
  // (aucun navigateur à télécharger), avec son propre profil séparé.
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { channel: "chrome", headless: !LOGIN, viewport: { width: 1280, height: 900 } });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    if (LOGIN) {
      await page.goto(MOJA_HOME);
      console.log("Connecte-toi à Moja dans la fenêtre qui vient de s'ouvrir (coche « Se souvenir de moi » si proposé).");
      await page.waitForURL((url) => url.host === "moja.fft.fr" && url.hash.startsWith("#/home"), { timeout: 10 * 60_000 });
      console.log("✅ Connecté. La session est enregistrée dans", PROFILE_DIR);
      return;
    }

    if (!(await isLoggedIn(page))) {
      throw new Error("Pas de session Moja active — lance d'abord « npm run moja:login ».");
    }

    const homologations = await getJson<Homologation[]>(page, "/moja/api/spa/homologations");
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const targets = homologations.filter((h) => ALL || !h.dateFin || h.dateFin >= since);
    console.log(`${homologations.length} homologations, détail de ${targets.length} tournoi(s)…`);

    const details: Record<string, { epreuves: unknown[]; joueurs: unknown[]; disponibilites: unknown[] }> = {};
    for (const [i, h] of targets.entries()) {
      const epreuves = await getJson<unknown[]>(page, `/moja/api/spa/epreuves?homId=${h.homId}`);
      const joueurs = await getAllPlayers(page, h.homId);
      const disponibilites = await getJson<unknown[]>(page, `/moja/api/spa/disponibilites?homId=${h.homId}`);
      details[String(h.homId)] = { epreuves, joueurs, disponibilites };
      console.log(`  [${i + 1}/${targets.length}] ${h.libelle ?? h.homId} — ${joueurs.length} joueur(s)`);
    }

    const collectedAt = new Date().toISOString();
    if (DRY_RUN) {
      const out = path.join(os.homedir(), ".radar", `moja-${collectedAt.slice(0, 10)}.json`);
      fs.writeFileSync(out, JSON.stringify({ collectedAt, homologations, details }, null, 2));
      console.log("Mode essai : rien envoyé. Résultat écrit dans", out);
      return;
    }

    const radarUrl = env.RADAR_URL ?? process.env.RADAR_URL;
    const secret = env.INGEST_SECRET ?? process.env.INGEST_SECRET;
    if (!radarUrl || !secret) throw new Error("RADAR_URL et INGEST_SECRET doivent être définis dans .env.local");

    // Envoi par lots : la liste complète des homologations à chaque fois
    // (import idempotent), le détail de quelques tournois par lot.
    const keys = Object.keys(details);
    const batches = keys.length ? Array.from({ length: Math.ceil(keys.length / DETAILS_PER_UPLOAD) }, (_, i) => keys.slice(i * DETAILS_PER_UPLOAD, (i + 1) * DETAILS_PER_UPLOAD)) : [[]];
    for (const [i, batch] of batches.entries()) {
      const payload = { collectedAt, homologations, details: Object.fromEntries(batch.map((k) => [k, details[k]])) };
      const res = await fetch(new URL("/api/ingest/moja", radarUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Radar a refusé le lot ${i + 1}/${batches.length} (${res.status}) : ${JSON.stringify(json)}`);
      console.log(`  Lot ${i + 1}/${batches.length} importé :`, JSON.stringify(json.counts));
      if (json.warnings?.length) console.warn("  ⚠️", json.warnings.join("\n  ⚠️ "));
    }
    console.log("✅ Synchronisation Moja terminée.");
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
