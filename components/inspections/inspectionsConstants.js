// Contrôle véhicule digital / inspection avant intervention (V1) — constantes
// partagées entre le dashboard garage et l'écran de saisie mobile.
// Reprend les jetons visuels de components/NexoraDashboard.jsx (ACCENT, tons de Badge)
// pour rester cohérent avec le reste du produit.

export const ACCENT = "#3D6BE0";
export const ACCENT_SOFT = "#EAF0FF";
export const NAVY = "#0F1B33";

export const INSPECTION_STATUT_LABEL = {
  brouillon: "Brouillon",
  en_attente_client: "En attente client",
  consulte: "Consulté par le client",
  partiellement_valide: "Partiellement validé",
  valide: "Validé",
  refuse: "Refusé",
  finalisee_sans_decision: "Finalisée — sans décision client",
};

export const INSPECTION_TONE = {
  brouillon: "slate",
  en_attente_client: "amber",
  consulte: "amber",
  partiellement_valide: "amber",
  valide: "green",
  refuse: "red",
  finalisee_sans_decision: "slate",
};

export const CATEGORIE_LABEL = {
  exterieur: "Extérieur",
  pneus: "Pneus",
  voyants: "Voyants",
  objets: "Objets & observations",
  autre: "Autre",
};

export const CATEGORIES_ORDRE = ["exterieur", "pneus", "voyants", "objets", "autre"];

export const ETAT_POINT_LABEL = {
  ok: "OK",
  a_surveiller: "À surveiller",
  a_valider_client: "À valider avec le client",
  dommage: "Dommage constaté",
};

export const ETAT_POINT_TONE = {
  ok: "green",
  a_surveiller: "amber",
  a_valider_client: "amber",
  dommage: "red",
};

export const NIVEAU_CARBURANT_LABEL = {
  reserve: "Réserve",
  un_quart: "1/4",
  moitie: "1/2",
  trois_quarts: "3/4",
  plein: "Plein",
};

export const NIVEAU_CARBURANT_OPTIONS = Object.entries(NIVEAU_CARBURANT_LABEL).map(([value, label]) => ({ value, label }));

// Suggestions rapides par catégorie — n'importe quel libellé libre reste possible.
export const SUGGESTIONS_PAR_CATEGORIE = {
  exterieur: ["Pare-choc avant", "Pare-choc arrière", "Portière avant gauche", "Portière avant droite", "Rétroviseur gauche", "Rétroviseur droit", "Pare-brise", "Carrosserie générale"],
  pneus: ["Avant gauche", "Avant droit", "Arrière gauche", "Arrière droit", "Roue de secours"],
  voyants: ["Voyant moteur", "Voyant ABS", "Voyant airbag", "Voyant batterie", "Voyant liquide de frein", "Voyant pression pneus"],
  objets: ["Objets personnels laissés à bord", "Propreté intérieure", "Niveau liquide lave-glace", "Autre observation"],
  autre: [],
};

export const MAX_PHOTOS_PAR_POINT = 4;
export const MAX_PHOTOS_PAR_INSPECTION = 24;

export const PHOTOS_BUCKET = "inspections-photos";
