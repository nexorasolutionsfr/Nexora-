// Module de calculs purs pour le Dossier Véhicule 360.
// Aucun accès réseau, aucun état React ici : uniquement des dérivations
// locales à partir des données déjà chargées par le dashboard (rendez-vous,
// devis, ordres de réparation, factures). Les rendez-vous passés en entrée
// portent un `statut` déjà traduit en libellé français (ex. "Confirmé") —
// c'est la forme réelle produite par le chargeur existant de
// NexoraDashboard.jsx. Les devis et factures conservent leur `statut` brut
// (`en_attente`, `accepte`, `refuse`, `payee`).
//
// UNE SEULE LECTURE DU FIL, ET C'EST CELLE DE L'ATELIER
//
// Ce module dérivait sa propre « prochaine action » et son propre « statut
// global » à partir de trois sources : rendez-vous, devis, factures. L'ordre
// de réparation n'y entrait pas — il n'était même pas passé au dossier. Deux
// conséquences observées le 13 septembre 2026 :
//
//   — travaux terminés sur l'ordre, devis encore « en attente » : le dossier
//     affichait « Relancer le client pour la validation du devis » alors que
//     la voiture était réparée ;
//   — ordre ouvert sans étape d'atelier saisie : le dossier annonçait
//     « Rendez-vous à venir » et ignorait le travail en cours.
//
// `atelier/filVehicule` lit les cinq statuts, ordre compris, et sait déjà
// signaler la contradiction « ordre terminé / voiture à venir ». Il devient
// la source unique de l'état, de la prochaine action et de la personne qui
// doit agir. Les statuts métier ne sont pas fusionnés pour autant : le devis,
// la facture et l'étape d'atelier restent exposés séparément ci-dessous et
// affichés tels quels par la vue.

import { filVehicule } from "../atelier/filVehicule.js";

const ATELIER_ETAPES_EN_COURS = ["depose", "diagnostic", "attente_client", "attente_piece", "intervention"];

function parseDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function trierParDate(items, cleDate, ordre = "asc") {
  const copie = [...items];
  copie.sort((a, b) => {
    const da = parseDate(a[cleDate]);
    const db = parseDate(b[cleDate]);
    if (!da && !db) return 0;
    if (!da) return ordre === "asc" ? -1 : 1;
    if (!db) return ordre === "asc" ? 1 : -1;
    return ordre === "asc" ? da - db : db - da;
  });
  return copie;
}

export function construireChronologie({ rendezVous = [], devis = [], factures = [] }) {
  const evenements = [
    ...rendezVous.map((r) => ({
      type: "rendez_vous",
      date: r.date_debut,
      titre: r.prestation || "Rendez-vous",
      statut: r.statut || null,
      id: r.id,
    })),
    ...devis.map((d) => ({
      type: "devis",
      date: d.created_at,
      titre: "Devis",
      statut: d.statut || null,
      id: d.id,
    })),
    ...factures.map((f) => ({
      type: "facture",
      date: f.created_at,
      titre: "Facture",
      statut: f.statut || null,
      id: f.id,
    })),
  ].filter((evenement) => parseDate(evenement.date));

  return trierParDate(evenements, "date", "asc");
}

export function determinerEtapeAtelierActuelle(rendezVous = []) {
  const enCours = rendezVous
    .filter((r) => ATELIER_ETAPES_EN_COURS.includes(r.statut_atelier))
    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut));
  return enCours[0] || null;
}

export function trouverProchainRendezVous(rendezVous = [], maintenant = new Date()) {
  const aVenir = rendezVous.filter((r) => {
    const date = parseDate(r.date_debut);
    return date && date > maintenant && r.statut !== "Annulé";
  });
  return trierParDate(aVenir, "date_debut", "asc")[0] || null;
}

export function trouverDernierRendezVous(rendezVous = [], maintenant = new Date()) {
  const passes = rendezVous.filter((r) => {
    const date = parseDate(r.date_debut);
    return date && date <= maintenant;
  });
  return trierParDate(passes, "date_debut", "desc")[0] || null;
}

export function trouverDevisEnAttente(devis = []) {
  return trierParDate(devis.filter((d) => d.statut === "en_attente"), "created_at", "desc")[0] || null;
}

export function trouverFactureEnAttente(factures = []) {
  return trierParDate(factures.filter((f) => f.statut === "en_attente"), "created_at", "desc")[0] || null;
}

