// Captures d'écran de recette, enregistrées sur disque — Supabase TEST seul.
//
// POURQUOI CE FICHIER
//
// Une capture prise à la main ne se compare pas : ni la taille, ni le compte
// connecté, ni le moment ne sont les mêmes deux fois. Un « avant / après »
// n'a de valeur que si les deux images sortent du même dispositif. Celui-ci
// pilote le Chrome déjà installé par le protocole DevTools — aucune
// dépendance à installer, aucun service tiers, aucun paquet nouveau.
//
// GARDE-FOUS
//   1. refus si l'URL Supabase du worktree ne vise pas le projet Test ;
//   2. refus de toute adresse hors `…@nexora-recette.invalid` ;
//   3. profil Chrome jetable, créé dans un dossier temporaire et supprimé :
//      la session de recette ne touche jamais le navigateur de Baptiste.
//
// Usage :
//   node scripts/recette/capture.mjs <email> <chemin-relatif> <fichier.png> [largeur] [hauteur]
//   node scripts/recette/capture.mjs <email> /dashboard atelier-avant.png 1280 900
//
// Variables utiles :
//   GESTES        une expression JavaScript par ligne, jouées avant la prise de vue
//   PLEINE_PAGE=1 capture toute la page, pas seulement l'écran
//   BLOQUER_URL   motifs d'URL à couper AVANT le chargement, séparés par des
//                 virgules — pour obtenir un vrai état d'erreur de chargement
//
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(RACINE + "/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const PROJET_TEST = "slawilafseganlbghgwx";
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes(PROJET_TEST)) {
  console.error(`REFUS : ce worktree ne vise pas le projet Test (${PROJET_TEST}).`);
  process.exit(2);
}

const [email, chemin, fichier, largeurArg, hauteurArg] = process.argv.slice(2);
if (!/^recette\.[a-z0-9.\-]+@nexora-recette\.invalid$/.test(email || "")) {
  console.error("REFUS : adresse hors du domaine synthétique nexora-recette.invalid");
  process.exit(2);
}
const largeur = Number(largeurArg || 1280);
const hauteur = Number(hauteurArg || 900);
// Le serveur de dev de CE worktree (config `nexora-constat-devis`) écoute sur
// 3000. L'ancien défaut, 3113, est celui d'un autre worktree
// (`nexora-atelier-continuite`) : une capture lancée sans PORT_APP y mesurait
// un autre code, sans erreur. Constaté le 15 septembre 2026.
const PORT_APP = process.env.PORT_APP || "3000";
console.log(`Application mesurée : http://localhost:${PORT_APP}`);
const DOSSIER = process.env.DOSSIER_CAPTURES || resolve(RACINE, "docs/recette/captures");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// --- La session de recette, ouverte par lien à usage unique ----------------
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: lien, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
if (error) { console.error("ÉCHEC lien :", error.message); process.exit(1); }
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: err2 } = await anon.auth.verifyOtp({ email, token: lien.properties.email_otp, type: "email" });
if (err2) { console.error("ÉCHEC session :", err2.message); process.exit(1); }
const cleSession = `sb-${url.match(/https:\/\/([a-z0-9]+)\./)[1]}-auth-token`;

