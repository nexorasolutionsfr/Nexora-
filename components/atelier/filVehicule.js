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

/**
 * Où le geste se poursuit. `null` = aucun écran à ouvrir : le dossier est clos
 * ou la balle n'est pas dans le camp du garage.
 *
 * Ces clés sont produites ICI, avec l'état et la phrase, parce qu'une
 * destination choisie ailleurs redevient un second calcul : le texte pouvait
 * dire « rien à faire » pendant que le bouton ouvrait la facture.
 */
export const CIBLE_ATELIER = "atelier";
export const CIBLE_DEVIS = "devis";
export const CIBLE_FACTURES = "factures";
export const CIBLE_AGENDA = "agenda";
export const CIBLE_ORDRE = "ordres_reparation";
// Pointe vers la section « Devis sans intervention associée » du dossier :
// il n'y a pas d'écran à ouvrir, il y a une liste à vérifier sur place.
export const CIBLE_DEVIS_SANS_INTERVENTION = "devis_sans_intervention";

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
  // Combien de devis de ce véhicule ne sont rattachés à aucune intervention.
  // La base interdit de lier un devis non accepté à un ordre : ces devis
  // existent donc sans appartenir à une visite. Les ignorer conduisait le fil
  // à conseiller d'en établir un alors qu'il y en avait déjà — c'est ainsi
  // qu'on crée des doublons.
  devisSansIntervention = 0,
} = {}) {
  const etape = etapeAtelier(rdv);
  const ordreStatut = ordre?.statut || null;
  const ordreTermine = ordreStatut === "termine";
  const ordreActif = ordreStatut === "brouillon" || ordreStatut === "confirme";

  // Une contradiction se signale au lieu de se taire : l'ordre déclare les
  // travaux terminés alors que la voiture n'est même pas notée reçue.
  const contradiction = ordreTermine && etape === "a_venir";
  const aRendezVous = Boolean(rdv);

  // Facture : la fin du fil.
  if (facture) {
    if (facture.statut === "payee") {
      return fil("Facture payée", "Rien à faire : ce dossier est clos.", AGIT_PERSONNE, null, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiFacture === "envoye") {
      return fil("Facture envoyée", "Le client doit la régler. Marquez-la payée quand vous aurez reçu le paiement.", AGIT_CLIENT, CIBLE_FACTURES, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiFacture === "en_attente_envoi") {
      return fil("Facture en attente d'envoi", "L'envoi est programmé. Rien d'autre à faire pour l'instant.", AGIT_PERSONNE, null, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiFacture === "envoi_en_cours") {
      return fil("Facture : envoi à vérifier", "Vérifiez avec le client ce qu'il a reçu avant de lui écrire à nouveau.", AGIT_GARAGE, CIBLE_FACTURES, { contradiction, ordreStatut, etape, aRendezVous });
    }
    return fil("Facture établie", "Relisez le message, puis confirmez son envoi au client.", AGIT_GARAGE, CIBLE_FACTURES, { contradiction, ordreStatut, etape, aRendezVous });
  }

  // Travaux terminés : il reste à restituer, puis à facturer.
  if (etape === "restitue") {
    return fil("Voiture restituée", "Générez la facture depuis l'écran Facturation.", AGIT_GARAGE, CIBLE_FACTURES, { contradiction, ordreStatut, etape, aRendezVous });
  }
  if (etape === "pret" || ordreTermine) {
    return fil(
      ordreTermine && etape !== "pret" ? "Travaux terminés sur l'ordre de réparation" : "Voiture prête",
      "Notez la restitution quand le client aura repris sa voiture.",
      AGIT_CLIENT,
      CIBLE_ORDRE,
      { contradiction, ordreStatut, etape, aRendezVous }
    );
  }

  // Atelier engagé : la fiche atelier suit les travaux.
  if (ETAPES_ATELIER_ENGAGEES.has(etape)) {
    return fil("Voiture à l'atelier", "Suivez l'avancement depuis la fiche atelier.", AGIT_GARAGE, CIBLE_ATELIER, { contradiction, ordreStatut, etape, aRendezVous });
  }

  // L'ordre existe et n'est pas terminé : on ne propose plus d'en « préparer »
  // un, on ouvre celui qui existe.
  if (ordreActif) {
    return fil("Ordre de réparation ouvert", "Ouvrez-le pour suivre les travaux.", AGIT_GARAGE, CIBLE_ORDRE, { contradiction, ordreStatut, etape, aRendezVous });
  }

  // Le devis mène l'histoire tant qu'il n'y a pas d'ordre.
  if (devis) {
    if (devis.statut === "accepte") {
      // `ordres_reparation.rendez_vous_id` est NOT NULL, et l'écran de création
      // le dit : « un ordre de réparation prolonge toujours un rendez-vous
      // existant ». Sans rendez-vous, envoyer le garage vers les fiches
      // atelier le mène à une liste où le bouton de création reste désactivé —
      // ou, pire, où il choisirait le rendez-vous d'une autre voiture.
      // Vérifié à l'écran le 13 septembre 2026 sur un véhicule sans
      // rendez-vous : neuf rendez-vous proposés, aucun de ce véhicule.
      if (!rdv) {
        return fil(
          "Devis accepté",
          "Planifiez le rendez-vous : les travaux se rattachent toujours à un rendez-vous.",
          AGIT_GARAGE,
          CIBLE_AGENDA,
          { contradiction, ordreStatut, etape, aRendezVous },
        );
      }
      return fil("Devis accepté", "Créez l'ordre de réparation pour lancer les travaux.", AGIT_GARAGE, CIBLE_ORDRE, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (devis.statut === "refuse") {
      // « N'a pas donné suite » décrit un silence. Un refus enregistré n'est
      // pas un silence : le client a répondu, et il a dit non.
      return fil("Devis refusé", "Le client a refusé ce devis.", AGIT_PERSONNE, null, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiDevis === "envoye") {
      return fil("Devis envoyé", "Le client doit répondre. Vous pouvez enregistrer sa réponse s'il vous l'a donnée autrement.", AGIT_CLIENT, CIBLE_DEVIS, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiDevis === "en_attente_envoi") {
      return fil("Devis en attente d'envoi", "L'envoi est programmé. Rien d'autre à faire pour l'instant.", AGIT_PERSONNE, null, { contradiction, ordreStatut, etape, aRendezVous });
    }
    if (etatEnvoiDevis === "envoi_en_cours") {
      return fil("Devis : envoi à vérifier", "Vérifiez avec le client ce qu'il a reçu avant de lui écrire à nouveau.", AGIT_GARAGE, CIBLE_DEVIS, { contradiction, ordreStatut, etape, aRendezVous });
    }
    return fil("Devis établi", "Relisez le message, puis confirmez son envoi au client.", AGIT_GARAGE, CIBLE_DEVIS, { contradiction, ordreStatut, etape, aRendezVous });
  }

  if (rdv) {
    // Ne jamais conseiller d'établir un devis quand il en existe déjà un que
    // le modèle n'a pas su rattacher : on demande de vérifier, pas de créer.
    if (devisSansIntervention > 0) {
      return fil(
        "Rendez-vous prévu",
        "Un devis existe déjà pour ce véhicule. Vérifiez s'il concerne ce rendez-vous avant d'en créer un autre.",
        AGIT_GARAGE,
        devisSansIntervention === 1 ? CIBLE_DEVIS : CIBLE_DEVIS_SANS_INTERVENTION,
        { contradiction, ordreStatut, etape, aRendezVous },
      );
    }
    return fil("Rendez-vous prévu", "Établissez le devis, ou notez l'arrivée de la voiture à l'atelier.", AGIT_GARAGE, CIBLE_AGENDA, { contradiction, ordreStatut, etape, aRendezVous });
  }

  return fil("Dossier ouvert", "Créez un rendez-vous pour cette voiture.", AGIT_GARAGE, CIBLE_AGENDA, { contradiction, ordreStatut, etape, aRendezVous });
}

const LIBELLES_CIBLE = {
  [CIBLE_ATELIER]: "Ouvrir la fiche atelier",
  [CIBLE_DEVIS]: "Ouvrir le devis",
  [CIBLE_AGENDA]: "Voir le rendez-vous",
  [CIBLE_FACTURES]: "Ouvrir la facture",
  [CIBLE_DEVIS_SANS_INTERVENTION]: "Voir les devis",
};

/**
 * Ce que le bouton fait vraiment.
 *
 * `onOuvrirOrdresReparation` ne « donne pas accès » à une fiche : il ferme le
 * dossier et emmène à l'écran des fiches atelier, filtré sur ce véhicule.
 * Quand aucune fiche n'existe, écrire « Ouvrir la fiche atelier » promet un
 * document qui n'est pas là. Observé en Production le 13 septembre 2026 sur un
 * véhicule au devis accepté et sans ordre.
 */
function libelleCible(cible, ordreStatut, aRendezVous) {
  if (cible === CIBLE_ORDRE) {
    return ordreStatut ? "Ouvrir la fiche atelier" : "Aller aux fiches atelier";
  }
  if (cible === CIBLE_AGENDA) {
    return aRendezVous ? "Voir le rendez-vous" : "Planifier le rendez-vous";
  }
  return LIBELLES_CIBLE[cible] || null;
}

function fil(etat, prochaineAction, quiAgit, cible, { contradiction, ordreStatut, etape, aRendezVous = false }) {
  return {
    etat,
    prochaineAction,
    quiAgit,
    // La destination du bouton, décidée en même temps que la phrase.
    cible,
    // Et son libellé : il dépend de ce qui existe, donc il se décide ici.
    libelleAction: libelleCible(cible, ordreStatut, aRendezVous),
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
