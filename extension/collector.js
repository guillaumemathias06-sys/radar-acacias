/**
 * Injecté dans l'onglet Moja ouvert par Guillaume, au clic sur « Envoyer à Radar ».
 * LECTURE SEULE : uniquement des GET sur l'API que l'interface Moja utilise
 * elle-même, avec la session de Guillaume, au rythme d'une consultation humaine.
 * Rien n'est jamais écrit dans Moja.
 */
(() => {
  if (window.__radarCollector) return;
  window.__radarCollector = true;

  const PAUSE_MS = 700;
  const RECENT_DAYS = 14;
  const DETAILS_PER_UPLOAD = 8;
  const MAX_PLAYER_PAGES = 40;
  const CLUB_CODE = "62060315"; // TC Acacias — Radar ne garde que les tournois du club
  let running = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- Bandeau de progression (en bas à droite de Moja) ---
  let box;
  function show(text, tone = "info", closable = false) {
    if (!box) {
      box = document.createElement("div");
      Object.assign(box.style, {
        position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647, maxWidth: "360px",
        padding: "12px 14px", borderRadius: "10px", font: "13px/1.4 system-ui, sans-serif",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)", whiteSpace: "pre-line",
      });
      document.body.appendChild(box);
    }
    const colors = { info: ["#111827", "#f9fafb"], ok: ["#065f46", "#ecfdf5"], error: ["#991b1b", "#fef2f2"] };
    [box.style.background, box.style.color] = colors[tone];
    box.textContent = "Radar — " + text;
    if (closable) {
      const close = document.createElement("button");
      close.textContent = "Fermer";
      Object.assign(close.style, { display: "block", marginTop: "8px", cursor: "pointer" });
      close.onclick = () => { box.remove(); box = null; };
      box.appendChild(close);
    }
  }

  // Moja range ses jetons dans les cookies « access_token » (5 min) et
  // « refresh_token », et l'application les renouvelle elle-même auprès du SSO
  // FFT quand il reste moins d'une minute. Pendant un long import l'application
  // est inactive : on fait comme elle. Les jetons renouvelés restent en mémoire
  // le temps de l'import ; les cookies de Moja ne sont jamais modifiés.
  const SSO_TOKEN_URL = "https://login.fft.fr/realms/connect/protocol/openid-connect/token";
  const SSO_CLIENT_ID = "moja-site";
  const REFRESH_MARGIN_S = 60;
  let memory = null; // { access, refresh }

  function cookie(name) {
    const row = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
  }
  function expOf(jwt) {
    try {
      return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp ?? 0;
    } catch {
      return 0;
    }
  }
  const now = () => Math.floor(Date.now() / 1000);

  async function accessToken(force = false) {
    // Le plus récent des deux : celui de l'application (si elle a renouvelé) ou le nôtre.
    const fromCookie = cookie("access_token");
    let access = [fromCookie, memory?.access].filter(Boolean).sort((a, b) => expOf(b) - expOf(a))[0] ?? null;
    if (!force && access && expOf(access) - now() > REFRESH_MARGIN_S) return access;

    const refresh = [cookie("refresh_token"), memory?.refresh].filter(Boolean).sort((a, b) => expOf(b) - expOf(a))[0];
    if (!refresh || expOf(refresh) <= now()) {
      throw new Error("Pas de session Moja valide dans cet onglet : recharge Moja, connecte-toi, puis reclique sur le bouton.");
    }
    const res = await fetch(SSO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: SSO_CLIENT_ID, refresh_token: refresh }),
    });
    if (!res.ok) throw new Error(`Moja refuse l'accès : renouvellement de session impossible (${res.status}). Recharge Moja puis reclique sur le bouton.`);
    const json = await res.json();
    memory = { access: json.access_token, refresh: json.refresh_token ?? refresh };
    return memory.access;
  }

  async function getJson(path) {
    await sleep(PAUSE_MS);
    const call = async (force) => fetch(new URL(path, location.origin), {
      credentials: "include",
      headers: { Accept: "application/json", Authorization: `Bearer ${await accessToken(force)}` },
    });
    let res = await call(false);
    if (res.status === 401) res = await call(true); // jeton expiré entre-temps : on renouvelle une fois
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Moja refuse l'accès (${res.status}) : recharge la page Moja puis reclique sur le bouton.`);
    }
    if (res.redirected || !type.includes("json")) {
      throw new Error(`Réponse Moja inattendue (${res.status}, ${type || "sans type"}) sur ${path}.`);
    }
    if (!res.ok) throw new Error(`Moja a répondu ${res.status} sur ${path}`);
    return res.json();
  }

  async function getAllPlayers(homId) {
    const all = [];
    const seen = new Set();
    for (let pack = 1; pack <= MAX_PLAYER_PAGES; pack++) {
      const batch = await getJson(`/moja/api/spa/joueurs?homId=${homId}&packIndex=${pack}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      let fresh = 0;
      for (const j of batch) {
        const key = String(j?.idCrm ?? JSON.stringify(j));
        if (!seen.has(key)) { seen.add(key); all.push(j); fresh++; }
      }
      if (fresh === 0) break; // Moja renvoie la même page : fin de liste
    }
    return all;
  }

  async function upload(payload) {
    const res = await chrome.runtime.sendMessage({ type: "radar-upload", payload });
    if (!res?.ok) throw new Error(res?.error ?? "Envoi vers Radar impossible.");
    return res;
  }

  async function run(mode) {
    const homologations = await getJson("/moja/api/spa/homologations");
    if (!Array.isArray(homologations)) throw new Error("Réponse Moja inattendue (homologations).");
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    // Tournois du club, non refusés par la Ligue (les autres font planter Moja et n'intéressent pas Radar).
    const clubHoms = homologations.filter((h) => h.codeClub === CLUB_CODE && h.statutValidationLigue !== "REFUSE");
    const targets = clubHoms.filter((h) => mode === "all" || !h.dateFin || String(h.dateFin).slice(0, 10) >= since);
    const failed = [];
    const collectedAt = new Date().toISOString();
    const totals = {};
    const warnings = new Set();
    let pending = {};
    let sent = 0;

    const flush = async () => {
      const res = await upload({ collectedAt, homologations: clubHoms, details: pending });
      for (const [k, v] of Object.entries(res.counts)) totals[k] = (totals[k] ?? 0) + (Number(v) || 0);
      res.warnings.forEach((w) => warnings.add(w));
      pending = {};
    };

    for (const [i, h] of targets.entries()) {
      show(`${i + 1}/${targets.length} tournois lus, ${sent} envoyés.\nGarde cet onglet ouvert.`);
      try {
        const epreuves = await getJson(`/moja/api/spa/epreuves?homId=${h.homId}`);
        const joueurs = await getAllPlayers(h.homId);
        const disponibilites = await getJson(`/moja/api/spa/disponibilites?homId=${h.homId}`);
        pending[String(h.homId)] = { epreuves, joueurs, disponibilites };
      } catch (err) {
        // Une session perdue arrête tout ; un tournoi illisible est seulement noté.
        if (String(err?.message ?? err).startsWith("Moja refuse") || String(err?.message ?? err).startsWith("Pas de session")) throw err;
        failed.push(`${h.libelle ?? h.homId} (${h.homId}) : ${err?.message ?? err}`);
        continue;
      }
      if (Object.keys(pending).length >= DETAILS_PER_UPLOAD) { const n = Object.keys(pending).length; await flush(); sent += n; }
    }
    if (Object.keys(pending).length || targets.length === 0) { const n = Object.keys(pending).length; await flush(); sent += n; }
    return { tournaments: sent, homologations: clubHoms.length, totals, warnings: [...warnings], failed };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "radar-collect") return false;
    if (running) { sendResponse({ started: false, reason: "Un envoi est déjà en cours dans cet onglet." }); return false; }
    running = true;
    sendResponse({ started: true });
    show(message.mode === "all" ? "Import de tout l'historique…" : "Envoi des tournois récents et à venir…");
    run(message.mode)
      .then((summary) => {
        chrome.runtime.sendMessage({ type: "radar-done", summary: { ok: true, mode: message.mode, ...summary } });
        const t = summary.totals;
        const extra = (summary.warnings.length ? `\n⚠️ ${summary.warnings.length} avertissement(s), voir Radar.` : "")
          + (summary.failed.length ? `\n⚠️ ${summary.failed.length} tournoi(s) illisible(s) dans Moja, ignoré(s) :\n${summary.failed.slice(0, 5).join("\n")}` : "");
        show(`Terminé : ${summary.tournaments} tournoi(s) envoyé(s), ${t.registrations ?? 0} inscription(s), ${t.contacts_created ?? 0} nouveau(x) contact(s).${extra}`, "ok", true);
      })
      .catch((err) => {
        chrome.runtime.sendMessage({ type: "radar-done", summary: { ok: false, mode: message.mode, error: String(err?.message ?? err) } });
        show(`Échec : ${err?.message ?? err}`, "error", true);
      })
      .finally(() => { running = false; });
    return false;
  });
})();
