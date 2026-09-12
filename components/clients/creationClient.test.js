// Exécution : node --test components/clients/creationClient.test.js
//
// Ces tests portent sur les chemins d'échec : ce sont eux qui faisaient
// perdre une saisie ou afficher une réussite trompeuse.

import assert from "node:assert/strict";
import { test } from "node:test";

import { MESSAGE_VEHICULE_ECHEC, lectureCreationClient, messageDevisCree } from "./creationClient.js";

test("client créé avec sa voiture : les deux identifiants sont rendus", () => {
  const lu = lectureCreationClient({ id: "c1", vehicules: [{ id: "v1" }] }, { immatriculation: "AB-123-CD" });
  assert.deepEqual(lu, { ok: true, clientId: "c1", vehiculeId: "v1", vehiculeEnEchec: false });
});

test("voiture demandée mais absente : l'échec est signalé, le client est conservé", () => {
  const lu = lectureCreationClient({ id: "c1", vehicules: [] }, { immatriculation: "AB-123-CD" });
  assert.equal(lu.ok, true);
  assert.equal(lu.clientId, "c1", "le client déjà créé doit servir au nouvel essai");
  assert.equal(lu.vehiculeId, null);
  assert.equal(lu.vehiculeEnEchec, true);
});

test("aucune voiture demandée : pas d'échec inventé", () => {
  const lu = lectureCreationClient({ id: "c1", vehicules: [] }, null);
  assert.equal(lu.vehiculeEnEchec, false);
});

test("client non créé : rien à réutiliser", () => {
  assert.deepEqual(lectureCreationClient(null, { immatriculation: "AB-123-CD" }), {
    ok: false, clientId: null, vehiculeId: null, vehiculeEnEchec: false,
  });
});

test("le message d'échec de voiture dit quoi faire, sans perdre le client", () => {
  assert.match(MESSAGE_VEHICULE_ECHEC, /Client enregistré/);
  assert.match(MESSAGE_VEHICULE_ECHEC, /voiture/);
  assert.match(MESSAGE_VEHICULE_ECHEC, /Réessayez|continuez/);
});

test("une ligne de catalogue manquée est dite, pas seulement consignée", () => {
  const m = messageDevisCree({ ligneEchouee: "Freins avant" });
  assert.equal(m.ton, "error");
  assert.match(m.texte, /Freins avant/);
  assert.match(m.texte, /à la main/);
});

test("sans incident, le message rappelle que rien n'est parti", () => {
  const m = messageDevisCree();
  assert.equal(m.ton, "success");
  assert.match(m.texte, /Rien n'est envoyé/);
});
