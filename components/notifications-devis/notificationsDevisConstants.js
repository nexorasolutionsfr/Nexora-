// Notifications de devis résilientes V1 — constantes partagées.
//
// Les codes de motif sont un domaine FERMÉ, contraint côté base par
// `notifications_devis_incomplet_motif_check` (migration
// 20260903000100). Le workflow n8n n'écrit jamais de texte libre dans
// cette colonne : c'est ce qui garantit qu'aucune donnée client ne peut y
// transiter, même si le workflow était modifié par erreur. La traduction
// en français lisible est faite ici, côté interface.
//
// Toute évolution de cette liste doit être faite EN MÊME TEMPS que la
// contrainte SQL, sinon l'un des deux rejettera ce que l'autre produit.

export const MOTIFS_INCOMPLET = [
  "devis_absent",
  "client_absent",
  "vehicule_absent",
  "garage_absent",
  "donnees_incompletes",
];

export const MOTIF_LABEL = {
  devis_absent: "Devis introuvable",
  client_absent: "Fiche client introuvable",
  vehicule_absent: "Véhicule introuvable",
  garage_absent: "Fiche garage introuvable",
  donnees_incompletes: "Informations incomplètes",
};

// Ce que l'utilisateur peut faire pour débloquer, par motif. Affiché sous
// le libellé : une liste sans piste d'action ne sert à rien.
export const MOTIF_AIDE = {
  devis_absent:
    "Le devis lié à cette notification n'existe plus. Il a probablement été supprimé : abandonnez la notification.",
  client_absent:
    "Complétez la fiche client rattachée au devis, puis relancez la notification.",
  vehicule_absent:
    "Renseignez le véhicule sur le devis ou sur la fiche client, puis relancez la notification.",
  garage_absent:
    "La fiche garage rattachée au devis est introuvable. Vérifiez vos paramètres avant de relancer.",
  donnees_incompletes:
    "Une information nécessaire à l'envoi manque. Complétez le devis, puis relancez la notification.",
};

export const STATUTS_TRAITEMENT = [
  "en_attente",
  "envoye",
  "incomplet",
  "erreur",
  "abandonne",
];
