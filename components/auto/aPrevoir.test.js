import assert from "node:assert/strict";
import test from "node:test";

import { construireAPrevoir, elementControle, elementRevision, elementTache, palierRappel, pastilleElement, rappelsADeclencher } from "./aPrevoir.js";

const F = " ";
const AUJOURDHUI = "2026-09-16";

const clio = {
  id: "v-clio",
  marque: "Renault",
  modele: "Clio V",
  immatriculation: "GH456JK",
  date_mise_en_circulation: "2019-05-02",
  intervalle_entretien_km: 15000,
  intervalle_entretien_mois: 12,
  releves: [{ releve_le: "2026-09-12", kilometrage: 61400 }],
  historique: [
    { type: "revision", realise_le: "2025-10-01", kilometrage: 47000 },
    { type: "controle_technique", realise_le: "2025-04-30", controle_valable_jusqu_au: "2027-04-29" },
  ],
};

test("CT : date officielle, quoi, pour quand, sur quoi", () => {
  const el = elementControle(clio, { aujourdhui: AUJOURDHUI });
  assert.equal(el.cle, "controle_technique:v-clio:2027-04-29");
  assert.equal(el.titre, "Contrôle technique");
  assert.equal(el.quand, "Avant le 29 avr. 2027");
  assert.equal(el.delai, "dans 7 mois");
  assert.equal(el.fondement, "officiel");
  assert.equal(el.explication, "Date inscrite sur le procès-verbal du contrôle du 30 avr. 2025.");
  assert.deepEqual(el.vehicule, { id: "v-clio", nom: "Renault Clio V", immatriculation: "GH456JK" });
  assert.deepEqual(el.actions.map((a) => a.code), ["controle"]);
});