// --- Chrome, en profil jetable --------------------------------------------
const profil = mkdtempSync(resolve(tmpdir(), "nexora-capture-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profil}`,
  `--window-size=${largeur},${hauteur}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const portDevtools = await new Promise((ok, ko) => {
  let tampon = "";
  const minuteur = setTimeout(() => ko(new Error("Chrome n'a pas annoncé son port")), 20000);
  chrome.stderr.on("data", (bloc) => {
    tampon += bloc.toString();
    const trouve = tampon.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (trouve) { clearTimeout(minuteur); ok(trouve[1]); }
  });
});

async function cibles() {
  const r = await fetch(`http://127.0.0.1:${portDevtools}/json/list`);
  return r.json();
}
const page = (await cibles()).find((c) => c.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => { ws.onopen = ok; });

let numero = 0;
const attentes = new Map();
ws.onmessage = (ev) => {
  const message = JSON.parse(ev.data);
  if (message.id && attentes.has(message.id)) {
    const { ok, ko } = attentes.get(message.id);
    attentes.delete(message.id);
    message.error ? ko(new Error(message.error.message)) : ok(message.result);
  }
};
function cdp(methode, params = {}) {
  const id = ++numero;
  ws.send(JSON.stringify({ id, method: methode, params }));
  return new Promise((ok, ko) => attentes.set(id, { ok, ko }));
}

const evaluer = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const patienter = (ms) => new Promise((ok) => setTimeout(ok, ms));

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: 2, mobile: largeur < 768 });

  // On pose la session sur la bonne origine : il faut y être avant d'écrire.
  await cdp("Page.navigate", { url: `http://localhost:${PORT_APP}/` });
  await patienter(2500);
  await evaluer(`localStorage.setItem(${JSON.stringify(cleSession)}, ${JSON.stringify(JSON.stringify(auth.session))})`);

  // Couper une requête précise avant de charger l'écran : c'est le seul moyen
  // d'obtenir un vrai état d'erreur de chargement, et de vérifier qu'il ne
  // ressemble pas à une journée vide. Motifs séparés par des virgules.
  if (process.env.BLOQUER_URL) {
    await cdp("Network.enable");
    await cdp("Network.setBlockedURLs", { urls: process.env.BLOQUER_URL.split(",").map((x) => x.trim()) });
  }

  await cdp("Page.navigate", { url: `http://localhost:${PORT_APP}${chemin}` });
  await patienter(Number(process.env.ATTENTE_MS || 9000));

  // Les gestes demandés avant la prise de vue, s'il y en a : une expression
  // JavaScript par ligne dans GESTES, jouée dans l'ordre. Sert à capturer un
  // écran qui n'existe qu'après un clic (un panneau ouvert, un filtre posé).
  //
  // Une ligne `touche:Tab`, `touche:Enter`, `touche:Space`, `touche:Escape` ou
  // `touche:Shift+Tab` envoie une VRAIE frappe par CDP (Input.dispatchKeyEvent,
  // avec key, code et windowsVirtualKeyCode). Sans `code`, un <button> natif ne
  // s'active pas : c'est ce qui avait fait croire, sur #100, qu'il fallait un
  // gestionnaire clavier. On mesure le comportement natif, sans en ajouter.
  const TOUCHES = {
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  };
  for (const geste of (process.env.GESTES || "").split("\n").filter(Boolean)) {
    // `fichier:<sélecteur CSS>|<chemin absolu>` : choisit un fichier dans un
    // <input type="file"> comme le sélecteur de fichiers du navigateur
    // (DOM.setFileInputFiles), puis laisse l'application réagir à `change`.
    if (geste.startsWith("fichier:")) {
      const [selecteur, cheminFichier] = geste.slice(8).split("|");
      const { root } = await cdp("DOM.getDocument", { depth: 0 });
      const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: selecteur.trim() });
      if (!nodeId) { console.log(`  fichier : aucun élément « ${selecteur} »`); continue; }
      await cdp("DOM.setFileInputFiles", { nodeId, files: [cheminFichier.trim()] });
      console.log(`  fichier ${cheminFichier.trim().split("/").pop()} → ${selecteur}`);
      await patienter(Number(process.env.ATTENTE_GESTE_MS || 1400));
      continue;
    }
    if (geste.startsWith("touche:")) {
      const nom = geste.slice(7).trim();
      const maj = nom.startsWith("Shift+");
      const t = TOUCHES[maj ? nom.slice(6) : nom];
      if (!t) { console.log(`  touche inconnue : ${nom}`); continue; }
      const modifiers = maj ? 8 : 0;
      await cdp("Input.dispatchKeyEvent", { type: t.text ? "keyDown" : "rawKeyDown", modifiers, ...t });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", modifiers, key: t.key, code: t.code, windowsVirtualKeyCode: t.windowsVirtualKeyCode });
      const focus = await evaluer("(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 60) : null })()");
      console.log(`  touche ${nom} → focus : ${JSON.stringify(focus)}`);
      await patienter(Number(process.env.ATTENTE_TOUCHE_MS || 400));
      continue;
    }
    const retour = await evaluer(geste);
    console.log(`  geste → ${JSON.stringify(retour)}`);
    await patienter(Number(process.env.ATTENTE_GESTE_MS || 1400));
  }

  const { data } = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: process.env.PLEINE_PAGE === "1",
  });
  const sortie = resolve(DOSSIER, fichier);
  // Le nom peut porter un sous-dossier (`parcours-2026-09-15/ecran.png`).
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, Buffer.from(data, "base64"));
  console.log(sortie);
} finally {
  ws.close();
  // Attendre la sortie effective de Chrome : il écrit encore dans son profil
  // au moment du `kill`, et supprimer le dossier trop tôt échoue en ENOTEMPTY
  // — après que la capture a réussi, ce qui donnait un faux échec.
  const sorti = new Promise((ok) => chrome.once("exit", ok));
  chrome.kill();
  await Promise.race([sorti, new Promise((ok) => setTimeout(ok, 3000))]);
  rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
