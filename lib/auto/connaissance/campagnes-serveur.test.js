import assert from "node:assert/strict";
import test from "node:test";

import { marquesEquivalentes } from "./campagnes.js";
import { fichesDeLaMarque, marqueSure } from "./campagnes-serveur.js";

test("une marque, et rien d'autre, ne peut refermer la requête", () => {
  assert.equal(marqueSure("Peugeot"), "peugeot");
  assert.equal(marqueSure("Citroën"), "citroen");
  assert.equal(marqueSure("Opel/Vauxhall"), "opel/vauxhall");
  assert.equal(marqueSure('pe"ugeot" or 1=1'), "pe ugeot or 1 1", "les guillemets et l'égalité ne survivent pas");
  assert.equal(marqueSure("a".repeat(41)), null, "trop long");
  assert.equal(marqueSure(""), null);
  assert.equal(marqueSure(null), null);
});

test("une base injoignable est un état de l'écran, pas une exception", async () => {
  const echec = async () => {
    throw new Error("réseau coupé");
  };
  assert.deepEqual(await fichesDeLaMarque("peugeot", { fetchImpl: echec }), { etat: "indisponible", raison: "injoignable" });

  const refus = async () => ({ ok: false, status: 503 });
  assert.deepEqual(await fichesDeLaMarque("peugeot", { fetchImpl: refus }), { etat: "indisponible", raison: "statut_503" });

  assert.deepEqual(await fichesDeLaMarque("", { fetchImpl: echec }), { etat: "indisponible", raison: "marque_illisible" });
});

test("seule la marque part chez le tiers — jamais rien de personnel", async () => {
  let adresse = "";
  const espion = async (url) => {
    adresse = url;
    return { ok: true, json: async () => ({ total_count: 1, results: [{ id: 1 }] }) };
  };
  await fichesDeLaMarque("Peugeot", { fetchImpl: espion });
  assert.ok(adresse.includes("peugeot"));
  for (const interdit of ["immatriculation", "vin", "proprietaire", "email", "@", "date_mise_en_circulation"]) {
    assert.ok(!adresse.toLowerCase().includes(interdit), `${interdit} ne doit pas partir`);
  }
});

// Une marque peut s'écrire de plusieurs façons dans la base officielle, et
// n'en interroger qu'une laisse des rappels réels invisibles : « opel »
// rendait 70 fiches, « opel/vauxhall » 24 de plus (relevé le 22 septembre
// 2026). La table d'équivalences servait au filtrage, pas à la requête.
test("toutes les orthographes d'une marque partent dans la même requête", async () => {
  let adresse = "";
  const espion = async (url) => {
    adresse = url;
    return { ok: true, json: async () => ({ total_count: 0, results: [] }) };
  };
  await fichesDeLaMarque(marquesEquivalentes("Opel"), { fetchImpl: espion });
  const lue = decodeURIComponent(adresse);
  assert.ok(lue.includes('"opel"'), lue);
  assert.ok(lue.includes('"opel/vauxhall"'), "la sous-marque publie de vraies campagnes Opel");

  // Une marque sans équivalent connu reste interrogée telle quelle.
  await fichesDeLaMarque(marquesEquivalentes("Nissan"), { fetchImpl: espion });
  assert.ok(decodeURIComponent(adresse).includes('"nissan"'));
});

// Garde-fou propre à cette lecture publique, et volontairement séparé de celui
// des intégrations sortantes : celui-ci appartient au module qui appelle.
//
// La base des rappels n'est pas une intégration au sens de l'interrupteur —
// aucun secret, aucun envoi, aucune dépense, aucune écriture — et elle reste
// donc active en prévisualisation. C'est précisément pour ça qu'elle a besoin
// de sa propre surveillance : tout AUTRE fichier qui atteindrait cette adresse
// fait échouer ce test.
test("un seul fichier atteint la base officielle des rappels", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const RACINE = new URL("../../..", import.meta.url).pathname;
  const APPEL = /data\.economie\.gouv\.fr\/api\//;
  const AUTORISE = "lib/auto/connaissance/campagnes-serveur.js";

  const fichiers = [];
  const parcourir = (dossier) => {
    for (const e of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) fichiers.push(chemin);
    }
  };
  for (const d of ["app", "lib", "components"]) parcourir(d);

  const appelants = fichiers.filter((f) => APPEL.test(readFileSync(join(RACINE, f), "utf8")));
  assert.deepEqual(appelants, [AUTORISE], "un seul fichier doit appeler la base des rappels");
});
