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
