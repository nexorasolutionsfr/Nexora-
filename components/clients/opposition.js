// L'opposition d'un client aux relances par e-mail, telle que le garage la lit.
//
// Le journal `revenue_recovery_permissions` (append-only) fait foi ; sa vue
// `revenue_recovery_permissions_courant` donne la dernière décision par client
// et par canal. `client_oppose_relances` (migration 20260919001000) lit ce même
// journal au moment de préparer, d'autoriser et de réserver une relance : ce
// qui est enregistré ici est respecté par la base, pas seulement affiché.
//
// Ce module est pur : il ne décide que des mots. L'écriture passe par
// `revenue_recovery_enregistrer_permission`, qui impose sa machine à états et
// n'accepte que le titulaire du compte garage.

const STATUTS_OPPOSITION = new Set(["oppose", "revoque"]);

export const ORIGINE_DECLARATIF_GARAGE = "déclaratif garage (demande du client)";

/** Le client refuse-t-il les relances par e-mail, d'après la dernière décision ? */
export function clientOppose(courant) {
  return Boolean(courant) && STATUTS_OPPOSITION.has(courant.statut);
}

function dateFr(valeur) {
  if (!valeur) return "";
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Ce que dit la fiche client. `courant` : la ligne de la vue, ou null.
 * Aucune ligne ne vaut pas accord : c'est « aucune opposition enregistrée ».
 */
export function libelleOpposition(courant) {
  if (clientOppose(courant)) {
    const date = dateFr(courant.created_at);
    return {
      oppose: true,
      titre: "Refuse les relances par e-mail",
      detail: `Enregistré${date ? ` le ${date}` : ""}. Aucune relance de travaux ne lui sera préparée ni envoyée.`,
    };
  }
  return {
    oppose: false,
    titre: "Relances par e-mail : aucune opposition enregistrée",
    detail: "Si le client demande à ne plus être relancé, enregistrez-le ici. Les devis et factures ne sont pas concernés.",
  };
}

/** Message d'erreur lisible pour un refus de la fonction d'enregistrement. */
export function messageErreurOpposition(error) {
  const texte = error?.message || "";
  if (/Accès refusé/i.test(texte)) return "Seul le titulaire du compte garage peut enregistrer cette opposition.";
  if (/n'appartient pas au garage/i.test(texte)) return "Ce client n'appartient pas à ce garage.";
  return "L'opposition n'a pas pu être enregistrée. Rien n'a changé.";
}
