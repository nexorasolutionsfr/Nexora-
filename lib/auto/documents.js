// Documents d'une voiture : ce qui est accepté, où le fichier est rangé.
//
// Mêmes règles que la base (auto_documents) et le compartiment privé
// auto-documents : 10 Mo au plus, PDF ou photo, sous
// `<propriétaire>/<voiture>/<fichier>`.

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
export const COMPARTIMENT = "auto-documents";
export const DUREE_LIEN_SECONDES = 300;

export const TYPES_DOCUMENT = [
  { valeur: "facture", libelle: "Facture" },
  { valeur: "proces_verbal_ct", libelle: "Procès-verbal de contrôle technique" },
  { valeur: "carnet_entretien", libelle: "Carnet d'entretien" },
  { valeur: "carte_grise", libelle: "Carte grise" },
  { valeur: "assurance", libelle: "Assurance" },
  { valeur: "autre", libelle: "Autre document" },
];

const EXTENSIONS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// Certains téléphones ne donnent pas le type d'une photo HEIC : on le déduit
// de l'extension, jamais d'autre chose.
export function typeMimeDe(fichier) {
  const type = (fichier?.type || "").toLowerCase();
  if (EXTENSIONS[type]) return type;
  const extension = (fichier?.name || "").toLowerCase().split(".").pop();
  const parExtension = Object.entries(EXTENSIONS).find(([, ext]) => ext === extension || (extension === "jpeg" && ext === "jpg"));
  return parExtension ? parExtension[0] : null;
}

// Rend { valide, erreur?, typeMime? }.
export function verifierFichier(fichier) {
  if (!fichier) return { valide: false, erreur: "Choisissez un fichier." };
  const typeMime = typeMimeDe(fichier);
  if (!typeMime) return { valide: false, erreur: "Format non accepté : PDF, JPEG, PNG, WebP ou HEIC." };
  if (!Number.isFinite(fichier.size) || fichier.size <= 0) return { valide: false, erreur: "Ce fichier est vide." };
  if (fichier.size > TAILLE_MAX_OCTETS) return { valide: false, erreur: "Fichier trop lourd : 10 Mo au plus." };
  return { valide: true, typeMime };
}

// Le chemin dans le compartiment. `identifiant` est fourni par l'appelant
// (nouvelIdentifiant() à l'écran, lib/auto/identifiants.js) pour rester testable.
export function cheminDocument({ proprietaireId, vehiculeId, identifiant, typeMime }) {
  return `${proprietaireId}/${vehiculeId}/${identifiant}.${EXTENSIONS[typeMime]}`;
}

// Un nom de fichier lisible et borné, tel qu'enregistré en base.
export function nomAffichable(nom) {
  const propre = String(nom || "document").replace(/\p{Cc}/gu, "").trim() || "document";
  return propre.length > 200 ? `${propre.slice(0, 190)}…${propre.slice(-8)}` : propre;
}

export function tailleLisible(octets) {
  if (!Number.isFinite(octets)) return "";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