test("CT : défaillance critique, contre-visite à faire, texte exact", () => {
  const el = elementControle(
    { ...clio, historique: [{ type: "controle_technique", realise_le: "2026-09-01", resultat_controle: "defavorable_critique" }] },
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(el.titre, "Contre-visite du contrôle technique");
  assert.equal(el.quand, "Au plus tard le 31 oct. 2026");
  assert.equal(el.niveau, "proche");
  assert.equal(el.fondement, "calcul");
  assert.match(el.explication, /^Défaillance critique au contrôle du 1er sept\. 2026 : sa validité était limitée à ce jour-là\./);
  assert.deepEqual(el.actions.map((a) => a.code), ["contre_visite"]);
});

test("CT : information manquante, jamais une date inventée", () => {
  const el = elementControle({ ...clio, date_mise_en_circulation: null, historique: [] }, { aujourdhui: AUJOURDHUI });
  assert.equal(el.etat, "a_completer");
  assert.equal(el.fondement, "manquant");
  assert.equal(el.quand, "Date inconnue");
  assert.deepEqual(el.actions.map((a) => a.code), ["mise_en_circulation"]);
});

test("Révision : relevé récent, selon le dernier kilométrage enregistré", () => {
  const el = elementRevision(clio, { aujourdhui: AUJOURDHUI });
  assert.equal(el.cle, "revision:v-clio:2025-10-01");
  assert.equal(el.fondement, "intervalle");
  assert.equal(el.quand, `Dans environ 600${F}km ou avant le 1er oct. 2026`);
  assert.equal(el.niveau, "proche");
  assert.equal(
    el.explication,
    `Tous les 15${F}000${F}km ou 12 mois ; dernière révision le 1er oct. 2025 à 47${F}000${F}km. Dernier kilométrage enregistré : 61${F}400${F}km le 12 sept. 2026.`,
  );
  assert.deepEqual(el.actions.map((a) => a.code), ["releve", "revision"]);
  assert.equal(el.demandeActualisation, false);
});

test("Révision : relevé ancien, l'estimation est dite et le compteur demandé", () => {
  const el = elementRevision(
    {
      ...clio,
      intervalle_entretien_mois: null,
      releves: [{ releve_le: "2026-01-01", kilometrage: 50000 }, { releve_le: "2026-07-01", kilometrage: 57240 }],
      historique: [{ type: "revision", realise_le: "2025-12-15", kilometrage: 49000 }],
    },
    { aujourdhui: AUJOURDHUI },
  );
  // Rythme observé depuis la révision (49 000 km le 15 déc.) jusqu'au dernier
  // relevé (57 240 km le 1er juil.) : estimation 60 400 km, limite 64 000 km.
  assert.equal(el.fondement, "estimation");
  assert.equal(el.quand, `Dans environ 3${F}600${F}km`);
  assert.match(el.explication, /Kilométrage estimé à 60.400.km d'après votre rythme ; dernier compteur relevé : 57.240.km le 1er juil\. 2026\./);
  assert.equal(el.demandeActualisation, true);
});

test("Révision : le compteur de la révision compte comme relevé, l'estimation part de là", () => {
  const el = elementRevision(
    { ...clio, intervalle_entretien_mois: null, releves: [{ releve_le: "2026-06-01", kilometrage: 60000 }], historique: [{ type: "revision", realise_le: "2026-09-01", kilometrage: 61000 }] },
    { aujourdhui: AUJOURDHUI },
  );
  // 1 000 km en 92 jours, 15 jours depuis la révision : environ 61 200 km, limite 76 000 km.
  assert.equal(el.quand, `Dans environ 14${F}800${F}km`);
  assert.equal(el.fondement, "estimation");
  assert.equal(el.niveau, "ok");
  assert.equal(el.demandeActualisation, false);
});

test("Révision : enregistrée sans kilométrage, avec un intervalle en km seulement", () => {
  const el = elementRevision({ ...clio, intervalle_entretien_mois: null, releves: [], historique: [{ type: "revision", realise_le: "2026-09-01", kilometrage: null }] }, { aujourdhui: AUJOURDHUI });
  assert.equal(el.etat, "a_completer");
  assert.equal(el.fondement, "manquant");
  assert.match(el.explication, /enregistrée sans kilométrage/);
});

test("Tâche : date, délai, actions terminer et reporter", () => {
  const el = elementTache({ id: "t1", vehicule_id: "v-clio", titre: "Changer les pneus hiver", echeance: "2026-10-15", statut: "a_faire" }, clio, { aujourdhui: AUJOURDHUI });
  assert.equal(el.quand, "Pour le 15 oct. 2026");
  assert.equal(el.delai, "dans 29 jours");
  assert.equal(el.fondement, "tache");
  assert.deepEqual(el.actions.map((a) => a.code), ["terminer", "reporter"]);
});

test("Ensemble : voitures archivées exclues, groupes, reports, trois prochaines actions", () => {
  const zoe = { id: "v-zoe", marque: "Renault", modele: "Zoe", archive_le: "2026-09-01T10:00:00Z", date_mise_en_circulation: "2021-01-10", historique: [], releves: [] };
  const peugeot = { id: "v-208", marque: "Peugeot", modele: "208", date_mise_en_circulation: null, historique: [], releves: [] };
  const r = construireAPrevoir({
    vehicules: [clio, zoe, peugeot],
    taches: [
      { id: "t1", vehicule_id: "v-clio", titre: "Pneus hiver", echeance: "2026-10-15", statut: "a_faire" },
      { id: "t2", vehicule_id: "v-zoe", titre: "Tâche d'une voiture archivée", echeance: "2026-09-20", statut: "a_faire" },
      { id: "t3", vehicule_id: "v-208", titre: "Nettoyer l'intérieur", echeance: null, statut: "a_faire" },
      { id: "t4", vehicule_id: "v-clio", titre: "Batterie vérifiée", echeance: null, statut: "terminee", terminee_le: "2026-09-10T08:00:00Z" },
    ],
    reports: [
      { cle: "revision:v-clio:2025-10-01", reporte_jusqu_au: "2026-09-23" },
      { cle: "tache:t1", reporte_jusqu_au: "2026-09-10" },
    ],
    horizonJours: 60,
    aujourdhui: AUJOURDHUI,
  });

  assert.equal(r.elements.some((el) => el.vehicule.id === "v-zoe"), false, "aucun rappel pour une voiture archivée");
  assert.deepEqual(r.groupes.bientot.map((el) => el.cle), ["revision:v-clio:2025-10-01", "tache:t1"]);
  assert.deepEqual(r.groupes.plusTard.map((el) => el.cle), ["controle_technique:v-clio:2027-04-29"]);
  assert.deepEqual(r.groupes.sansDate.map((el) => el.cle), ["tache:t3"]);
  assert.deepEqual(r.groupes.aCompleter.map((el) => el.cle).sort(), [
    "controle_technique:v-208:a_completer:mise_en_circulation",
    "revision:v-208:a_completer:intervalle_a_renseigner",
  ]);
  // Report en cours : visible dans la liste, absent du rappel ; report échu : sans effet.
  assert.equal(r.groupes.bientot[0].reporteJusquau, "2026-09-23");
  assert.equal(r.groupes.bientot[1].reporteJusquau, undefined);
  assert.deepEqual(r.prochaines.map((el) => el.cle), ["tache:t1"]);
  assert.deepEqual(r.terminees.map((el) => el.cle), ["tache:t4"]);
});

test("Une intervention enregistrée actualise l'échéance sans doublon ni tâche close", () => {
  const avant = construireAPrevoir({ vehicules: [clio], taches: [{ id: "t1", vehicule_id: "v-clio", titre: "Pneus hiver", echeance: "2026-10-15", statut: "a_faire" }], aujourdhui: AUJOURDHUI });
  const apres = construireAPrevoir({
    vehicules: [{ ...clio, historique: [...clio.historique, { type: "revision", realise_le: "2026-09-15", kilometrage: 61500 }] }],
    taches: [{ id: "t1", vehicule_id: "v-clio", titre: "Pneus hiver", echeance: "2026-10-15", statut: "a_faire" }],
    aujourdhui: AUJOURDHUI,
  });
  const revisions = (r) => r.elements.filter((el) => el.genre === "revision");
  assert.equal(revisions(avant).length, 1);
  assert.equal(revisions(apres).length, 1);
  assert.equal(revisions(apres)[0].cle, "revision:v-clio:2026-09-15");
  assert.equal(revisions(apres)[0].niveau, "ok");
  assert.equal(apres.elements.filter((el) => el.genre === "tache").length, 1, "la tâche sans rapport reste ouverte");
});

test("Envois externes : un palier une seule fois, rien pour un report ou une info manquante", () => {
  assert.equal(palierRappel(45), null);
  assert.equal(palierRappel(30), "j30");
  assert.equal(palierRappel(7), "j7");
  assert.equal(palierRappel(-1), "retard");
  const elements = [
    { cle: "controle_technique:v:2026-10-10", etat: "a_faire", joursRestants: 24 },
    { cle: "revision:v:2025-10-01", etat: "a_faire", joursRestants: 5, reporteJusquau: "2026-09-20" },
    { cle: "controle_technique:w:a_completer:mise_en_circulation", etat: "a_completer", joursRestants: null },
    { cle: "tache:t9", etat: "a_faire", joursRestants: -2 },
  ];
  assert.deepEqual(rappelsADeclencher(elements, { canal: "email", dejaEnvoyes: [{ cle: "tache:t9", palier: "retard", canal: "email" }] }), [
    { cle: "controle_technique:v:2026-10-10", palier: "j30", canal: "email" },
  ]);
});

test("pastilleElement : le même libellé dans la liste, la fiche et À prévoir", () => {
  assert.deepEqual(pastilleElement(elementControle(clio, { aujourdhui: AUJOURDHUI })), { ton: "ok", texte: "CT dans 7 mois" });
  assert.deepEqual(pastilleElement(elementControle(clio, { aujourdhui: AUJOURDHUI }), { avecSujet: false }), { ton: "ok", texte: "Dans 7 mois" });
  assert.deepEqual(pastilleElement(elementRevision(clio, { aujourdhui: AUJOURDHUI })), { ton: "proche", texte: `Révision : dans environ 600${F}km` });
  assert.deepEqual(pastilleElement(elementRevision(clio, { aujourdhui: AUJOURDHUI }), { avecSujet: false }), { ton: "proche", texte: "Bientôt" });
  const contreVisite = elementControle({ ...clio, historique: [{ type: "controle_technique", realise_le: "2026-09-01", resultat_controle: "defavorable_majeure" }] }, { aujourdhui: AUJOURDHUI });
  assert.equal(pastilleElement(contreVisite).texte, "Contre-visite dans 45 jours");
  assert.deepEqual(pastilleElement(elementControle({ ...clio, date_mise_en_circulation: null, historique: [] }, { aujourdhui: AUJOURDHUI })), { ton: "neutre", texte: "CT à compléter" });
});
