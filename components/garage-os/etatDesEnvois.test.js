// État des communications — tests des phrases.
//
// Exécution : node --test components/garage-os/etatDesEnvois.test.js
//
// La règle verrouillée ici : tant qu'aucune automatisation n'est branchée,
// l'accueil dit qu'aucun message ne part seul. C'est l'inverse de ce que la
// pastille « Email — actif » laissait croire.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NATURE_AUTOMATIQUE,
  NATURE_MANUELLE,
  NATURE_PREPAREE,
  NATURE_REPONSE,
  lignesEtatEnvois,
} from "./etatDesEnvois.js";

test("les quatre situations du garage sont distinguées", () => {
  const lignes = lignesEtatEnvois();
  const natures = lignes.map((l) => l.nature);
  for (const nature of [NATURE_PREPAREE, NATURE_MANUELLE, NATURE_AUTOMATIQUE, NATURE_REPONSE]) {
    assert.ok(natures.includes(nature), `nature absente : ${nature}`);
  }
  assert.equal(lignes.length, 4);
});

test("sans automatisation branchée, l'écran dit qu'aucun message ne part seul", () => {
  const auto = lignesEtatEnvois().find((l) => l.cle === "automatique");
  assert.match(auto.detail, /^Aucun\./);
  assert.match(auto.detail, /sans que vous l'ayez demandé/);
  assert.equal(auto.ton, "neutre");
});

test("une automatisation réellement branchée le dit, et se signale", () => {
  const auto = lignesEtatEnvois({ automatiqueDisponible: true }).find((l) => l.cle === "automatique");
  assert.match(auto.detail, /partent seuls/);
  assert.equal(auto.ton, "attention");
  assert.doesNotMatch(auto.detail, /Aucun/);
});

test("le devis et la facture annoncent la relecture, jamais un envoi immédiat", () => {
  const l = lignesEtatEnvois().find((l) => l.cle === "devis_factures");
  assert.match(l.detail, /vous confirmez l'envoi/);
  assert.match(l.detail, /Rien ne part avant/);
});

test("un canal choisi sans moteur derrière est nommé, pas caché", () => {
  const lignes = lignesEtatEnvois({ canauxEnAttente: ["sms", "whatsapp"] });
  assert.equal(lignes.length, 6);
  const sms = lignes.find((l) => l.cle === "canal_sms");
  assert.equal(sms.titre, "SMS");
  assert.match(sms.detail, /rien ne l'envoie aujourd'hui/);
  assert.equal(sms.ton, "attention");
});

test("aucune ligne ne promet une lecture par le client", () => {
  for (const l of lignesEtatEnvois({ automatiqueDisponible: true, canauxEnAttente: ["sms"] })) {
    assert.doesNotMatch(l.detail, /\blu\b|\bouvert\b/i, `${l.cle} promet une lecture`);
  }
});
