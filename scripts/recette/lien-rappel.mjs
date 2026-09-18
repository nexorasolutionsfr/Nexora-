// Le lien d'un rappel par e-mail ramène-t-il à l'échéance ? — recette locale, base TEST.
//
//   node scripts/recette/lien-rappel.mjs <adresse du compte fictif> <id de la voiture> [http://localhost:3114]
//
// Chrome sans interface (page VISIBLE : requestAnimationFrame y tourne, ce qui
// n'est pas le cas d'un panneau de navigateur masqué), profil jetable :
//   A. sans session : le lien mène à la connexion EN GARDANT l'échéance
//      (…/auto/connexion?suite=/auto/vehicules/<id>?action=echeance_ct) ;
//   B. connexion : on arrive sur la voiture, l'échéance du contrôle à l'écran ;
//   C. session déjà ouverte : le lien amène directement à l'échéance.
// Refus de démarrer hors de la base Test. Aucun e-mail n'est envoyé.
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as attendre } from "node:timers/promises";
const require = createRequire(new URL("../../package.json", import.meta.url).pathname);
const { createClient } = require("@supabase/supabase-js");

const [email, vehiculeId, base = "http://localhost:3114"] = process.argv.slice(2);
if (!email || !/^[0-9a-f-]{36}$/.test(vehiculeId || "")) {
  console.error("Usage : node scripts/recette/lien-rappel.mjs <adresse> <id voiture> [racine]");
  process.exit(1);
}
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ""); }
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes("slawilafseganlbghgwx")) { console.error("Refus : pas la base Test."); process.exit(1); }
if (!email.endsWith("@nexora-recette.invalid")) { console.error("Refus : compte de recette @nexora-recette.invalid seulement."); process.exit(1); }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const lienRappel = `${base}/auto/vehicules/${vehiculeId}?action=echeance_ct`;
const connexionAttendue = `/auto/connexion?suite=/auto/vehicules/${vehiculeId}?action=echeance_ct`;
async function lienDeSession(redirection) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: redirection } });
  return (await fetch(data.properties.action_link, { redirect: "manual" })).headers.get("location");
}

const profil = `/tmp/nexora-lien-rappel-${process.pid}`;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${profil}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
await attendre(2500);
const page = (await (await fetch("http://127.0.0.1:9334/json")).json()).find((c) => c.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const attentes = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; attentes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluer = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const MESURE = `({ adresse: decodeURIComponent(location.pathname + location.search), visible: document.visibilityState, defilement: Math.round(scrollY), echeance: Math.round(document.getElementById('echeance-ct')?.getBoundingClientRect().top ?? -9999) })`;
const resultats = [];
const verifier = (nom, ok, detail) => { resultats.push(ok); console.log(`${ok ? "ok  " : "ÉCHEC"} ${nom} — ${JSON.stringify(detail)}`); };

await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// A. Sans session.
await cdp("Page.navigate", { url: lienRappel });
await attendre(5000);
let m = await evaluer(MESURE);
verifier("A. sans session : connexion, échéance gardée dans la destination", m.adresse === connexionAttendue, m);

// B. La personne se connecte (lien de session sur la page de connexion). On
//    passe d'abord par une autre page : revenir sur la même adresse en ne
//    changeant que l'ancre ne recharge pas l'application, la session ne serait
//    pas lue (piège rencontré le 18 sept. 2026).
await cdp("Page.navigate", { url: `${base}/auto/confidentialite` });
await attendre(2500);
await cdp("Page.navigate", { url: await lienDeSession(`${base}/auto/connexion?suite=${encodeURIComponent(`/auto/vehicules/${vehiculeId}?action=echeance_ct`)}`) });
await attendre(8000);
m = await evaluer(MESURE);
verifier("B. après connexion : la voiture, l'échéance à l'écran", m.adresse === `/auto/vehicules/${vehiculeId}` && m.defilement > 0 && m.echeance >= 0 && m.echeance < 220, m);

// C. Session ouverte : le lien du message, directement.
await cdp("Page.navigate", { url: `${base}/auto` });
await attendre(3000);
await cdp("Page.navigate", { url: lienRappel });
await attendre(6000);
m = await evaluer(MESURE);
verifier("C. session ouverte : directement l'échéance", m.adresse === `/auto/vehicules/${vehiculeId}` && m.defilement > 0 && m.echeance >= 0 && m.echeance < 220, m);

ws.close();
chrome.kill();
await attendre(500);
rmSync(profil, { recursive: true, force: true });
console.log(`\n${resultats.filter(Boolean).length}/${resultats.length} contrôles passés.`);
process.exit(resultats.every(Boolean) ? 0 : 1);
