import assert from "node:assert/strict";
import test from "node:test";

import { CLASSES, NOMENCLATURE_VOITURES, classerCritair, lireNormeEuro } from "./critair.js";

// Les cas de référence ne rejouent pas la formule du module : ce sont des
// lignes lues dans l'annexe I, avec la date charnière et la classe attendue.
// Si quelqu'un « simplifie » le tableau, ces cas tombent.
const CAS = [
  // essence
  ["essence", "2026-04-01", "1"],
  ["essence", "2011-01-01", "1"],
  ["essence", "2010-12-31", "2"],
  ["essence", "2006-01-01", "2"],
  ["essence", "2005-12-31", "3"],
  ["essence", "1997-01-01", "3"],
  ["essence", "1996-12-31", "non_classe"],
  ["essence", "1988-06-30", "non_classe"],
  // diesel : décalé d'un cran par rapport à l'essence, et il descend plus bas
  ["diesel", "2026-04-01", "2"],
  ["diesel", "2011-01-01", "2"],
  ["diesel", "2010-12-31", "3"],
  ["diesel", "2006-01-01", "3"],
  ["diesel", "2005-12-31", "4"],
  ["diesel", "2001-01-01", "4"],
  ["diesel", "2000-12-31", "5"],
  ["diesel", "1997-01-01", "5"],
  ["diesel", "1996-12-31", "non_classe"],
  // énergies classées sans condition de date (article 2)
  ["electrique", "2009-03-04", "E"],
  ["hybride_rechargeable", "2013-11-30", "1"],
  ["gpl", "1999-01-01", "1"],
  // superéthanol : rangé parmi les véhicules essence
  ["ethanol", "2012-05-05", "1"],
  ["ethanol", "2007-05-05", "2"],
];

test("classe Crit'Air : chaque ligne de l'annexe I, à sa date charnière", () => {
  for (const [energie, dateMiseEnCirculation, attendue] of CAS) {
    const r = classerCritair({ energie, dateMiseEnCirculation });
    assert.equal(r.etat, "classe", `${energie} ${dateMiseEnCirculation}`);
    assert.equal(r.classe, attendue, `${energie} ${dateMiseEnCirculation}`);
    assert.equal(r.libelle, CLASSES[attendue].libelle);
  }
});

test("une essence n'est jamais Crit'Air 4 ni 5 : le tableau ne les prévoit pas", () => {
  const classesEssence = NOMENCLATURE_VOITURES.essence.map((l) => l.classe);
  assert.ok(!classesEssence.includes("4"));
  assert.ok(!classesEssence.includes("5"));
  const classesDiesel = NOMENCLATURE_VOITURES.diesel.map((l) => l.classe);
  assert.ok(!classesDiesel.includes("1"), "aucune voiture diesel n'atteint la classe 1");
});

test("les périodes d'une même énergie ne se chevauchent pas et ne laissent pas de trou", () => {
  for (const [energie, lignes] of Object.entries(NOMENCLATURE_VOITURES)) {
    // De 1990 à 2026, chaque 1er du mois doit tomber dans exactement une ligne.
    for (let annee = 1990; annee <= 2026; annee += 1) {
      for (let mois = 1; mois <= 12; mois += 1) {
        const jour = `${annee}-${String(mois).padStart(2, "0")}-01`;
        const trouvees = lignes.filter((l) => (!l.debut || jour >= l.debut) && (!l.fin || jour <= l.fin));
        assert.equal(trouvees.length, 1, `${energie} ${jour} : ${trouvees.length} ligne(s)`);
      }
    }
  }
});

test("une hybride non rechargeable n'est pas classée d'office : les deux issues sont rendues", () => {
  const r = classerCritair({ energie: "hybride", dateMiseEnCirculation: "2018-04-01" });
  assert.equal(r.etat, "donnees_insuffisantes");
  assert.deepEqual(r.manques, ["carburant_hybride"]);
  assert.deepEqual(r.alternatives, [
    { carburant: "essence", classe: "1", libelle: "Crit'Air 1" },
    { carburant: "diesel", classe: "2", libelle: "Crit'Air 2" },
  ]);
  assert.equal(r.classe, undefined);
  // Une hybride ancienne descend dans le tableau comme les autres.
  const vieille = classerCritair({ energie: "hybride", dateMiseEnCirculation: "2004-06-01" });
  assert.deepEqual(vieille.alternatives.map((a) => a.classe), ["3", "4"]);
});

