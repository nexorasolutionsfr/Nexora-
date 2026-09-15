import assert from "node:assert/strict";
import { test } from "node:test";
import {
  controleParDefaut,
  proposerDevis,
  proposerPoints,
  resumerReprise,
} from "./reprise.js";

const POINTS = [
  { id: "p-ok", etat: "ok", libelle: "Voyant moteur" },
  { id: "p-dommage", etat: "dommage", libelle: "Plaquettes avant" },
  { id: "p-refuse", etat: "a_valider_client", libelle: "Pare-brise", soumis_client: true, decision_client: "refuse" },
  { id: "p-valide", etat: "a_valider_client", libelle: "Pneus avant", soumis_client: true, decision_client: "valide" },
  { id: "p-surveiller", etat: "a_surveiller", libelle: "Pneu arrière droit" },
];

test("proposerPoints écarte les points OK et coche d'avance ce qui se chiffre", () => {
  const proposes = proposerPoints(POINTS, []);
  assert.deepEqual(proposes.map((p) => p.point.id), ["p-dommage", "p-refuse", "p-valide", "p-surveiller"]);
  assert.deepEqual(proposes.map((p) => p.coche), [true, false, true, true]);
});

test("un point refusé par le client est visible, décoché, et dit pourquoi", () => {
  const refuse = proposerPoints(POINTS, []).find((p) => p.point.id === "p-refuse");
  assert.equal(refuse.coche, false);
  assert.equal(refuse.raison, "refuse");
});

test("un point déjà repris dans CE devis est décoché — pas dans un autre devis", () => {
  const lignes = [{ id: "l1", inspection_point_id: "p-dommage" }];
  const proposes = proposerPoints(POINTS, lignes);
  assert.equal(proposes.find((p) => p.point.id === "p-dommage").raison, "deja");
  assert.equal(proposes.find((p) => p.point.id === "p-dommage").coche, false);
  // Sans ces lignes (autre devis, révision), le même point redevient proposable.
  assert.equal(proposerPoints(POINTS, []).find((p) => p.point.id === "p-dommage").coche, true);
});

test("controleParDefaut : un seul contrôle, ou celui de la visite ; sinon un choix", () => {
  assert.equal(controleParDefaut([{ id: "i1", rendez_vous_id: null }], "r1"), "i1");
  assert.equal(controleParDefaut([{ id: "i1", rendez_vous_id: "r1" }, { id: "i2", rendez_vous_id: "r0" }], "r1"), "i1");
  assert.equal(controleParDefaut([{ id: "i1", rendez_vous_id: null }, { id: "i2", rendez_vous_id: null }], "r1"), null);
  assert.equal(controleParDefaut([], "r1"), null);
});

test("proposerDevis ne choisit jamais « le plus récent » : nouveau devis par défaut", () => {
  const devis = [
    { id: "d-recent", statut: "en_attente", vehicule_id: "v", rendez_vous_id: null, created_at: "2026-09-14" },
    { id: "d-vieux", statut: "en_attente", vehicule_id: "v", rendez_vous_id: null, created_at: "2026-09-01" },
    { id: "d-accepte", statut: "accepte", vehicule_id: "v", rendez_vous_id: "r1" },
    { id: "d-autre-voiture", statut: "en_attente", vehicule_id: "w", rendez_vous_id: null },
  ];
  const { candidats, parDefaut } = proposerDevis({ devis, vehiculeId: "v", rdvId: "r1" });
  assert.deepEqual(candidats.map((c) => c.devis.id), ["d-recent", "d-vieux"]);
  assert.equal(parDefaut, "nouveau");
});

test("proposerDevis propose de compléter quand exactement un devis est rattaché à la visite", () => {
  const devis = [
    { id: "d-visite", statut: "en_attente", vehicule_id: "v", rendez_vous_id: "r1" },
    { id: "d-libre", statut: "en_attente", vehicule_id: "v", rendez_vous_id: null },
  ];
  const { candidats, parDefaut } = proposerDevis({ devis, vehiculeId: "v", rdvId: "r1" });
  assert.equal(parDefaut, "d-visite");
  assert.deepEqual(candidats.map((c) => [c.devis.id, c.deLaVisite]), [["d-visite", true], ["d-libre", false]]);
});

test("deux devis rattachés à la même visite : on laisse choisir", () => {
  const devis = [
    { id: "d1", statut: "en_attente", vehicule_id: "v", rendez_vous_id: "r1" },
    { id: "d2", statut: "brouillon", vehicule_id: "v", rendez_vous_id: "r1" },
  ];
  assert.equal(proposerDevis({ devis, vehiculeId: "v", rdvId: "r1" }).parDefaut, "nouveau");
});

test("resumerReprise nomme ce qui a été fait et ce qui a été laissé de côté", () => {
  assert.equal(
    resumerReprise({ ok: true, lignes_creees: [{}, {}], deja_reprises: [{}], refuses: [{}] }),
    "2 lignes ajoutées au devis, à chiffrer. 1 déjà présente, non dupliquée. 1 refusée par le client, laissée de côté.",
  );
  assert.match(resumerReprise({ ok: true, deja_jouee: true, lignes_creees: [{}] }), /déjà été enregistrée/);
  assert.match(resumerReprise({ ok: false, raison: "devis_verrouille" }), /verrouillé/);
  assert.match(resumerReprise({ ok: false, raison: "client_inconnu" }), /aucun client/);
});