/**
 * L'intervention à laquelle se rapporte le fil : un véhicule a un historique,
 * `filVehicule` raisonne sur une visite.
 *
 * Le rendez-vous retenu est celui qui est à l'atelier, sinon le prochain à
 * venir, sinon le dernier passé. Les autres pièces s'y rattachent par leurs
 * liens réels — l'ordre par son rendez-vous, le devis par l'ordre — et
 * retombent sur le plus récent du véhicule quand le lien n'existe pas. C'est
 * la règle déjà appliquée par `filDuRendezVous` dans NexoraDashboard ; elle
 * est écrite ici pour être testable.
 */
export function selectionnerInterventionCourante(
  { rendezVous = [], devis = [], ordresReparation = [], factures = [] },
  maintenant = new Date(),
) {
  const rdv =
    determinerEtapeAtelierActuelle(rendezVous)
    || trouverProchainRendezVous(rendezVous, maintenant)
    || trouverDernierRendezVous(rendezVous, maintenant)
    || null;

  const ordre = rdv
    ? ordresReparation.find((o) => o.rendez_vous_id === rdv.id) || null
    : trierParDate(ordresReparation, "created_at", "desc")[0] || null;

  const devisRetenu =
    (ordre?.devis_id && devis.find((d) => d.id === ordre.devis_id))
    || trierParDate(devis, "created_at", "desc")[0]
    || null;

  const facture =
    (rdv && factures.find((f) => f.rendez_vous_id === rdv.id))
    || trierParDate(factures, "created_at", "desc")[0]
    || null;

  return { rdv, devis: devisRetenu, ordre, facture };
}

/**
 * Où mène le bouton de la prochaine action.
 *
 * Ce n'est pas une décision métier — celle-là appartient à `filVehicule` —
 * mais une destination de navigation, dérivée de ce qui existe. Tant que les
 * gestes ne sont pas réalisables depuis le dossier, l'écran d'à côté reste le
 * seul endroit où agir.
 */
export function cibleProchaineAction({ rdv, devis, ordre, facture }) {
  if (facture) return "factures";
  if (ordre) return "ordres_reparation";
  if (rdv && ATELIER_ETAPES_EN_COURS.includes(rdv.statut_atelier)) return "atelier";
  if (devis) return "devis";
  if (rdv) return "agenda";
  return null;
}

export function detecterDonneesIncompletes({ vehicule, client }) {
  const champsManquantsVehicule = [];
  if (!vehicule?.marque && !vehicule?.modele) champsManquantsVehicule.push("marque/modèle");
  if (!vehicule?.immatriculation) champsManquantsVehicule.push("immatriculation");

  const champsManquantsClient = [];
  if (!client?.nom) champsManquantsClient.push("nom du client");

  return {
    incomplet: champsManquantsVehicule.length > 0 || champsManquantsClient.length > 0,
    champsManquantsVehicule,
    champsManquantsClient,
  };
}

export function construireDossierVehicule({ vehicule, client, rendezVous = [], devis = [], ordresReparation = [], factures = [] }, maintenant = new Date()) {
  const intervention = selectionnerInterventionCourante({ rendezVous, devis, ordresReparation, factures }, maintenant);
  const fil = filVehicule(intervention);

  return {
    vehicule,
    client,
    // L'intervention en cours et sa lecture. `fil.etat` est une situation
    // lue, pas un statut stocké : les statuts du devis, de la facture et de
    // l'atelier restent exposés séparément ci-dessous.
    intervention,
    fil,
    prochaineAction: {
      label: fil.prochaineAction,
      cible: cibleProchaineAction(intervention),
      reference: intervention.rdv || intervention.devis || intervention.facture || null,
    },
    prochainRendezVous: trouverProchainRendezVous(rendezVous, maintenant),
    dernierRendezVous: trouverDernierRendezVous(rendezVous, maintenant),
    etapeAtelier: determinerEtapeAtelierActuelle(rendezVous),
    devisEnAttente: trouverDevisEnAttente(devis),
    factureEnAttente: trouverFactureEnAttente(factures),
    chronologie: construireChronologie({ rendezVous, devis, factures }),
    donneesIncompletes: detecterDonneesIncompletes({ vehicule, client }),
    aRendezVous: rendezVous.length > 0,
    aDevis: devis.length > 0,
    aFacture: factures.length > 0,
  };
}
