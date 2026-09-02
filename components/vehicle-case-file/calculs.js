// Module de calculs purs pour le Dossier Véhicule 360.
// Aucun accès réseau, aucun état React ici : uniquement des dérivations
// locales à partir des données déjà chargées par le dashboard (rendez-vous,
// devis, factures). Les rendez-vous passés en entrée portent un `statut`
// déjà traduit en libellé français (ex. "Confirmé") — c'est la forme réelle
// produite par le chargeur existant de NexoraDashboard.jsx. Les devis et
// factures conservent leur `statut` brut (`en_attente`, `accepte`, `refuse`,
// `payee`).

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

export function deriverProchaineAction({ rendezVous = [], devis = [], factures = [] }, maintenant = new Date()) {
  const devisEnAttente = trouverDevisEnAttente(devis);
  if (devisEnAttente) {
    return { label: "Relancer le client pour la validation du devis", cible: "devis", reference: devisEnAttente };
  }

  const etapeAtelier = determinerEtapeAtelierActuelle(rendezVous);
  if (etapeAtelier) {
    return { label: "Poursuivre le suivi à l'atelier", cible: "atelier", reference: etapeAtelier };
  }

  const prochainRdv = trouverProchainRendezVous(rendezVous, maintenant);
  if (prochainRdv) {
    return { label: "Rendez-vous à venir", cible: "agenda", reference: prochainRdv };
  }

  const factureEnAttente = trouverFactureEnAttente(factures);
  if (factureEnAttente) {
    return { label: "Relancer le règlement de la facture", cible: "factures", reference: factureEnAttente };
  }

  const dernierRdv = trouverDernierRendezVous(rendezVous, maintenant);
  if (dernierRdv) {
    return { label: "Aucune action en cours — dernière intervention terminée", cible: null, reference: dernierRdv };
  }

  return { label: "Aucune action en cours", cible: null, reference: null };
}

export function deriverStatutGlobal({ rendezVous = [], devis = [], factures = [] }, maintenant = new Date()) {
  const etapeAtelier = determinerEtapeAtelierActuelle(rendezVous);
  if (etapeAtelier) return { cle: "atelier", statutAtelier: etapeAtelier.statut_atelier };

  if (trouverDevisEnAttente(devis)) return { cle: "devis_en_attente" };

  if (trouverProchainRendezVous(rendezVous, maintenant)) return { cle: "rdv_a_venir" };

  if (trouverFactureEnAttente(factures)) return { cle: "facture_en_attente" };

  const aHistorique = rendezVous.length > 0 || devis.length > 0 || factures.length > 0;
  if (aHistorique) return { cle: "a_jour" };

  return { cle: "aucun_suivi" };
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

export function construireDossierVehicule({ vehicule, client, rendezVous = [], devis = [], factures = [] }, maintenant = new Date()) {
  return {
    vehicule,
    client,
    statutGlobal: deriverStatutGlobal({ rendezVous, devis, factures }, maintenant),
    prochaineAction: deriverProchaineAction({ rendezVous, devis, factures }, maintenant),
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
