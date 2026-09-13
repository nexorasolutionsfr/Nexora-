import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUPE_A_RECEVOIR,
  GROUPE_EN_ATELIER,
  GROUPE_EN_ATTENTE,
  GROUPE_PRETES,
  GROUPES_ATELIER,
  compteursParGroupe,
  echeanceCarte,
  groupeDeLEtape,
  raisonBlocage,
  regrouperOperationnel,
} from "./groupes.js";
import { ETAPES_ATELIER } from "./calculs.js";

const MAINTENANT = new Date("2026-09-13T10:00:00+02:00");
const aujourdhui = (h, m = 0) => new Date(`2026-09-13T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`).toISOString();
const avantHier = (h) => new Date(`2026-09-11T${String(h).padStart(2, "0")}:00:00+02:00`).toISOString();

const rdv = (etape, extra = {}) => ({
  id: `${etape}-${extra.id || "1"}`,
  statut: "Confirmé",
  statut_atelier: etape,
  date_debut: aujourdhui(9),
  date_fin: aujourdhui(11),
  ...extra,
});

const par = (groupes, cle) => groupes.find((g) => g.key === cle);

// --- La couverture des étapes ---------------------------------------------

test("les quatre files couvrent toutes les étapes de travail, sans doublon", () => {
  const dansLesGroupes = GROUPES_ATELIER.flatMap((g) => g.etapes);
  assert.equal(new Set(dansLesGroupes).size, dansLesGroupes.length, "une étape apparaît dans deux files");
  // `restitue` est volontairement dehors : la voiture est partie.
  const attendues = ["a_venir", ...ETAPES_ATELIER.map((e) => e.key)];
  assert.deepEqual([...dansLesGroupes].sort(), [...attendues].sort());
});

test("chaque étape connue retrouve sa file", () => {
  assert.equal(groupeDeLEtape("depose").key, GROUPE_EN_ATELIER);
  assert.equal(groupeDeLEtape("diagnostic").key, GROUPE_EN_ATELIER);
  assert.equal(groupeDeLEtape("intervention").key, GROUPE_EN_ATELIER);
  assert.equal(groupeDeLEtape("attente_client").key, GROUPE_EN_ATTENTE);
  assert.equal(groupeDeLEtape("attente_piece").key, GROUPE_EN_ATTENTE);
  assert.equal(groupeDeLEtape("pret").key, GROUPE_PRETES);
  assert.equal(groupeDeLEtape("a_venir").key, GROUPE_A_RECEVOIR);
  // Un rendez-vous sans étape est traité comme « à venir », jamais perdu.
  assert.equal(groupeDeLEtape(null).key, GROUPE_A_RECEVOIR);
  assert.equal(groupeDeLEtape("restitue"), null);
});

// --- Le regroupement -------------------------------------------------------

test("une voiture n'apparaît que dans une seule file", () => {
  const liste = [rdv("depose"), rdv("diagnostic"), rdv("attente_piece"), rdv("pret"), rdv("a_venir")];
  const groupes = regrouperOperationnel(liste, MAINTENANT);
  const ids = groupes.flatMap((g) => g.rendezVous.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, liste.length);
});

test("une voiture entrée avant-hier reste dans l'atelier", () => {
  const groupes = regrouperOperationnel([rdv("intervention", { date_debut: avantHier(8), date_fin: avantHier(16) })], MAINTENANT);
  assert.equal(par(groupes, GROUPE_EN_ATELIER).rendezVous.length, 1);
});

test("un rendez-vous d'un autre jour resté « à venir » ne revient pas dans À recevoir", () => {
  const groupes = regrouperOperationnel([rdv("a_venir", { date_debut: avantHier(8), date_fin: avantHier(9) })], MAINTENANT);
  assert.equal(par(groupes, GROUPE_A_RECEVOIR).rendezVous.length, 0);
});

