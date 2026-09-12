// Les réponses des clients, là où le garagiste les cherche.
//
// Recette du 2026-09-11 : un devis accepté par le client disparaissait de
// l'onglet Devis (« Aucun devis en attente ») et de l'accueil (« rien qui
// bloque ») ; il ne restait que Facturation › Historique, troisième onglet.
// Le garagiste qui cherche la réponse regarde là où il a créé le devis.
//
// Une réponse reste « récente » quelques jours : assez pour être vue au
// retour d'un week-end, pas assez pour encombrer. L'historique complet reste
// dans Historique.

export const JOURS_REPONSE_RECENTE = 7;

const STATUTS_REPONSE = new Set(["accepte", "refuse"]);

/**
 * Devis ayant reçu une réponse (acceptée ou refusée) depuis moins de
 * `jours`, du plus récent au plus ancien. La date de réponse est
 * `date_validation`, posée au moment où le statut change.
 */
export function reponsesRecentes(devisList = [], maintenant = new Date(), jours = JOURS_REPONSE_RECENTE) {
  const limite = maintenant.getTime() - jours * 86_400_000;
  return devisList
    .filter((d) => STATUTS_REPONSE.has(d?.statut) && d.date_validation)
    .filter((d) => {
      const t = new Date(d.date_validation).getTime();
      return Number.isFinite(t) && t >= limite && t <= maintenant.getTime() + 60_000;
    })
    .sort((a, b) => new Date(b.date_validation) - new Date(a.date_validation));
}

/** La phrase d'une réponse, du point de vue du garage. */
export function libelleReponse(devis) {
  return devis?.statut === "accepte" ? "Devis accepté" : "Devis refusé";
}

// ---------------------------------------------------------------------------
// QUI A RÉPONDU — revue du 12 septembre 2026
//
// L'accueil écrivait « Devis accepté par Julien Recette — reçu à l'instant »
// dans les deux cas : quand le client avait cliqué depuis son lien, et quand
// le garagiste avait tapé l'accord reçu au téléphone. Un horodatage laissait
// donc croire à un geste du client là où il n'y en avait pas — et c'est cette
// ligne-là qu'on relit six mois plus tard en cas de litige.
//
// `devis.reponse_origine` (migration 20260917000100) tranche : « client »,
// « garage », ou rien du tout pour les réponses antérieures — dont l'origine
// n'a pas été enregistrée et qu'on n'invente pas.

export const ORIGINE_CLIENT = "client";
export const ORIGINE_GARAGE = "garage";
export const ORIGINE_INCONNUE = "inconnue";

export function origineReponse(devis) {
  const brut = devis?.reponse_origine;
  return brut === ORIGINE_CLIENT || brut === ORIGINE_GARAGE ? brut : ORIGINE_INCONNUE;
}

/** Le titre d'une réponse, qui nomme l'auteur du geste. */
export function titreReponse(devis, nomClient = "") {
  const nom = (nomClient || devis?.client || "ce client").trim() || "ce client";
  const accepte = devis?.statut === "accepte";
  switch (origineReponse(devis)) {
    case ORIGINE_CLIENT:
      return accepte ? `${nom} a accepté son devis` : `${nom} a refusé son devis`;
    case ORIGINE_GARAGE:
      return accepte
        ? `Accord de ${nom} enregistré par le garage`
        : `Refus de ${nom} enregistré par le garage`;
    default:
      return accepte ? `Devis accepté — ${nom}` : `Devis refusé — ${nom}`;
  }
}

/** D'où vient la réponse, en une mention courte posée à côté de la date. */
export function mentionOrigine(devis) {
  switch (origineReponse(devis)) {
    case ORIGINE_CLIENT:
      return "depuis son lien";
    case ORIGINE_GARAGE:
      return "saisi au comptoir";
    default:
      return "origine non enregistrée";
  }
}
