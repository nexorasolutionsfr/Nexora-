// Audit d'écrans Nexora Auto — recette locale, compte fictif de la base Test.
//
//   LIEN=$(node scripts/recette/compte-auto.mjs lien <adresse> http://localhost:3114/auto)
//   node scripts/recette/audit-ecrans.mjs "$LIEN" /auto /auto/a-prevoir …
//   (sans session : passer http://localhost:3114/auto comme lien)
//
// Chrome sans interface, piloté par le protocole DevTools, écran mobile émulé,
// largeurs 320, 375 et 390 px. Relève : débordement horizontal, textes coupés,
// boutons ou liens sans nom, champs sans libellé, cibles tactiles de moins de
// 32 px, focus clavier sans changement visible, nombre de titres h1, images
// sans texte de remplacement. Profil Chrome jetable dans /tmp.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as attendre } from "node:timers/promises";

const [lien, ...chemins] = process.argv.slice(2);
const profil = `/tmp/nexora-audit-${process.pid}`;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profil}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
await attendre(2500);
const cibles = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = cibles.find((c) => c.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const attentes = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; attentes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluer = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cdp("Page.enable");
await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
await cdp("Page.navigate", { url: lien });
await attendre(6000);

const AUDIT = `(() => { const r = { debordement: document.documentElement.scrollWidth > innerWidth, tronques: [], sansNom: [], champsSansLibelle: [], ciblesPetites: [] };
  document.querySelectorAll('main *').forEach(e => { const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) r.tronques.push(e.innerText.slice(0, 60)); if (e.scrollWidth > innerWidth + 2 && cs.overflowX === 'visible' && e.getBoundingClientRect().right > innerWidth + 2) r.debordant = (r.debordant || []).concat(e.tagName + ':' + (e.innerText || '').slice(0, 30)); });
  document.querySelectorAll('main button, main a[href], header button, header a[href]').forEach(b => { const nom = (b.getAttribute('aria-label') || b.innerText || b.title || '').trim(); if (!nom) r.sansNom.push(b.outerHTML.slice(0, 90)); const q = b.getBoundingClientRect(); if (q.width && q.height && Math.min(q.height, q.width) < 32) r.ciblesPetites.push(nom.slice(0, 28) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); });
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(i => { if (!(i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || (i.id && document.querySelector('label[for="' + i.id + '"]')) || i.closest('label'))) r.champsSansLibelle.push(i.outerHTML.slice(0, 90)); });
  r.debordant = [...new Set(r.debordant || [])].slice(0, 5);
  r.h1 = document.querySelectorAll('h1').length; if (r.h1 === 1) delete r.h1;
  r.imagesSansAlt = [...document.querySelectorAll('img:not([alt])')].map(i => i.src.slice(-40));
  // Focus visible : l'apparence doit changer quand l'élément reçoit le focus clavier.
  r.focusInvisible = [];
  const proprietes = (e) => { const c = getComputedStyle(e); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor].join('|'); };
  document.querySelectorAll('header a[href], header button, main a[href], main button, main input:not([type=hidden]), main select, main textarea, main summary').forEach(e => {
    if (e.disabled || !e.getClientRects().length) return;
    document.activeElement?.blur?.();
    const avant = proprietes(e); e.focus({ focusVisible: true, preventScroll: true }); const apres = proprietes(e);
    const nom = (e.getAttribute('aria-label') || e.innerText || e.id || e.name || e.tagName).trim().slice(0, 30);
    if (avant === apres) r.focusInvisible.push(nom);
  });
  document.activeElement?.blur?.();
  r.focusInvisible = [...new Set(r.focusInvisible)].slice(0, 12);
  return r; })()`;

for (const chemin of chemins) {
  for (const largeur of [320, 375, 390]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: largeur, height: 800, deviceScaleFactor: 2, mobile: true });
    await cdp("Page.navigate", { url: new URL(chemin, lien).href });
    await attendre(4500);
    const r = await evaluer(AUDIT);
    const defauts = Object.entries(r ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length : v));
    console.log(`${chemin} @${largeur}: ${defauts.length ? JSON.stringify(Object.fromEntries(defauts)) : "RAS"}`);
  }
}
ws.close();
chrome.kill();
// Le profil jetable contient la session de recette : il ne reste pas sur le disque.
await attendre(500);
rmSync(profil, { recursive: true, force: true });
