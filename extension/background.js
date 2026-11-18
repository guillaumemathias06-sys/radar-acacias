import { RADAR_URL } from "./config.js";

/**
 * Seul le service worker parle à Radar : depuis la page Moja, un envoi vers
 * un autre site serait bloqué (CORS), et le secret n'a pas à transiter par la page.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "radar-upload") {
    upload(message.payload).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true; // réponse asynchrone
  }
  if (message?.type === "radar-done") {
    chrome.storage.local.set({ lastRun: { at: new Date().toISOString(), ...message.summary } });
  }
  return false;
});

async function upload(payload) {
  const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
  if (!ingestSecret) return { ok: false, error: "Secret Radar non renseigné (options de l'extension)." };
  const res = await fetch(`${RADAR_URL}/api/ingest/moja`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ingestSecret}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) return { ok: false, error: "Radar refuse le secret : vérifie-le dans les options de l'extension." };
  if (!res.ok) return { ok: false, error: `Radar a répondu ${res.status} : ${json.error ?? JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, counts: json.counts ?? {}, warnings: json.warnings ?? [] };
}
