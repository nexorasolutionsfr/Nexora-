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
 * ON NE DEVINE PAS LES RATTACHEMENTS
 *
 * La première version retombait sur « le devis le plus récent » ou « la
 * facture la plus récente » du véhicule quand le rendez-vous retenu n'avait
 * pas de document lié. Une facture payée l'an dernier devenait alors la
 * facture du rendez-vous de mardi, et le dossier annonçait un dossier clos
 * pour une intervention qui n'avait pas commencé.
 *
 * Désormais, chaque pièce n'est retenue que si le modèle porte la relation :
 * l'ordre par `rendez_vous_id`, la facture par `rendez_vous_id`, le devis par
 * `ordre.devis_id`. Sinon, elle n'appartient pas à cette intervention — elle
 * reste visible dans l'historique, pas intégrée en silence.
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

  // Sans rendez-vous, il n'y a pas de visite à reconstituer. Un devis seul est
  // une intervention en devenir ; lui adjoindre une facture ancienne
  // fabriquerait une visite qui n'a jamais eu lieu.
  if (!rdv) {
    return {
      rdv: null,
      devis: trierParDate(devis, "created_at", "desc")[0] || null,
      ordre: null,
      facture: null,
    };
  }

  const ordre = ordresReparation.find((o) => o.rendez_vous_id === rdv.id) || null;
  // Le devis vient de l'ordre. Sans ordre, rien ne relie un devis à ce
  // rendez-vous : le modèle ne porte pas cette relation, on ne l'invente pas.
  const devisRetenu = (ordre?.devis_id && devis.find((d) => d.id === ordre.devis_id)) || null;
  const facture = factures.find((f) => f.rendez_vous_id === rdv.id) || null;

  return { rdv, devis: devisRetenu, ordre, facture };
}

/**
 * Les devis que le modèle ne sait rattacher à aucune visite.
 *
 * LA LIMITE, ÉNONCÉE PLUTÔT QUE CONTOURNÉE
 *
 * Un devis ne rejoint un rendez-vous que par l'ordre de réparation — et
 * `ordres_reparation_check_integrite` exige qu'un devis soit **accepté** pour
 * y être rattaché. Un devis « en attente de réponse », donc, n'a par
 * construction aucun lien avec une visite : c'est le modèle qui est ainsi,
 * pas un oubli de chargement.
 *
 * Les faire disparaître serait pire que tout — un devis qui attend une réponse
 * est ce que le garage a de plus urgent. Ils sont donc rendus à part, sous un
 * libellé qui ne prétend pas qu'ils appartiennent à l'intervention en cours.
 */
export function devisSansRattachement({ devis = [], ordresReparation = [] }) {
  const rattaches = new Set(ordresReparation.map((o) => o.devis_id).filter(Boolean));
  return trierParDate(devis.filter((d) => !rattaches.has(d.id)), "created_at", "desc");
}

/* `cibleProchaineAction` a été supprimée le 13 septembre 2026. Elle choisissait
   l'écran d'après la seule existence d'un document, pendant que la phrase
   venait de `filVehicule` : le texte pouvait dire « rien à faire » quand le
   bouton ouvrait la facture. La destination est désormais produite avec l'état,
   la phrase et la personne qui agit — une seule décision, au même endroit,
   couverte par les mêmes tests. */

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

/**
 * `etatEnvoiDevis` / `etatEnvoiFacture` : les clés rendues par les fonctions
 * `etat_envoi_devis` / `etat_envoi_facture`. Elles ne se déduisent pas des
 * tables — `notifications_devis` n'est lisible par aucun rôle applicatif, et
 * c'est voulu. L'écran les demande pour les seuls documents de l'intervention
 * courante : deux appels au maximum, à l'ouverture du dossier. Tant qu'elles
 * ne sont pas connues, `filVehicule` retombe sur sa lecture prudente
 * (« relisez le message, puis confirmez l'envoi »), qui ne prétend jamais
 * qu'un envoi a eu lieu.
 */
export function construireDossierVehicule(
  { vehicule, client, rendezVous = [], devis = [], ordresReparation = [], factures = [], etatEnvoiDevis = null, etatEnvoiFacture = null },
  maintenant = new Date(),
) {
  const intervention = selectionnerInterventionCourante({ rendezVous, devis, ordresReparation, factures }, maintenant);
  const fil = filVehicule({ ...intervention, etatEnvoiDevis, etatEnvoiFacture });

  return {
    vehicule,
    client,
    // L'intervention en cours et sa lecture. `fil.etat` est une situation
    // lue, pas un statut stocké : les statuts du devis, de la facture et de
    // l'atelier restent exposés séparément ci-dessous.
    intervention,
    fil,
    // Voir `devisSansRattachement` : le modèle ne relie pas un devis en
    // attente à une visite. On les montre à part plutôt que de les perdre.
    devisSansRattachement: devisSansRattachement({ devis, ordresReparation }),
    prochaineAction: {
      label: fil.prochaineAction,
      cible: fil.cible,
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
