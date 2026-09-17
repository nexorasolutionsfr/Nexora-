import assert from "node:assert/strict";
import test from "node:test";

import { choisirVoiture, etatAujourdhui, sollicitationKilometrage } from "./aujourdhui.js";

const voiture = (id, extra = {}) => ({ id, marque: "Dacia", modele: "Sandero", ...extra });

// Un élément à la forme de ceux de `construireAPrevoir`, réduit à ce que
// « Aujourd'hui » lit.
const element = (id, extra = {}) => ({
  cle: `${extra.genre ?? "controle_technique"}:${id}`,
  genre: "controle_technique",
  vehicule: { id, nom: "Dacia Sandero", immatriculation: null },
  titre: "Contrôle technique",
  etat: "a_faire",
  niveau: "ok",
  tri: 200,
  ...extra,
});

test("choisirVoiture : celle qu'on consultait, sinon la principale, sinon la première", () => {
  const a = voiture("a");
  const b = voiture("b", { principal: true });
  assert.equal(choisirVoiture([a, b], "a")?.id, "a");
  assert.equal(choisirVoiture([a, b], null)?.id, "b");
  assert.equal(choisirVoiture([a], null)?.id, "a");
  assert.equal(choisirVoiture([], null), null);
  // Une voiture archivée n'est jamais choisie, même mémorisée.
  assert.equal(choisirVoiture([voiture("z", { archive_le: "2026-01-01" }), a], "z")?.id, "a");
  // Un identifiant qui n'existe plus ne bloque pas l'écran.
  assert.equal(choisirVoiture([a, b], "disparue")?.id, "b");
});

test("etatAujourdhui met en avant la plus urgente, et une seule", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("a", { titre: "Révision", genre: "revision", niveau: "ok", tri: 300 }),
      element("a", { titre: "Contrôle technique", niveau: "depasse", tri: -10 }),
      element("b", { titre: "Ailleurs", niveau: "depasse", tri: -40 }),
    ],
  });
  assert.equal(etat.principale.element.titre, "Contrôle technique");
  assert.equal(etat.principale.urgence, "depasse");
  assert.equal(etat.autres.length, 1);
  assert.equal(etat.autres[0].titre, "Révision");
  assert.equal(etat.total, 2, "les échéances d'une autre voiture ne comptent pas");
});

test("une échéance critique passe devant une échéance en retard", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("a", { titre: "Révision", genre: "revision", niveau: "depasse", tri: -60 }),
      element("a", { titre: "Contrôle technique", niveau: "depasse", tri: -5, critique: true }),
    ],
  });
  assert.equal(etat.principale.element.titre, "Contrôle technique");
});

test("un rappel reporté reste affiché mais ne reprend pas la première place", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    horizonJours: 60,
    elements: [
      element("a", { titre: "Contrôle technique", niveau: "proche", tri: 12, reporteJusquau: "2026-12-01" }),
      element("a", { titre: "Pneus", niveau: "proche", tri: 30 }),
    ],
  });
  assert.equal(etat.principale.element.titre, "Pneus");
  assert.equal(etat.autres[0].titre, "Contrôle technique", "le report masque le rappel, pas l'échéance");
});

test("un rappel reporté, et rien d'autre qui presse : l'écran reste calme", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    horizonJours: 60,
    elements: [
      element("a", { titre: "Contrôle technique", niveau: "proche", tri: 12, reporteJusquau: "2026-12-01" }),
      element("a", { titre: "Révision", genre: "revision", niveau: "ok", tri: 250 }),
    ],
  });
  assert.equal(etat.principale, null);
  assert.deepEqual(etat.lointaines.map((el) => el.titre), ["Révision"]);
});

test("l'urgence distingue le retard, le proche et l'horizon", () => {
  const avec = (extra) => etatAujourdhui({ vehiculeId: "a", horizonJours: 60, elements: [element("a", extra)] }).principale.urgence;
  assert.equal(avec({ niveau: "depasse", tri: -3 }), "depasse");
  assert.equal(avec({ niveau: "proche", tri: 20 }), "proche");
  assert.equal(avec({ niveau: "ok", tri: 45 }), "horizon");
});

test("rien de calculable : l'écran a de quoi dire ce qui manque", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("a", { etat: "a_completer", niveau: "neutre", tri: Number.POSITIVE_INFINITY, explication: "Indiquez la date de première mise en circulation." }),
      element("a", { etat: "a_completer", genre: "revision", titre: "Révision", niveau: "neutre", tri: Number.POSITIVE_INFINITY }),
    ],
  });
  assert.equal(etat.rienDeCalculable, true);
  assert.equal(etat.aCompleter.length, 2);
  assert.equal(etat.principale.urgence, "a_completer");
  assert.equal(etat.principale.element.titre, "Contrôle technique");
});

test("une échéance calculée, même lointaine, n'est pas « rien de calculable »", () => {
  const etat = etatAujourdhui({ vehiculeId: "a", elements: [element("a", { tri: 400 })] });
  assert.equal(etat.rienDeCalculable, false);
});

