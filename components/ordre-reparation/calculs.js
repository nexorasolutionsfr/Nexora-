// Ordre de Réparation V1 — logique pure (calculs, filtres, validations,
// traduction d'erreurs). Aucun accès réseau ici : ces fonctions reçoivent
// des données déjà chargées et ne font que les dériver ou les valider.
// Les règles reproduites reflètent exactement les contraintes déjà
// imposées côté base par supabase/migrations/20260902000100_ordres_reparation_v1.sql
// (CHECK, contrainte d'unicité, triggers) — elles ne les remplacent jamais,
// elles évitent seulement un aller-retour serveur inutile pour les cas
// évidents et affichent un message sobre pour les autres.

/**
 * Un ordre de réparation existe déjà pour ce rendez-vous ? (contrainte
 * d'unicité rendez_vous_id côté base).
 */
export function trouverOrdrePourRendezVous(ordres, rendezVousId) {
  if (!rendezVousId) return null;
  return ordres.find((o) => o.rendez_vous_id === rendezVousId) || null;
}

/**
 * Rendez-vous pouvant recevoir un nouvel OR : ceux qui n'en ont pas déjà un.
 * Si clientId/vehiculeId sont fournis (transformation depuis un devis
 * accepté, cf. contrat E.3), restreint en plus à ce client et ce véhicule.
 */
export function filtrerRendezVousEligibles(rendezVous, ordres, { clientId, vehiculeId } = {}) {
  return rendezVous.filter((r) => {
    if (trouverOrdrePourRendezVous(ordres, r.id)) return false;
    if (clientId && r.client_id !== clientId) return false;
    if (vehiculeId && r.vehicule_id !== vehiculeId) return false;
    return true;
  });
}

/**
 * Un devis est rattachable à un OR uniquement s'il est accepté et
 * appartient au même garage, client et véhicule que le rendez-vous choisi
 * (mêmes règles que le trigger ordres_reparation_check_integrite).
 */
export function estDevisCompatible(devis, { garageId, clientId, vehiculeId }) {
  if (!devis) return false;
  return (
    devis.statut === "accepte" &&
    devis.garage_id === garageId &&
    devis.client_id === clientId &&
    devis.vehicule_id === vehiculeId
  );
}

export function filtrerDevisAttachables(devisList, contexte) {
  return devisList.filter((d) => estDevisCompatible(d, contexte));
}

/**
 * Validation d'une ligne (main_oeuvre / piece) — reproduit les contraintes
 * CHECK de ordres_reparation_lignes : quantite > 0, prix_unitaire_ht nul ou
 * positif, duree_minutes strictement positive uniquement pour main_oeuvre
 * (nulle pour piece).
 */
export function validerLigneForm({ type, libelle, quantite, prix_unitaire_ht, duree_minutes }) {
  const erreurs = {};

  if (type !== "main_oeuvre" && type !== "piece") {
    erreurs.type = "Type de ligne invalide.";
  }

  if (!libelle || !String(libelle).trim()) {
    erreurs.libelle = "Le libellé est obligatoire.";
  }

  const quantiteNombre = Number(quantite);
  if (!Number.isFinite(quantiteNombre) || quantiteNombre <= 0) {
    erreurs.quantite = "La quantité doit être un nombre strictement positif.";
  }

  if (prix_unitaire_ht !== null && prix_unitaire_ht !== undefined && prix_unitaire_ht !== "") {
    const prixNombre = Number(prix_unitaire_ht);
    if (!Number.isFinite(prixNombre) || prixNombre < 0) {
      erreurs.prix_unitaire_ht = "Le prix HT doit être nul ou positif.";
    }
  }

  const dureeVide = duree_minutes === null || duree_minutes === undefined || duree_minutes === "";
  if (type === "piece") {
    if (!dureeVide) {
      erreurs.duree_minutes = "La durée ne s'applique qu'aux lignes de main d'œuvre.";
    }
  } else if (type === "main_oeuvre" && !dureeVide) {
    const dureeNombre = Number(duree_minutes);
    if (!Number.isFinite(dureeNombre) || dureeNombre <= 0) {
      erreurs.duree_minutes = "La durée doit être un nombre de minutes strictement positif.";
    }
  }

  return { valide: Object.keys(erreurs).length === 0, erreurs };
}

/**
 * Total HT estimé d'un OR — indicatif uniquement (aucune valeur
 * contractuelle, jamais un TTC ni un montant facturé). Ignore les lignes
 * sans prix renseigné plutôt que de les compter comme zéro dans l'affichage
 * d'un simple total incomplet.
 */
export function calculerTotalEstimeHT(lignes) {
  return lignes.reduce((total, ligne) => {
    const prix = Number(ligne.prix_unitaire_ht);
    const quantite = Number(ligne.quantite);
    if (!Number.isFinite(prix) || !Number.isFinite(quantite)) return total;
    return total + prix * quantite;
  }, 0);
}

/**
 * Garde-fou d'affichage uniquement (contrat : "interdire visuellement
 * l'édition des lignes après annulation, en laissant la base comme source
 * d'autorité") — la RLS et les policies restent la seule autorité réelle.
 */
export function peutModifierLignes(ordre) {
  return !!ordre && ordre.statut !== "annule";
}

/**
 * Traduit une erreur Postgres/PostgREST en message métier sobre. Les
 * sous-chaînes reconnues sont reprises mot pour mot des `raise exception`
 * de supabase/migrations/20260902000100_ordres_reparation_v1.sql — jamais
 * inventées.
 */
export function traduireErreurOR(error) {
  if (!error) return "Une erreur est survenue. Réessayez.";
  const message = error.message || "";

  if (error.code === "23505" || message.includes("ordres_reparation_rendez_vous_unique")) {
    return "Un ordre de réparation existe déjà pour ce rendez-vous.";
  }
  if (error.code === "23514") {
    return "Cette ligne ne respecte pas les règles de saisie (quantité, prix ou durée).";
  }
  if (error.code === "42501") {
    return "Cette action n'est pas autorisée pour cet ordre de réparation.";
  }
  if (message.includes("doit etre accepte")) {
    return "Ce devis doit être accepté avant de pouvoir être rattaché.";
  }
  if (message.includes("devis introuvable") || message.includes("devis ne correspond pas")) {
    return "Ce devis n'est plus disponible pour ce rendez-vous.";
  }
  if (message.includes("rendez_vous introuvable") || message.includes("rendez_vous ne correspond pas")) {
    return "Ce rendez-vous n'est plus disponible.";
  }
  if (message.includes("mecanicien hors garage")) {
    return "Ce mécanicien n'appartient pas à ce garage.";
  }
  if (message.includes("prestation hors garage")) {
    return "Cette prestation n'appartient pas à ce garage.";
  }
  if (message.includes("figes a la creation")) {
    return "Ces informations ne peuvent plus être modifiées après la création de l'ordre.";
  }
  if (message.includes("ne correspond pas au garage, client ou vehicule")) {
    return "Ces éléments ne correspondent pas au client ou au véhicule de cet ordre.";
  }
  if (message.includes("ordre de reparation introuvable")) {
    return "Cet ordre de réparation n'est plus disponible.";
  }
  if (message.includes("garage_id incoherent")) {
    return "Cette ligne ne correspond pas au garage de cet ordre.";
  }

  return "Une erreur est survenue. Réessayez.";
}
