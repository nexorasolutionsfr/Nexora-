// Texte agrandi (150 % et 200 %) à 375 px — recette locale, compte fictif de la base Test.
//
//   node scripts/recette/audit-texte-agrandi.mjs "$LIEN" /auto /auto/vehicules/<id> …
//
// Agrandit la taille de base du texte (comme le réglage « taille du texte »
// d'un téléphone pour les tailles en rem) et relève les éléments qui sortent
// de l'écran et les contenus coupés par un débordement masqué. Le lien
// d'évitement « Aller au contenu », masqué hors focus, apparaît comme
// « coupé » : c'est attendu.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as attendre } from "node:timers/promises";
const [lien, ...chemins] = process.argv.slice(2);
const profil = `/tmp/nexora-texte-${process.pid}`;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${profil}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
await attendre(2500);
const page = (await (await fetch("http://127.0.0.1:9335/json")).json()).find((c) => c.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0; const attentes = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; attentes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluer = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: lien });
await attendre(6000);
const MESURE = (zoom) => `(async () => { document.documentElement.style.fontSize='${zoom}%'; await new Promise(r=>setTimeout(r,400));
  const L = 375, sortants = [], coupes = [];
  const nom = (e) => e.tagName.toLowerCase() + ' «' + ((e.getAttribute('aria-label') || e.innerText || '').replace(/\\s+/g,' ').slice(0,40)) + '» [' + String(e.className.baseVal ?? e.className).split(' ').filter(c => /nowrap|shrink-0|truncate|size-|w-|h-|grid-cols|flex/.test(c)).slice(0,5).join(' ') + ']';
  document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).position === 'fixed') return; const p = e.parentElement?.getBoundingClientRect(); if (r.right > L + 1 && p && p.right <= L + 1) sortants.push(nom(e) + ' →' + Math.round(r.right)); const c = getComputedStyle(e); if ((c.overflowX === 'hidden' || c.overflow === 'hidden') && e.scrollWidth > e.clientWidth + 2 && !c.webkitLineClamp?.match?.(/\\d/)) coupes.push(nom(e)); });
  document.documentElement.style.fontSize='';
  return { largeur: document.documentElement.scrollWidth, sortants: [...new Set(sortants)].slice(0,8), coupes: [...new Set(coupes)].slice(0,6) }; })()`;
for (const chemin of chemins) {
  const [url, action] = chemin.split("||");
  await cdp("Page.navigate", { url: new URL(url, lien).href });
  await attendre(4500);
  if (action) { await evaluer(action); await attendre(800); }
  for (const zoom of [150, 200]) {
    const r = await evaluer(MESURE(zoom));
    const ok = !r.sortants.length && !r.coupes.length;
    console.log(`${url}${action ? " (+action)" : ""} @${zoom}%: ${ok ? "RAS" : JSON.stringify(r)}`);
  }
}
ws.close(); chrome.kill();
// Le profil jetable contient la session de recette : il ne reste pas sur le disque.
await attendre(500);
rmSync(profil, { recursive: true, force: true });
