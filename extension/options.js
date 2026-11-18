import { RADAR_URL } from "./config.js";

const input = document.getElementById("secret");
const result = document.getElementById("result");

chrome.storage.local.get("ingestSecret").then(({ ingestSecret }) => {
  if (ingestSecret) input.placeholder = "Secret enregistré (colle-en un nouveau pour le remplacer)";
});

document.getElementById("save").onclick = async () => {
  const secret = input.value.trim();
  if (!secret) return show("Colle d'abord le secret.", false);
  // Test sans rien écrire : un corps vide est refusé (400) si le secret est bon, 401 sinon.
  try {
    const res = await fetch(`${RADAR_URL}/api/ingest/moja`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: "{}",
    });
    if (res.status === 401) return show("Radar refuse ce secret. Vérifie la valeur INGEST_SECRET.", false);
    if (res.status !== 400) return show(`Réponse inattendue de Radar (${res.status}). Réessaie plus tard.`, false);
  } catch (err) {
    return show(`Radar injoignable : ${err.message ?? err}`, false);
  }
  await chrome.storage.local.set({ ingestSecret: secret });
  input.value = "";
  input.placeholder = "Secret enregistré";
  show("Secret enregistré et accepté par Radar. Tu peux ouvrir Moja et cliquer sur l'extension.", true);
};

function show(text, ok) {
  result.textContent = text;
  result.className = ok ? "ok" : "error";
}
