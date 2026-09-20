import assert from "node:assert/strict";
import test from "node:test";

import { integrationsSortantes } from "./integrations.js";

const CLES_DE_PRODUCTION = { RESEND_API_KEY: "x", STRIPE_SECRET_KEY: "x", GOOGLE_CLIENT_ID: "x", ANTHROPIC_API_KEY: "x" };

test("prévisualisation Vercel : aucune intégration sortante, même avec les clés de Production", () => {
  assert.deepEqual(integrationsSortantes({ ...CLES_DE_PRODUCTION, VERCEL_ENV: "preview" }), { actives: false, raison: "previsualisation" });
  assert.deepEqual(integrationsSortantes({ ...CLES_DE_PRODUCTION, VERCEL_ENV: "development" }), { actives: false, raison: "previsualisation" });
});

test("Production et poste local : inchangés (les clés présentes décident)", () => {
  assert.deepEqual(integrationsSortantes({ ...CLES_DE_PRODUCTION, VERCEL_ENV: "production" }), { actives: true, raison: null });
  assert.deepEqual(integrationsSortantes({}), { actives: true, raison: null });
});

// Garde-fou : tout fichier de l'application qui touche un service sortant
// (adresse d'API ou clé secrète) passe par l'interrupteur — ou par la
// configuration de lecture, elle-même soumise à l'interrupteur. Un nouveau
// chemin d'envoi ou de paiement qui l'oublierait fait échouer ce test.
test("aucun appel sortant ne contourne l'interrupteur", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const RACINE = new URL("..", import.meta.url).pathname;
  const SORTANT = /api\.resend\.com|api\.stripe\.com|googleapis\.com|api\.anthropic\.com|data\.economie\.gouv\.fr\/api\/|STRIPE_SECRET_KEY|RESEND_API_KEY|GOOGLE_CLIENT_SECRET|ANTHROPIC_API_KEY/;
  const GARDE = /integrationsSortantes|configurationLecture/;
  // Deux exceptions, et elles se justifient chacune en une phrase.
  //
  // - anthropic.js : le client ne sert que par la route de lecture, qui ne le
  //   crée que si configurationLecture() l'a rendu disponible ;
  // - campagnes-serveur.js : lecture publique et anonyme de la base officielle
  //   des rappels (DGCCRF, Licence Ouverte). Aucun secret, aucun envoi, aucune
  //   dépense, aucune écriture, et rien de personnel ne part — seulement un nom
  //   de marque. La couper en prévisualisation rendrait la page invérifiable
  //   là, précisément, où on la recette.
  //
  // Tout AUTRE fichier qui atteindrait ces destinations fait échouer ce test.
  // Pour la base des rappels, seul le chemin d'API compte : citer l'adresse du
  // jeu de données dans sources.js n'est pas l'appeler.
  const EXCEPTIONS = new Set(["lib/auto/lecture/anthropic.js", "lib/auto/connaissance/campagnes-serveur.js"]);
  const fichiers = [];
  const parcourir = (dossier) => {
    for (const e of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) fichiers.push(chemin);
    }
  };
  for (const d of ["app", "lib", "components"]) parcourir(d);
  const sortants = fichiers.filter((f) => SORTANT.test(readFileSync(join(RACINE, f), "utf8")));
  assert.ok(sortants.length >= 8, `inventaire trop court : ${sortants.join(", ")}`);
  const nonGardes = sortants.filter((f) => !EXCEPTIONS.has(f) && !GARDE.test(readFileSync(join(RACINE, f), "utf8")));
  assert.deepEqual(nonGardes, [], "fichiers qui appellent un service sortant sans l'interrupteur");
});
