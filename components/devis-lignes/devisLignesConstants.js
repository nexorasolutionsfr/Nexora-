// Devis multi-lignes V1 — constantes partagées. Reprend les jetons visuels
// et le vocabulaire du lot Ordre de Réparation pour que les deux écrans se
// lisent comme un seul produit. Portée : docs/architecture/devis-multi-lignes-v1.md.

export const TYPE_LIGNE_LABEL = {
  main_oeuvre: "Main d'œuvre",
  piece: "Pièce",
};

// Statuts d'un devis tels qu'observés dans l'application. La règle
// d'immuabilité ne dépend PAS de cette liste : voir devisStatutModifiable()
// dans calculs.js, fermée par défaut comme la fonction SQL homonyme.
export const STATUT_DEVIS_LABEL = {
  brouillon: "Brouillon",
  en_attente: "En attente",
  accepte: "Accepté",
  refuse: "Refusé",
};

// Taux proposés dans le sélecteur. La base n'impose qu'une plage [0, 100]
// (contrat D.4) : ces valeurs sont une aide à la saisie, jamais une limite —
// un taux libre reste possible.
export const TAUX_TVA_COURANTS = [20, 10, 5.5, 2.1, 0];
export const TAUX_TVA_DEFAUT = 20;
