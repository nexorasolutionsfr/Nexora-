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

// Le format RÉEL d'un fichier, d'après ses premiers octets : le nom et le
// type annoncés ne suffisent pas (un fichier renommé en .pdf, un
// téléchargement interrompu, une page d'erreur enregistrée comme facture).
// Rend le type accepté reconnu, ou null.
export const OCTETS_A_LIRE = 1024;

const HEIF = new Set(["image/heic", "image/heif"]);
const MARQUES_HEIC = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const MARQUES_HEIF = new Set(["mif1", "msf1"]);

const ascii = (octets, debut, fin) => String.fromCharCode(...octets.subarray(debut, fin));

export function formatReel(octets) {
  if (!(octets instanceof Uint8Array) || octets.length < 12) return null;
  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((o, i) => octets[i] === o)) return "image/png";
  if (ascii(octets, 0, 4) === "RIFF" && ascii(octets, 8, 12) === "WEBP") return "image/webp";
  if (ascii(octets, 4, 8) === "ftyp") {
    const marque = ascii(octets, 8, 12);
    if (MARQUES_HEIC.has(marque)) return "image/heic";
    if (MARQUES_HEIF.has(marque)) return "image/heif";
  }
  // Un PDF peut être précédé de quelques octets parasites (tolérés par les lecteurs).
  if (/%PDF-\d\.\d/.test(ascii(octets, 0, Math.min(octets.length, OCTETS_A_LIRE)))) return "application/pdf";
  return null;
}

// Le contenu confirme-t-il un format accepté ? Rend { valide, typeMime?, erreur? }.
// Une photo mal nommée (un PNG appelé .jpg) garde son vrai format.
export function verifierContenu(octets, typeMimeAnnonce) {
  const reel = formatReel(octets);
  if (!reel) {
    return { valide: false, erreur: "Ce fichier n'est ni un PDF ni une photo lisible. Il est peut-être abîmé ou incomplet : ouvrez-le pour vérifier, puis réessayez." };
  }
  if (HEIF.has(reel) && HEIF.has(typeMimeAnnonce)) return { valide: true, typeMime: typeMimeAnnonce };
  return { valide: true, typeMime: reel };
}

// Nom, taille, puis contenu. À l'écran, avant tout envoi.
export async function verifierFichierComplet(fichier) {
  const premiere = verifierFichier(fichier);
  if (!premiere.valide) return premiere;
  let octets;
  try {
    octets = new Uint8Array(await fichier.slice(0, OCTETS_A_LIRE).arrayBuffer());
  } catch {
    return { valide: false, erreur: "Ce fichier n'a pas pu être lu sur votre appareil. Réessayez." };
  }
  return verifierContenu(octets, premiere.typeMime);
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

// Ce qu'on annonce avant le dépôt, calculé sur les limites réelles plutôt
// qu'écrit à la main. Deux limites vivaient côte à côte sans se parler : le
// dépôt accepte 10 Mo, la lecture automatique s'arrête à 5 Mo — et on ne
// l'apprenait qu'APRÈS avoir envoyé le fichier (constat du 18 sept. 2026).
export function phraseLimites({ lisibles = [], tailleLectureMax = null, pagesMax = null } = {}) {
  const mo = (octets) => `${Math.round((octets / (1024 * 1024)) * 10) / 10} Mo`;
  const depot = `PDF ou photo, ${mo(TAILLE_MAX_OCTETS)} au plus. Le fichier reste privé.`;
  if (!lisibles.includes("application/pdf") || !tailleLectureMax) return depot;
  const pages = pagesMax ? `, ${pagesMax} pages au plus` : "";
  return `${depot} Nexora lit les PDF de moins de ${mo(tailleLectureMax)}${pages} ; au-delà, le document est conservé et vous renseignez les informations.`;
}
