// Relais HTTP de RECETTE vers Supabase TEST, avec pannes provoquées.
//
// Sert à jouer sur les vrais nœuds n8n des pannes qu'on ne sait pas obtenir
// autrement à coup sûr : réponse perdue APRÈS que la base a validé, clôture
// refusée, journal indisponible. Aucune autre destination n'est possible :
// l'amont est codé en dur sur le projet Test.
//
// Les pannes se pilotent par un fichier JSON relu à chaque requête :
//   [{ "chemin": "/rest/v1/rpc/reserver_notifications", "mode": "sans_reponse_apres", "fois": 1 }]
// modes :
//   coupe_avant         → connexion coupée sans rien transmettre à la base
//   sans_reponse_apres  → requête transmise, réponse de la base gardée, n8n
//                         n'obtient jamais de réponse (son délai expire)
//   http_502            → 502 sans rien transmettre à la base
// `fois` diminue à chaque panne servie ; à 0 la règle ne sert plus.
//
// Journal : une ligne JSON par requête (méthode, chemin, statut, panne), sans
// corps ni en-têtes.
//
// Usage : PORT=8787 PANNES=/chemin/pannes.json JOURNAL=/chemin/proxy.jsonl \
//         node scripts/recette/proxy-supabase-controle.mjs
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const AMONT = "slawilafseganlbghgwx.supabase.co";
const PORT = Number(process.env.PORT || 8787);
const HOTE = process.env.HOTE || "127.0.0.1";
const PANNES = process.env.PANNES || "pannes.json";
const JOURNAL = process.env.JOURNAL || "proxy-supabase.jsonl";
const noter = (o) => appendFileSync(JOURNAL, JSON.stringify({ quand: new Date().toISOString(), ...o }) + "\n");

function panne(chemin) {
  if (!existsSync(PANNES)) return null;
  let regles;
  try { regles = JSON.parse(readFileSync(PANNES, "utf8")); } catch { return null; }
  const r = regles.find((x) => chemin.startsWith(x.chemin) && (x.fois ?? 1) > 0);
  if (!r) return null;
  r.fois = (r.fois ?? 1) - 1;
  writeFileSync(PANNES, JSON.stringify(regles, null, 2));
  return r.mode;
}

const serveur = http.createServer((req, res) => {
  const chemin = req.url.split("?")[0];
  const mode = panne(chemin);
  const corps = [];
  req.on("data", (c) => corps.push(c));
  req.on("end", () => {
    if (mode === "coupe_avant") { noter({ methode: req.method, chemin, panne: mode }); req.socket.destroy(); return; }
    if (mode === "http_502") { noter({ methode: req.method, chemin, statut: 502, panne: mode }); res.writeHead(502, { "content-type": "text/plain" }).end("Bad Gateway (panne de recette)"); return; }
    // Réponse non compressée : le relais transmet le corps tel quel. (Premier
    // passage du 15 sept. : corps gzip relayé sans son en-tête → « Invalid JSON »
    // côté n8n, APRÈS une réservation validée en base.)
    const entetes = { ...req.headers, host: AMONT, "accept-encoding": "identity" };
    delete entetes.connection;
    const amont = https.request({ host: AMONT, port: 443, method: req.method, path: req.url, headers: entetes }, (r) => {
      const morceaux = [];
      r.on("data", (c) => morceaux.push(c));
      r.on("end", () => {
        noter({ methode: req.method, chemin, statut: r.statusCode, panne: mode || null });
        if (mode === "sans_reponse_apres") return; // la base a traité ; n8n n'en saura rien
        const h = { ...r.headers };
        delete h["transfer-encoding"]; delete h.connection; delete h["content-encoding"];
        res.writeHead(r.statusCode, h).end(Buffer.concat(morceaux));
      });
    });
    amont.on("error", (e) => { noter({ methode: req.method, chemin, erreur: e.code || e.message }); res.writeHead(502).end(); });
    amont.end(Buffer.concat(corps));
  });
});

serveur.listen(PORT, HOTE, () => console.log(`proxy-supabase-controle ${HOTE}:${PORT} → https://${AMONT} — pannes ${PANNES}`));
