// Exécution : node --test components/aujourdhui/relanceLigne.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { CAPACITES } from "../parametres/capacites.js";
import { decorerLigneRelance, ouvreLaRelance } from "./relanceLigne.js";

const ligne = { cle: "td:1", sourceType: "travail_differe", actionLibelle: "Appeler le client", probleme: "Plaquettes arrière" };
const relance = (statut) => ({ id: "r1", statut, updated_at: "2026-09-15T08:00:00Z" });

test("les relances de travaux différés ne sont pas annoncées disponibles", () => {
  assert.equal(CAPACITES.relanceTravauxDifferes.disponible, false);
});

test("indisponible : aucune ligne n'ouvre la relance ni ne propose de l'autoriser", () => {
  for (const statut of ["a_relire", "bloque", "en_attente", "envoi_en_cours", "envoye", "annulee", "obsolete"]) {
    assert.equal(ouvreLaRelance(relance(statut), false), false, statut);
    const d = decorerLigneRelance(ligne, relance(statut), false);
    assert.equal(d.actionLibelle, "Appeler le client", `${statut} : le geste du suivi manuel est conservé`);
    assert.doesNotMatch(d.probleme, /à relire|autorisée|départ en attente/, statut);
  }
});

test("indisponible : une relance préparée ou autorisée dit que l'envoi n'est pas disponible", () => {
  for (const statut of ["a_relire", "bloque", "en_attente"]) {
    assert.equal(decorerLigneRelance(ligne, relance(statut), false).probleme, "Plaquettes arrière · envoi des relances pas encore disponible");
  }
});

test("sans relance, la ligne est inchangée", () => {
  assert.equal(decorerLigneRelance(ligne, null, false), ligne);
  assert.equal(ouvreLaRelance(null, true), false);
});

test("disponible (jour futur) : la relance à relire s'ouvre, comme avant", () => {
  assert.equal(ouvreLaRelance(relance("a_relire"), true), true);
  assert.equal(ouvreLaRelance(relance("en_attente"), true), false);
  assert.equal(decorerLigneRelance(ligne, relance("a_relire"), true).actionLibelle, "Relire la relance");
});
