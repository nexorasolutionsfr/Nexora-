// Retrouver une voiture — moteur de recherche local.
//
// POURQUOI CE MODULE
//
// L'unique recherche de Nexora filtrait `clients.nom`. Au comptoir, le
// garagiste a une plaque sous les yeux, pas un patronyme : il devait deviner
// le nom du client pour retrouver la voiture. Une plaque, un nom, un numéro
// de téléphone doivent mener au même endroit.
//
// CE QU'IL NE FAIT PAS
//
// Aucune requête réseau : la recherche porte sur les données déjà chargées
// par le dashboard pour le garage courant. C'est suffisant pour les premiers
// garages — quelques centaines de véhicules — et ça garde l'isolation entre
// garages là où elle est déjà prouvée, dans les policies. Au-delà de
// ~2 000 véhicules, il faudra une recherche côté base : la limite est
// documentée, pas contournée en silence.
//
// LA NORMALISATION EST LE CŒUR DU SUJET
//
// « AB-123-CD », « ab123cd » et « AB 123 CD » sont la même plaque.
// « 06 12 34 56 78 », « 06.12.34.56.78 » et « +33612345678 » sont le même
// numéro. « Ngô » se cherche en tapant « ngo ». Sans cette normalisation,
// la recherche ne trouve que ce qui a été saisi exactement comme affiché —
// c'est-à-dire presque rien.

/** Minuscules, sans accents. Pour les noms. */
export function normaliserTexte(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Ne garde que lettres et chiffres. Pour les plaques. */
export function normaliserPlaque(valeur) {
  return normaliserTexte(valeur).replace(/[^a-z0-9]/g, "");
}

/**
 * Ne garde que les chiffres, et ramène un préfixe international français à
 * sa forme nationale : +33 6 12… et 06 12… sont le même numéro.
 */
export function normaliserTelephone(valeur) {
  const chiffres = String(valeur ?? "").replace(/\D/g, "");
  if (chiffres.startsWith("33") && chiffres.length >= 11) return `0${chiffres.slice(2)}`;
  return chiffres;
}

/** Trois façons de désigner la même voiture, trois normalisations. */
function correspond(terme, { nomClient, immatriculation, telephone }) {
  const t = normaliserTexte(terme);
  if (!t) return null;

  if (nomClient && normaliserTexte(nomClient).includes(t)) return "nom";

  const plaque = normaliserPlaque(terme);
  if (plaque && immatriculation && normaliserPlaque(immatriculation).includes(plaque)) return "plaque";

  // Un terme qui contient des lettres n'est pas un numéro de téléphone.
  // Sans ce garde-fou, « ij789 » — un début de plaque — allait chercher
  // « 789 » dans tous les numéros du garage et ramenait la moitié du fichier.
  // Observé en recette le 13 septembre 2026.
  const contientDesLettres = /[a-z]/.test(t);
  const tel = normaliserTelephone(terme);
  // Deux chiffres ne désignent personne : on exige un début de numéro.
  if (!contientDesLettres && tel.length >= 3 && telephone && normaliserTelephone(telephone).includes(tel)) {
    return "telephone";
  }

  return null;
}

/**
 * Les véhicules du garage qui correspondent au terme, les plus pertinents
 * d'abord : une plaque tapée en entier passe avant un nom qui contient les
 * mêmes lettres par hasard.
 */
export function rechercherVehicules({ terme, vehicules = [], clients = [] }, limite = 8) {
  const t = String(terme ?? "").trim();
  if (t.length < 2) return [];

  const clientsParId = new Map(clients.map((c) => [c.id, c]));
  const resultats = [];

  for (const vehicule of vehicules) {
    const client = clientsParId.get(vehicule.client_id) || null;
    const champ = correspond(t, {
      nomClient: client?.nom,
      immatriculation: vehicule.immatriculation,
      telephone: client?.telephone,
    });
    if (!champ) continue;

    // Une plaque exacte est une certitude ; le reste est une piste.
    const exact =
      champ === "plaque" && normaliserPlaque(vehicule.immatriculation) === normaliserPlaque(t);
    resultats.push({ vehicule, client, champ, exact });
  }

  const poids = { plaque: 0, telephone: 1, nom: 2 };
  resultats.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (poids[a.champ] !== poids[b.champ]) return poids[a.champ] - poids[b.champ];
    return normaliserTexte(a.client?.nom).localeCompare(normaliserTexte(b.client?.nom));
  });

  return resultats.slice(0, limite);
}

/** Ce que la ligne de résultat annonce avoir reconnu. */
export function libelleCorrespondance(champ) {
  if (champ === "plaque") return "plaque";
  if (champ === "telephone") return "téléphone";
  return "client";
}

/**
 * Un véhicule sans plaque n'est pas une anomalie à masquer : il se désigne
 * par sa marque, et on le dit.
 */
export function libelleVehicule(vehicule) {
  const modele = [vehicule?.marque, vehicule?.modele].filter(Boolean).join(" ");
  if (modele && vehicule?.immatriculation) return `${modele} · ${vehicule.immatriculation}`;
  if (modele) return `${modele} · sans plaque`;
  if (vehicule?.immatriculation) return `Véhicule · ${vehicule.immatriculation}`;
  return "Véhicule sans plaque ni modèle";
}
