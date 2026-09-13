import assert from "node:assert/strict";
import test from "node:test";

import { compterATraiter, construireATraiter, decouper } from "./aTraiter.js";

const nommer = (l) => ({ titre: l.immatriculation || "Sans plaque", sous: l.client || "" });
const action = (l) => l.fil?.libelleAction || "Ouvrir le dossier";

/** Une priorité d'intervention, telle que `classerPriorites` la rend. */
const prio = ({ id, vehicule, raisonCle = "a_vous_de_jouer", raison = "Générez la facture.", rang = 7, urgent = false, devis = null, facture = null, debut = "2026-09-01T09:00:00+02:00", immat = "AA-001-AA" }) => ({
  id, rdv: { id, vehicule_id: vehicule, date_debut: debut }, devis, facture,
  raisonCle, raison, rang, urgent, immatriculation: immat, client: "Client", fil: {},
});

/** Une opportunité du Cockpit, telle que `deriveOpportunites` la rend. */
const opp = (sourceType, sourceId, section = "aujourdhui", extra = {}) => ({
  key: `${sourceType}:${sourceId}`, sourceType, sourceId, section,
  titre: `${sourceType} ${sourceId}`, meta: "détail", action: "Ouvrir", urgent: section === "maintenant", ...extra,
});

const paquet = (parSection) => ({ sections: parSection, masquees: [] });

test("les deux moteurs arrivent dans une seule liste", () => {
  const l = construireATraiter({
    opportunites: paquet({ maintenant: [opp("demande", "d1", "maintenant")], aujourdhui: [opp("inspection", "i1")], a_planifier: [] }),
    priorites: [prio({ id: "r1", vehicule: "V1" })],
    nommer, action,
  });
  assert.equal(l.length, 3);
  // L'urgent d'abord, quelle que soit son origine.
  assert.equal(l[0].sourceType, "demande");
});

test("une inspection ne compte qu'une fois", () => {
  const i = opp("inspection", "i1");
  const l = construireATraiter({ opportunites: paquet({ maintenant: [i], aujourdhui: [i], a_planifier: [] }), priorites: [], nommer, action });
  assert.equal(l.length, 1, "la même source vue deux fois reste une ligne");
});

test("un devis porté par une intervention ne revient pas par le Cockpit", () => {
  // Fusion 1 et 2 de la correspondance : « devis sans réponse » et « réponse
  // au devis » désignent le devis que la ligne d'intervention nomme déjà.
  const lignes = construireATraiter({
    opportunites: paquet({ maintenant: [opp("reponse_devis", "DEV1", "maintenant")], aujourdhui: [opp("devis", "DEV1")], a_planifier: [] }),
    priorites: [prio({ id: "r1", vehicule: "V1", devis: { id: "DEV1" }, raisonCle: "document_a_envoyer", raison: "Devis établi, pas encore envoyé au client" })],
    nommer, action,
  });
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].origine, "intervention", "on garde celle qui nomme la voiture et ouvre le dossier");
});

test("un devis SANS intervention rattachée reste listé", () => {
  const lignes = construireATraiter({
    opportunites: paquet({ maintenant: [], aujourdhui: [opp("devis", "DEV9")], a_planifier: [] }),
    priorites: [prio({ id: "r1", vehicule: "V1", devis: { id: "AUTRE" } })],
    nommer, action,
  });
  assert.equal(lignes.length, 2, "aucune tâche ne disparaît par excès de fusion");
});

test("deux interventions à facturer restent deux tâches, distinguées par leur date", () => {
  const lignes = construireATraiter({
    opportunites: null,
    priorites: [
      prio({ id: "r1", vehicule: "AUTO", debut: "2026-03-17T09:00:00+01:00" }),
      prio({ id: "r2", vehicule: "AUTO", debut: "2026-07-30T09:00:00+02:00" }),
    ],
    nommer, action,
  });
  assert.equal(lignes.length, 2);
  assert.ok(lignes.every((l) => l.precision), "les jumelles portent leur date");
  assert.notEqual(lignes[0].precision, lignes[1].precision);
});

test("deux gestes différents sur le même rendez-vous restent deux tâches", () => {
  const lignes = construireATraiter({
    opportunites: paquet({ maintenant: [opp("rdv_confirmation", "r1", "maintenant")], aujourdhui: [], a_planifier: [] }),
    priorites: [prio({ id: "r1", vehicule: "V1", raisonCle: "creneau_depasse", raison: "Travaux dépassés", rang: 5 })],
    nommer, action,
  });
  assert.equal(lignes.length, 2, "un report de RDV et des travaux dépassés sont deux gestes");
});

test("une tâche ancienne n'est pas écartée", () => {
  const lignes = construireATraiter({
    opportunites: null,
    priorites: [prio({ id: "vieux", vehicule: "V1", debut: "2025-01-04T09:00:00+01:00" })],
    nommer, action,
  });
  assert.equal(lignes.length, 1, "l'âge n'efface rien : aucun filtre de date ici");
});

test("les compteurs comptent la liste, pas les sources", () => {
  const lignes = construireATraiter({
    opportunites: paquet({ maintenant: [opp("reponse_devis", "DEV1", "maintenant")], aujourdhui: [opp("demande", "d1")], a_planifier: [] }),
    priorites: [
      prio({ id: "r1", vehicule: "V1", devis: { id: "DEV1" } }),
      prio({ id: "r2", vehicule: "V2", raisonCle: "creneau_depasse", raison: "Travaux dépassés", rang: 5 }),
    ],
    nommer, action,
  });
  const c = compterATraiter(lignes);
  assert.equal(c.actions, lignes.length, "le compteur est la liste");
  assert.equal(c.actions, 3, "la source fusionnée ne compte pas deux fois");
  assert.equal(c.vehicules, 2);
  assert.equal(c.sansVehicule, 1, "une demande n'invente pas de véhicule");
});

test("les urgences ne passent jamais sous la limite", () => {
  const lignes = [
    ...Array.from({ length: 8 }, (_, i) => ({ cle: `n${i}`, urgent: false })),
    { cle: "u1", urgent: true }, { cle: "u2", urgent: true },
  ];
  const { visibles, total, masquees } = decouper(lignes, 3);
  assert.equal(total, 10);
  assert.equal(masquees, 7);
  assert.ok(visibles.filter((l) => l.urgent).length === 2, "les deux urgentes sont visibles");
  assert.equal(visibles.length, 3);
});