test("annulé, absent et terminé ne remplissent aucune file", () => {
  const liste = [
    rdv("depose", { statut: "Annulé", id: "a" }),
    rdv("attente_piece", { statut: "Absent", id: "b" }),
    rdv("pret", { statut: "Terminé", id: "c" }),
  ];
  const groupes = regrouperOperationnel(liste, MAINTENANT);
  assert.equal(groupes.flatMap((g) => g.rendezVous).length, 0);
});

test("chaque file annonce le détail de ses sous-statuts", () => {
  const liste = [rdv("depose", { id: "a" }), rdv("intervention", { id: "b" }), rdv("intervention", { id: "c" })];
  const atelier = par(regrouperOperationnel(liste, MAINTENANT), GROUPE_EN_ATELIER);
  assert.deepEqual(atelier.sousStatuts, [
    { etape: "depose", label: "Véhicule déposé", nombre: 1 },
    { etape: "intervention", label: "En intervention", nombre: 2 },
  ]);
});

test("un sous-statut vide n'est pas annoncé", () => {
  const atelier = par(regrouperOperationnel([rdv("depose")], MAINTENANT), GROUPE_EN_ATELIER);
  assert.deepEqual(atelier.sousStatuts.map((s) => s.etape), ["depose"]);
});

test("dans une file, les sous-statuts s'ordonnent puis les plus anciens d'abord", () => {
  const liste = [
    rdv("intervention", { id: "tard", date_debut: aujourdhui(14) }),
    rdv("depose", { id: "depose" }),
    rdv("intervention", { id: "tot", date_debut: aujourdhui(8) }),
  ];
  const atelier = par(regrouperOperationnel(liste, MAINTENANT), GROUPE_EN_ATELIER);
  assert.deepEqual(atelier.rendezVous.map((r) => r.id), ["depose", "tot", "tard"]);
});

test("les compteurs d'en-tête comptent exactement ce que les files affichent", () => {
  const liste = [rdv("a_venir", { id: "a" }), rdv("depose", { id: "b" }), rdv("attente_client", { id: "c" }), rdv("pret", { id: "d" }), rdv("pret", { id: "e" })];
  const compteurs = compteursParGroupe(liste, MAINTENANT);
  const groupes = regrouperOperationnel(liste, MAINTENANT);
  for (const groupe of groupes) assert.equal(compteurs[groupe.key], groupe.rendezVous.length);
  // La contradiction d'avant : « Dans l'atelier » comptait les voitures prêtes
  // alors que la grille en dessous ne les montrait pas.
  assert.equal(compteurs[GROUPE_EN_ATELIER], 1);
  assert.equal(compteurs[GROUPE_PRETES], 2);
});

test("une voiture prête depuis la veille reste prête tant qu'elle n'est pas restituée", () => {
  const groupes = regrouperOperationnel([rdv("pret", { date_debut: avantHier(15), date_fin: avantHier(16) })], MAINTENANT);
  assert.equal(par(groupes, GROUPE_PRETES).rendezVous.length, 1);
});

test("une voiture restituée ne revient dans aucune file de l'atelier", () => {
  const groupes = regrouperOperationnel([rdv("restitue"), rdv("restitue", { id: "2", date_debut: avantHier(9) })], MAINTENANT);
  assert.equal(groupes.flatMap((g) => g.rendezVous).length, 0);
});

test("deux visites du même véhicule restent deux entrées distinctes", () => {
  // Le dossier véhicule regroupe ; l'atelier, lui, travaille par visite. Les
  // confondre ferait disparaître la voiture d'une file où elle a sa place.
  const liste = [
    rdv("intervention", { id: "visite-1", vehicule_id: "veh-1" }),
    rdv("attente_piece", { id: "visite-2", vehicule_id: "veh-1" }),
  ];
  const groupes = regrouperOperationnel(liste, MAINTENANT);
  assert.equal(par(groupes, GROUPE_EN_ATELIER).rendezVous.length, 1);
  assert.equal(par(groupes, GROUPE_EN_ATTENTE).rendezVous.length, 1);
});

