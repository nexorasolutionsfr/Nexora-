// Où en est cette voiture, et qu'est-ce qu'on fait maintenant.
//
// POURQUOI CE MODULE
//
// Le parcours d'une réparation traverse cinq objets — rendez-vous, devis,
// ordre de réparation, étape d'atelier, facture — et chacun portait son statut
// dans son écran. Recette du 12 septembre 2026 : un ordre de réparation
// « Terminé » cohabitait avec un atelier « À venir » pour la même voiture, et
// le panneau du rendez-vous proposait « Préparer la fiche atelier » alors que
// l'ordre existait déjà. Trois écrans, trois vérités, aucune prochaine action.
//
// Ce module ne stocke rien et ne décide rien en base : il lit les statuts
// existants et en tire une seule phrase — l'état, le geste suivant, et qui
// doit le faire. Les statuts restent la source de vérité ; c'est leur lecture
// qui était éparpillée.
//
// VOCABULAIRE, tenu ici une fois pour toutes :
//   — « ordre de réparation » : le document de travail et d'autorisation ;
//   — « fiche atelier » : la vue opérationnelle qui en découle.
// Les deux mots ne désignent pas le même objet et ne sont pas interchangeables.

export const AGIT_GARAGE = "garage";
export const AGIT_CLIENT = "client";
export const AGIT_PERSONNE = "personne";

const ETAPES_ATELIER_ENGAGEES = new Set([
  "depose",
  "diagnostic",
  "attente_client",
  "attente_piece",
  "intervention",
  "pret",
]);

function etapeAtelier(rdv) {
  return rdv?.statut_atelier || "a_venir";
}

/**
 * Le fil de cette voiture : un état, une prochaine action, et son auteur.
 *
 * Tous les arguments sont facultatifs — un rendez-vous nu donne déjà une
 * réponse utile. `etatEnvoiDevis` et `etatEnvoiFacture` sont les clés rendues
 * par `etat_envoi_devis` / `etat_envoi_facture` (voir envoi/etatsEnvoi.js) :
 * elles servent à ne jamais proposer d'envoyer deux fois.
 */
export function filVehicule({
  rdv = null,
  devis = null,
  ordre = null,
  facture = null,
  etatEnvoiDevis = null,
  etatEnvoiFacture = null,
} = {}) {
  const etape = etapeAtelier(rdv);
  const ordreStatut = ordre?.statut || null;
  const ordreTermine = ordreStatut === "termine";
  const ordreActif = ordreStatut === "brouillon" || ordreStatut === "confirme";

  // Une contradiction se signale au lieu de se taire : l'ordre déclare les
  // travaux terminés alors que la voiture n'est même pas notée reçue.
  const contradiction = ordreTermine && etape === "a_venir";

  // Facture : la fin du fil.
  if (facture) {
    if (facture.statut === "payee") {
      return fil("Facture payée", "Rien à faire : ce dossier est clos.", AGIT_PERSONNE, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiFacture === "envoye") {
      return fil("Facture envoyée", "Le client doit la régler. Marquez-la payée quand vous aurez reçu le paiement.", AGIT_CLIENT, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiFacture === "en_attente_envoi") {
      return fil("Facture en attente d'envoi", "L'envoi est programmé. Rien d'autre à faire pour l'instant.", AGIT_PERSONNE, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiFacture === "envoi_en_cours") {
      return fil("Facture : envoi à vérifier", "Vérifiez avec le client ce qu'il a reçu avant de lui écrire à nouveau.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
    }
    return fil("Facture établie", "Relisez le message, puis confirmez son envoi au client.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }

  // Travaux terminés : il reste à restituer, puis à facturer.
  if (etape === "restitue") {
    return fil("Voiture restituée", "Générez la facture depuis l'écran Facturation.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }
  if (etape === "pret" || ordreTermine) {
    return fil(
      ordreTermine && etape !== "pret" ? "Travaux terminés sur l'ordre de réparation" : "Voiture prête",
      "Notez la restitution quand le client aura repris sa voiture.",
      AGIT_CLIENT,
      { contradiction, ordreStatut, etape }
    );
  }

  // Atelier engagé : la fiche atelier suit les travaux.
  if (ETAPES_ATELIER_ENGAGEES.has(etape)) {
    return fil("Voiture à l'atelier", "Suivez l'avancement depuis la fiche atelier.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }

  // L'ordre existe et n'est pas terminé : on ne propose plus d'en « préparer »
  // un, on ouvre celui qui existe.
  if (ordreActif) {
    return fil("Ordre de réparation ouvert", "Ouvrez-le pour suivre les travaux.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }

  // Le devis mène l'histoire tant qu'il n'y a pas d'ordre.
  if (devis) {
    if (devis.statut === "accepte") {
      return fil("Devis accepté", "Créez l'ordre de réparation pour lancer les travaux.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
    }
    if (devis.statut === "refuse") {
      return fil("Devis refusé", "Rien à faire : le client n'a pas donné suite.", AGIT_PERSONNE, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiDevis === "envoye") {
      return fil("Devis envoyé", "Le client doit répondre. Vous pouvez enregistrer sa réponse s'il vous l'a donnée autrement.", AGIT_CLIENT, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiDevis === "en_attente_envoi") {
      return fil("Devis en attente d'envoi", "L'envoi est programmé. Rien d'autre à faire pour l'instant.", AGIT_PERSONNE, { contradiction, ordreStatut, etape });
    }
    if (etatEnvoiDevis === "envoi_en_cours") {
      return fil("Devis : envoi à vérifier", "Vérifiez avec le client ce qu'il a reçu avant de lui écrire à nouveau.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
    }
    return fil("Devis établi", "Relisez le message, puis confirmez son envoi au client.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }

  if (rdv) {
    return fil("Rendez-vous prévu", "Établissez le devis, ou notez l'arrivée de la voiture à l'atelier.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
  }

  return fil("Dossier ouvert", "Créez un rendez-vous pour cette voiture.", AGIT_GARAGE, { contradiction, ordreStatut, etape });
}

function fil(etat, prochaineAction, quiAgit, { contradiction, ordreStatut, etape }) {
  return {
    etat,
    prochaineAction,
    quiAgit,
    ordreStatut,
    etapeAtelier: etape,
    contradiction,
    // Une contradiction ne remplace pas la prochaine action : elle s'y ajoute,
    // parce qu'il faut d'abord comprendre, puis agir.
    avertissement: contradiction
      ? "L'ordre de réparation est terminé, mais la voiture est encore notée « à venir » à l'atelier. Mettez l'atelier à jour."
      : null,
  };
}

/** Le libellé du bouton qui mène à l'ordre de réparation, selon qu'il existe. */
export function actionOrdreReparation(ordre) {
  return ordre ? "Ouvrir l'ordre de réparation" : "Créer l'ordre de réparation";
}

/** Qui doit agir, en clair. */
export function libelleQuiAgit(quiAgit) {
  switch (quiAgit) {
    case AGIT_CLIENT:
      return "Au client de jouer";
    case AGIT_PERSONNE:
      return "Rien à faire";
    default:
      return "À vous de jouer";
  }
}
