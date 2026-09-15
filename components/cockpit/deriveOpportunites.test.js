// Le journal de suivi (`opportunites_actions`) et les lignes qu'il masque.
//
// Recette du 15 septembre 2026 : « Marquer traité » sur une réponse de client
// (« Devis accepté par … ») échouait — `reponse_devis` refusé par la contrainte
// de la table — et, même écrite, l'action n'aurait jamais masqué la ligne
// (clé d'affichage `reponse-devis:<id>` contre clé de journal).
//
// Exécution : node --test components/cockpit/deriveOpportunites.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceJournal } from "./cockpitConstants.js";
import { appliquerActions } from "./deriveOpportunites.js";

const MAINTENANT = new Date("2026-09-15T08:00:00Z");
const D = "41f62672-0000-4000-8000-000000000001";

const reponse = (validation = "2026-09-14T19:00:00Z") => ({
  key: `reponse-devis:${D}`,
  sourceType: "reponse_devis",
  sourceId: D,
  updatedAt: validation,
  section: "maintenant",
});
const action = (type, id, quoi, quand, extra = {}) => ({ source_type: type, source_id: id, action: quoi, created_at: quand, ...extra });

test("la réponse au devis s'écrit dans le journal sous « devis », les autres sources restent telles quelles", () => {
  assert.equal(sourceJournal("reponse_devis"), "devis");
  for (const t of ["rappel", "demande", "proposition", "devis", "rdv_confirmation", "inspection", "travail_differe", "client_dormant"]) {
    assert.equal(sourceJournal(t), t);
  }
});

test("une réponse marquée traitée après son arrivée disparaît de la liste", () => {
  const { visibles, masquees } = appliquerActions([reponse()], [action("devis", D, "traite", "2026-09-14T20:00:00Z")], MAINTENANT);
  assert.equal(visibles.length, 0);
  assert.equal(masquees.length, 1);
});

test("une marque posée sur le devis AVANT la réponse du client ne masque pas la réponse", () => {
  const { visibles, masquees } = appliquerActions([reponse("2026-09-14T19:00:00Z")], [action("devis", D, "traite", "2026-09-10T09:00:00Z")], MAINTENANT);
  assert.equal(visibles.length, 1);
  assert.equal(masquees.length, 0);
});

test("reporter masque jusqu'à la date, réactiver remet la ligne", () => {
  const reportee = appliquerActions([reponse()], [action("devis", D, "reporte", "2026-09-14T20:00:00Z", { motif: "rappeler lundi", masquer_jusqu_au: "2026-09-20T08:00:00Z" })], MAINTENANT);
  assert.equal(reportee.masquees.length, 1);
  const reactivee = appliquerActions([reponse()], [
    action("devis", D, "traite", "2026-09-14T20:00:00Z"),
    action("devis", D, "reactiver", "2026-09-14T21:00:00Z"),
  ], MAINTENANT);
  assert.equal(reactivee.visibles.length, 1);
});

test("les autres sources gardent leur comportement (inspection traitée, masquée)", () => {
  const I = "11111111-0000-4000-8000-000000000002";
  const candidat = { key: `inspection:${I}`, sourceType: "inspection", sourceId: I, section: "aujourdhui", updatedAt: "2026-09-13T10:00:00Z" };
  const { visibles, masquees } = appliquerActions([candidat], [action("inspection", I, "traite", "2026-09-14T10:00:00Z")], MAINTENANT);
  assert.equal(visibles.length, 0);
  assert.equal(masquees.length, 1);
});