test("sans énergie ou sans date, rien n'est affirmé", () => {
  assert.deepEqual(classerCritair({ energie: "essence" }), { etat: "donnees_insuffisantes", manques: ["date_mise_en_circulation"] });
  assert.deepEqual(classerCritair({ dateMiseEnCirculation: "2019-01-01" }), { etat: "donnees_insuffisantes", manques: ["energie"] });
  assert.deepEqual(classerCritair({}), { etat: "donnees_insuffisantes", manques: ["energie", "date_mise_en_circulation"] });
  assert.equal(classerCritair({ energie: "autre", dateMiseEnCirculation: "2019-01-01" }).etat, "non_applicable");
});

test("le classement dit toujours sur quoi il repose, et ce qu'il ne prouve pas", () => {
  const r = classerCritair({ energie: "diesel", dateMiseEnCirculation: "2014-02-01" });
  assert.equal(r.fondement, "date_premiere_immatriculation");
  assert.ok(r.limites.length >= 3);
  assert.ok(r.limites.some((l) => l.includes("V.9")), "la limite sur la norme Euro doit être dite");
  assert.ok(r.limites.some((l) => l.toLowerCase().includes("zones à faibles émissions")));
  const electrique = classerCritair({ energie: "electrique", dateMiseEnCirculation: "2020-01-01" });
  assert.equal(electrique.fondement, "energie", "une électrique est classée par son énergie, pas par sa date");
});

// ---------------------------------------------------------------------------
// La norme Euro prime, la date n'est que le repli (article 1)
// ---------------------------------------------------------------------------

test("la rubrique V.9 se lit telle qu'elle s'écrit, ou pas du tout", () => {
  assert.equal(lireNormeEuro(5), 5);
  assert.equal(lireNormeEuro("6"), 6);
  assert.equal(lireNormeEuro("EURO 4"), 4);
  assert.equal(lireNormeEuro("euro6"), 6);
  assert.equal(lireNormeEuro("6d-TEMP"), 6, "les déclinaisons ne changent pas la classe");
  assert.equal(lireNormeEuro("715/2007*2018/1832AP"), null, "une référence de règlement n'est pas un chiffre de norme");
  assert.equal(lireNormeEuro(7), null);
  assert.equal(lireNormeEuro(0), null);
  assert.equal(lireNormeEuro(null), null);
});

test("un diesel Euro 4 immatriculé en 2011 est Crit'Air 3, pas 2", () => {
  // Le cas qui justifie tout : par la date seule, il serait annoncé mieux
  // classé qu'il ne l'est — et une classe trop favorable expose à une amende.
  const parLaDate = classerCritair({ energie: "diesel", dateMiseEnCirculation: "2011-01-20" });
  assert.equal(parLaDate.classe, "2");
  assert.equal(parLaDate.fondement, "date_premiere_immatriculation");
  assert.equal(parLaDate.precision, "norme_euro", "l'écran doit pouvoir proposer la précision");

  const parLaNorme = classerCritair({ energie: "diesel", dateMiseEnCirculation: "2011-01-20", normeEuro: 4 });
  assert.equal(parLaNorme.classe, "3");
  assert.equal(parLaNorme.fondement, "norme_euro");
  assert.equal(parLaNorme.normeUtilisee, 4);
  assert.equal(parLaNorme.precision, undefined, "rien de plus à préciser");
});

test("la norme Euro suffit même sans date de mise en circulation", () => {
  const r = classerCritair({ energie: "essence", normeEuro: "EURO 6" });
  assert.equal(r.etat, "classe");
  assert.equal(r.classe, "1");
  assert.equal(r.fondement, "norme_euro");
});

test("les limites suivent le fondement : pas de mention de repli quand il n'y a pas de repli", () => {
  const repli = classerCritair({ energie: "essence", dateMiseEnCirculation: "2015-01-01" });
  assert.ok(repli.limites.some((l) => l.includes("critère de repli")));

  const norme = classerCritair({ energie: "essence", dateMiseEnCirculation: "2015-01-01", normeEuro: 6 });
  assert.ok(!norme.limites.some((l) => l.includes("critère de repli")), "classée par la norme : la phrase serait fausse");

  for (const r of [repli, norme]) {
    assert.ok(r.limites.some((l) => l.includes("catégorie M1")), "la colonne du tableau doit être dite");
    assert.ok(r.limites.some((l) => l.includes("n'est pas une certification")), "Nexora ne certifie rien");
  }
});

test("une hybride non rechargeable profite aussi de la norme Euro", () => {
  const r = classerCritair({ energie: "hybride", dateMiseEnCirculation: "2011-06-01", normeEuro: 4 });
  assert.deepEqual(r.alternatives, [
    { carburant: "essence", classe: "2", libelle: "Crit'Air 2" },
    { carburant: "diesel", classe: "3", libelle: "Crit'Air 3" },
  ]);
});
