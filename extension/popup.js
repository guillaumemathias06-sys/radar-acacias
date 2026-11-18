const status = document.getElementById("status");
const buttons = [document.getElementById("recent"), document.getElementById("all")];

document.getElementById("options").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

function say(text, isError = false) {
  status.textContent = text;
  status.className = isError ? "error" : "";
}

async function init() {
  const { ingestSecret, lastRun } = await chrome.storage.local.get(["ingestSecret", "lastRun"]);
  if (lastRun) {
    const when = new Date(lastRun.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    document.getElementById("last").textContent = lastRun.ok
      ? `Dernier envoi : ${when}, ${lastRun.tournaments} tournoi(s).`
      : `Dernier envoi : ${when}, échec.`;
  }
  if (!ingestSecret) return say("Renseigne d'abord le secret Radar dans les Réglages.", true);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || new URL(tab.url).host !== "moja.fft.fr") {
    return say("Ouvre Moja dans cet onglet et connecte-toi, puis reclique sur l'extension.");
  }
  say("Moja est ouvert. Les données sont lues en lecture seule puis envoyées à Radar.");
  buttons.forEach((b) => (b.disabled = false));
  buttons[0].onclick = () => start(tab.id, "recent");
  buttons[1].onclick = () => {
    if (confirm("Importer tout l'historique Moja ? Ça peut prendre une quinzaine de minutes ; garde l'onglet Moja ouvert.")) start(tab.id, "all");
  };
}

async function start(tabId, mode) {
  buttons.forEach((b) => (b.disabled = true));
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["collector.js"] });
    const res = await chrome.tabs.sendMessage(tabId, { type: "radar-collect", mode });
    if (!res?.started) return say(res?.reason ?? "Impossible de démarrer.", true);
    say("C'est parti : suis la progression en bas à droite de Moja. Tu peux fermer cette fenêtre.");
  } catch (err) {
    say(`Impossible de démarrer : ${err.message ?? err}`, true);
    buttons.forEach((b) => (b.disabled = false));
  }
}

init();
