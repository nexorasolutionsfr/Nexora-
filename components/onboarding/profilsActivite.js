// Vocabulaire des profils d'activité — miroir exact de
// public.profil_activite_valide(text[]) (migration 20260909000100).
//
// Les neuf clés doivent rester identiques à celles de la fonction SQL : elles
// sont écrites telles quelles dans garages.profil_activite, où une contrainte
// CHECK les revalide. Ajouter une activité ici sans la déclarer côté base fait
// échouer la création du garage, volontairement.

export const PROFILS_ACTIVITE = [
  { cle: "mecanique", label: "Mécanique générale", exemple: "Entretien, révision, freinage, distribution" },
  { cle: "carrosserie", label: "Carrosserie et peinture", exemple: "Tôlerie, peinture, sinistres" },
  { cle: "diagnostic_electronique", label: "Diagnostic électronique", exemple: "Valise, calculateurs, électricité" },
  { cle: "pneus", label: "Pneumatiques", exemple: "Montage, équilibrage, géométrie" },
  { cle: "vente_vo", label: "Vente de véhicules", exemple: "Achat-revente, dépôt-vente" },
  { cle: "depannage", label: "Dépannage et remorquage", exemple: "Assistance, enlèvement" },
  { cle: "vehicules_anciens", label: "Véhicules anciens et de collection", exemple: "Restauration, hivernage" },
  { cle: "poids_lourds_agricole", label: "Poids lourds et agricole", exemple: "VU, PL, matériel agricole" },
  { cle: "voitures_sans_permis", label: "Voitures sans permis", exemple: "Microcar, Ligier, Aixam" },
];

export const CLES_PROFIL_ACTIVITE = PROFILS_ACTIVITE.map((p) => p.cle);
