import assert from "node:assert/strict";
import { test } from "node:test";
import {
  controleParDefaut,
  couvertureDesPoints,
  libelleRaison,
  proposerDevis,
  proposerPoints,
  resumerReprise,
  visiteAUnDevisAccepte,
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

// Recette du 15 septembre 2026, BB-202-BB : « Pare-chocs avant fendu » était
// coché d'avance pour un nouveau devis alors que le devis accepté de la visite
// le chiffrait déjà.
const DEVIS_VEHICULE = [
  { id: "09b7869c-accepte", statut: "accepte", rendez_vous_id: "rdv-jour", devis_lignes: [{ inspection_point_id: "p-dommage" }, { inspection_point_id: "p-dommage" }] },
  { id: "808293b4-attente", statut: "en_attente", rendez_vous_id: "rdv-jour", devis_lignes: [{ inspection_point_id: "p-surveiller" }] },
  { id: "aaaaaaaa-refuse", statut: "refuse", rendez_vous_id: null, devis_lignes: [{ inspection_point_id: "p-valide" }] },
];

test("couvertureDesPoints : chaque constat avec les devis qui le portent, hors devis réceptacle, sans doublon", () => {
  const c = couvertureDesPoints(DEVIS_VEHICULE, "808293b4-attente");
  assert.deepEqual(c.get("p-dommage").map((d) => d.id), ["09b7869c-accepte"]);
  assert.equal(c.has("p-surveiller"), false);
  assert.deepEqual(c.get("p-valide").map((d) => d.id), ["aaaaaaaa-refuse"]);
});

test("un constat couvert ailleurs est décoché d'avance, dit par quel devis, mais reste cochable", () => {
  const proposes = proposerPoints(POINTS, [], couvertureDesPoints(DEVIS_VEHICULE, "nouveau"));
  const parId = Object.fromEntries(proposes.map((p) => [p.point.id, p]));
  assert.equal(parId["p-dommage"].raison, "couvert_accepte");
  assert.equal(parId["p-dommage"].devisLie.id, "09b7869c-accepte");
  assert.equal(parId["p-dommage"].coche, false);
  assert.equal(parId["p-dommage"].bloquant, false);
  assert.equal(parId["p-surveiller"].raison, "dans_autre_devis");
  // Un refus du client sur le POINT prime sur tout : il reste bloquant.
  assert.equal(parId["p-refuse"].bloquant, true);
  assert.equal(parId["p-valide"].raison, "propose_refuse");
  assert.match(libelleRaison("couvert_accepte", parId["p-dommage"].devisLie), /devis accepté Réf\. 09B786/);
  assert.match(libelleRaison("dans_autre_devis", parId["p-surveiller"].devisLie), /Réf\. 808293/);
});

test("un accord l'emporte sur un devis modifiable pour dire où un point est déjà chiffré", () => {
  const devis = [
    { id: "b-attente", statut: "en_attente", devis_lignes: [{ inspection_point_id: "p-dommage" }] },
    { id: "a-accepte", statut: "accepte", devis_lignes: [{ inspection_point_id: "p-dommage" }] },
  ];
  const p = proposerPoints(POINTS, [], couvertureDesPoints(devis, null)).find((x) => x.point.id === "p-dommage");
  assert.equal(p.devisLie.id, "a-accepte");
});

test("visiteAUnDevisAccepte : seulement pour CETTE visite", () => {
  assert.equal(visiteAUnDevisAccepte(DEVIS_VEHICULE, "rdv-jour"), true);
  assert.equal(visiteAUnDevisAccepte(DEVIS_VEHICULE, "rdv-autre"), false);
  assert.equal(visiteAUnDevisAccepte(DEVIS_VEHICULE, null), false);
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
