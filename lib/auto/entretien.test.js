import assert from "node:assert/strict";
import test from "node:test";

import { etatEntretien, factureDAbord, manquesEntretien, phraseManques } from "./entretien.js";

const revision = (kilometrage = 61000) => ({ type: "revision", realise_le: "2025-10-22", kilometrage });

test("un dossier vide : il manque le point de départ ET l'intervalle", () => {
  const manques = manquesEntretien({ historique: [] });
  assert.deepEqual(
    manques.map((m) => m.cle),
    ["derniere_intervention", "intervalle"],
  );
  // La formulation suit le compte réel : c'est tout l'objet du correctif.
  assert.equal(phraseManques(manques), "Il manque deux choses pour calculer votre prochaine révision :");
  assert.equal(factureDAbord(manques), true);
});

test("une révision enregistrée, pas d'intervalle : il n'en manque plus qu'un", () => {
  const manques = manquesEntretien({ historique: [revision()] });
  assert.deepEqual(
    manques.map((m) => m.cle),
    ["intervalle"],
  );
  assert.equal(phraseManques(manques), "Il manque une seule chose pour calculer votre prochaine révision :");
  assert.equal(factureDAbord(manques), false);
});

test("intervalle au compteur seul et révision sans kilométrage : le point de départ manque", () => {
  const manques = manquesEntretien({ historique: [revision(null)], intervalle_entretien_km: 15000 });
  assert.deepEqual(
    manques.map((m) => m.cle),
    ["kilometrage_revision"],
  );
});

test("intervalle en mois : le kilométrage de la dernière révision n'est pas réclamé", () => {
  assert.deepEqual(manquesEntretien({ historique: [revision(null)], intervalle_entretien_mois: 12 }), []);
});

test("tant que l'intervalle est inconnu, on ne réclame pas un kilométrage qui ne servira peut-être pas", () => {
  const manques = manquesEntretien({ historique: [revision(null)] });
  assert.deepEqual(
    manques.map((m) => m.cle),
    ["intervalle"],
  );
});

test("une vidange ne fait pas un point de départ de révision", () => {
  const manques = manquesEntretien({ historique: [{ type: "vidange", realise_le: "2026-01-10", kilometrage: 70000 }], intervalle_entretien_km: 15000 });
  assert.deepEqual(
    manques.map((m) => m.cle),
    ["derniere_intervention"],
  );
});

test("aucun manque ne rend aucune phrase : on n'écrit pas « il manque zéro chose »", () => {
  assert.equal(phraseManques([]), null);
  assert.deepEqual(manquesEntretien({ historique: [revision()], intervalle_entretien_km: 15000 }), []);
});

test("chaque manque porte un geste et un code d'action lisible par la fiche", () => {
  for (const manque of manquesEntretien({ historique: [] })) {
    assert.ok(manque.libelle && manque.pourquoi && manque.geste, `${manque.cle} est incomplet`);
    assert.ok(["revision", "intervalle"].includes(manque.action));
  }
});

test("« Entretenir ma voiture » parle de CETTE voiture, pas du catalogue", () => {
  const vehicule = { id: "v1", historique: [] };
  const etat = etatEntretien({ vehicule, elements: [] });
  assert.equal(etat.cas, "a_preciser");
  assert.equal(etat.titre, "Votre suivi d'entretien reste à préciser.");
  assert.equal(etat.manques.length, 2);
});

test("une révision qui approche passe devant le reste", () => {
  const vehicule = { id: "v1", historique: [revision()], intervalle_entretien_km: 15000 };
  const element = { genre: "revision", vehicule: { id: "v1" }, titre: "Révision", quand: "Avant le 1 oct. 2026", niveau: "proche" };
  const etat = etatEntretien({ vehicule, elements: [element] });
  assert.equal(etat.cas, "echeance");
  assert.equal(etat.element, element);
});

test("une révision lointaine ne réclame rien", () => {
  const vehicule = { id: "v1", historique: [revision()], intervalle_entretien_km: 15000 };
  const element = { genre: "revision", vehicule: { id: "v1" }, quand: "Avant le 1 oct. 2027", niveau: "ok" };
  assert.equal(etatEntretien({ vehicule, elements: [element] }).cas, "suivi");
});

test("sans voiture choisie, rien n'est affirmé", () => {
  const etat = etatEntretien({ vehicule: null, elements: [] });
  assert.equal(etat.cas, "sans_voiture");
  assert.deepEqual(etat.manques, []);
});

test("l'élément d'une AUTRE voiture n'est jamais repris", () => {
  const vehicule = { id: "v1", historique: [revision()], intervalle_entretien_km: 15000 };
  const element = { genre: "revision", vehicule: { id: "v2" }, niveau: "depasse" };
  const etat = etatEntretien({ vehicule, elements: [element] });
  assert.equal(etat.element, null);
  assert.equal(etat.cas, "suivi");
});