test("une échéance lointaine ne prend JAMAIS la première place", () => {
  // Le cas de la Corsa : contrôle technique dans 21 mois, et rien d'autre.
  // L'écran ne doit pas proposer « Enregistrer un contrôle » comme action
  // du jour.
  const etat = etatAujourdhui({
    vehiculeId: "a",
    horizonJours: 60,
    elements: [element("a", { titre: "Contrôle technique", niveau: "ok", tri: 640 })],
  });
  assert.equal(etat.principale, null, "aucune action dominante");
  assert.deepEqual(etat.lointaines.map((el) => el.titre), ["Contrôle technique"], "elle se résume plus bas");
});

test("une échéance lointaine cède la place à une information manquante", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    horizonJours: 60,
    elements: [
      element("a", { titre: "Contrôle technique", niveau: "ok", tri: 640 }),
      element("a", { titre: "Révision", genre: "revision", etat: "a_completer", niveau: "neutre", tri: Number.POSITIVE_INFINITY }),
    ],
  });
  assert.equal(etat.principale.element.titre, "Révision");
  assert.equal(etat.principale.urgence, "a_completer");
  assert.deepEqual(etat.lointaines.map((el) => el.titre), ["Contrôle technique"]);
});

test("une information manquante reportée ne revient pas en tête", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("a", { titre: "Contrôle technique", niveau: "ok", tri: 640 }),
      element("a", { titre: "Révision", genre: "revision", etat: "a_completer", niveau: "neutre", tri: Number.POSITIVE_INFINITY, reporteJusquau: "2026-12-01" }),
    ],
  });
  assert.equal(etat.principale, null, "« Plus tard » tient, et l'écran reste calme");
});

test("les échéances datées et les informations manquantes se comptent à part", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    horizonJours: 60,
    elements: [
      element("a", { titre: "Pneus", niveau: "proche", tri: 10 }),
      element("a", { titre: "Contrôle technique", niveau: "ok", tri: 640 }),
      element("a", { titre: "Révision", genre: "revision", etat: "a_completer", niveau: "neutre", tri: Number.POSITIVE_INFINITY }),
    ],
  });
  assert.equal(etat.principale.element.titre, "Pneus");
  assert.equal(etat.compteurs.echeances, 1, "le contrôle technique");
  assert.equal(etat.compteurs.aCompleter, 1, "la révision, comptée à part");
});

test("le compteur n'est demandé que s'il sert à une échéance", () => {
  const sans = [element("a", { titre: "Contrôle technique", demandeActualisation: false })];
  const avec = [element("a", { titre: "Révision", genre: "revision", demandeActualisation: true })];
  assert.equal(sollicitationKilometrage({ elements: sans, vehiculeId: "a" }), "inutile");
  assert.equal(sollicitationKilometrage({ elements: avec, vehiculeId: "a" }), "utile");
  // L'échéance d'une AUTRE voiture ne fait pas réclamer ce compteur-ci.
  assert.equal(sollicitationKilometrage({ elements: avec, vehiculeId: "b" }), "inutile");
  assert.equal(sollicitationKilometrage({}), "inutile");
});

test("deux relevés qui se contredisent demandent une clarification, pas un chiffre de plus", () => {
  const avec = [element("a", { genre: "revision", demandeActualisation: true })];
  assert.equal(sollicitationKilometrage({ elements: avec, vehiculeId: "a", estimation: { aVerifier: true } }), "a_verifier");
  // Même sans échéance au compteur : une contradiction se signale.
  assert.equal(sollicitationKilometrage({ elements: [], vehiculeId: "a", estimation: { aVerifier: true } }), "a_verifier");
});

test("aucune voiture, aucune échéance : rien n'est mis en avant", () => {
  const etat = etatAujourdhui({});
  assert.equal(etat.principale, null);
  assert.equal(etat.total, 0);
  assert.equal(etat.rienDeCalculable, true);
});

test("une autre voiture qui presse est signalée, la plus urgente d'abord", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("a", { titre: "Contrôle technique", niveau: "ok", tri: 200 }),
      element("b", { titre: "CT de la Yaris", niveau: "depasse", tri: -12 }),
      element("c", { titre: "Révision de la Clio", genre: "revision", niveau: "proche", tri: 20 }),
      element("d", { titre: "Loin", niveau: "ok", tri: 300 }),
    ],
  });
  assert.deepEqual(etat.ailleurs.map((el) => el.titre), ["CT de la Yaris", "Révision de la Clio"]);
});

test("les autres voitures : ni les échéances lointaines, ni celles à compléter, ni les rappels reportés", () => {
  const etat = etatAujourdhui({
    vehiculeId: "a",
    elements: [
      element("b", { titre: "Lointaine", niveau: "ok", tri: 300 }),
      element("c", { titre: "À compléter", etat: "a_completer", niveau: "neutre", tri: Number.POSITIVE_INFINITY }),
      element("d", { titre: "Reportée", niveau: "depasse", tri: -5, reporteJusquau: "2026-12-01" }),
    ],
  });
  assert.deepEqual(etat.ailleurs, []);
});

test("une seule voiture : rien à signaler ailleurs", () => {
  const etat = etatAujourdhui({ vehiculeId: "a", elements: [element("a", { niveau: "depasse", tri: -3 })] });
  assert.deepEqual(etat.ailleurs, []);
});