test("la frontière de journée se calcule à Paris, pas en UTC", () => {
  const maintenant = new Date("2026-09-10T10:00:00Z"); // 12:00 à Paris
  // 22:30 UTC = 00:30 le lendemain à Paris : la voiture n'est pas attendue ce jour.
  const demain = { id: "demain", statut: "Confirmé", statut_atelier: "a_venir", date_debut: "2026-09-10T22:30:00Z", date_fin: "2026-09-10T23:30:00Z" };
  // 23:15 UTC la veille = 01:15 le jour même à Paris : elle l'est.
  const ceJour = { id: "ce-jour", statut: "Confirmé", statut_atelier: "a_venir", date_debut: "2026-09-09T23:15:00Z", date_fin: "2026-09-10T00:15:00Z" };
  const aRecevoir = par(regrouperOperationnel([demain, ceJour], maintenant), GROUPE_A_RECEVOIR);
  assert.deepEqual(aRecevoir.rendezVous.map((r) => r.id), ["ce-jour"]);
});

test("une liste vide rend bien quatre files vides, pas une erreur", () => {
  const groupes = regrouperOperationnel([], MAINTENANT);
  assert.equal(groupes.length, 4);
  assert.deepEqual(groupes.map((g) => g.rendezVous.length), [0, 0, 0, 0]);
  assert.equal(regrouperOperationnel(undefined, MAINTENANT).length, 4);
});

// --- Le blocage se dit avec des mots --------------------------------------

test("une attente porte toujours sa raison, jamais une seule couleur", () => {
  assert.equal(raisonBlocage("attente_client"), "Attente de la réponse du client");
  assert.equal(raisonBlocage("attente_piece"), "Attente de la pièce commandée");
  for (const etape of ["depose", "diagnostic", "intervention", "pret", "a_venir"]) {
    assert.equal(raisonBlocage(etape), null);
  }
});

test("toute étape de la file En attente a une raison écrite", () => {
  for (const etape of par(regrouperOperationnel([], MAINTENANT), GROUPE_EN_ATTENTE).etapes) {
    assert.ok(raisonBlocage(etape), `${etape} n'a pas de raison`);
  }
});

// --- Le temps, dit seulement quand il est vrai -----------------------------

test("une voiture attendue annonce son heure d'arrivée", () => {
  const e = echeanceCarte(rdv("a_venir", { date_debut: aujourdhui(14) }), MAINTENANT, GROUPE_A_RECEVOIR);
  assert.equal(e.texte, "Attendue à 14:00");
  assert.equal(e.enRetard, false);
});

test("une voiture attendue dont l'heure est passée est signalée", () => {
  const e = echeanceCarte(rdv("a_venir", { date_debut: aujourdhui(8) }), MAINTENANT, GROUPE_A_RECEVOIR);
  assert.equal(e.enRetard, true);
});

test("une voiture entrée un autre jour ne se voit pas prêter une échéance du jour", () => {
  const e = echeanceCarte(rdv("intervention", { date_debut: avantHier(8), date_fin: avantHier(16) }), MAINTENANT, GROUPE_EN_ATELIER);
  assert.match(e.texte, /^Rendez-vous du /);
  // C'est le point : hier 16 h est passé, mais ce n'est pas un retard — aucune
  // échéance de restitution n'existe dans le modèle. Le signaler tous les jours
  // ferait une alerte allumée en permanence, donc invisible.
  assert.equal(e.enRetard, false);
});

test("le créneau du jour dépassé est dit comme tel", () => {
  const e = echeanceCarte(rdv("intervention", { date_debut: aujourdhui(7), date_fin: aujourdhui(9) }), MAINTENANT, GROUPE_EN_ATELIER);
  assert.equal(e.texte, "Créneau de 07:00 dépassé");
  assert.equal(e.enRetard, true);
});

test("sans date exploitable, la carte n'affiche aucune ligne de temps", () => {
  assert.equal(echeanceCarte({ date_debut: null }, MAINTENANT, GROUPE_EN_ATELIER), null);
  assert.equal(echeanceCarte({ date_debut: "pas une date" }, MAINTENANT, GROUPE_EN_ATELIER), null);
  assert.equal(echeanceCarte(null, MAINTENANT, GROUPE_EN_ATELIER), null);
});
