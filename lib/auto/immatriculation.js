// Plaques d'immatriculation, telles qu'un automobiliste les tape.
//
// La base ne stocke que la forme normalisée (majuscules, sans espace ni
// tiret) : c'est ce que vérifie la contrainte
// auto_vehicules_immatriculation_normalisee. L'affichage remet les tirets.

const SIV = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const FNI = /^\d{1,4}[A-Z]{1,3}(\d{2}|2A|2B|97\d)$/;
const NORMALISEE = /^[A-Z0-9]{2,12}$/;

export function normaliserImmatriculation(saisie) {
  if (typeof saisie !== "string") return null;
  const brute = saisie.toUpperCase().replace(/[\s.\-_/]/g, "");
  return brute === "" ? null : brute;
}

// « siv » (AB-123-CD, depuis 2009), « fni » (1234 AB 56, ancien système),
// « autre » (plaque étrangère ou saisie inhabituelle, acceptée), ou
// « invalide » (caractères interdits ou longueur impossible).
export function formatImmatriculation(normalisee) {
  if (!normalisee || !NORMALISEE.test(normalisee)) return "invalide";
  if (SIV.test(normalisee)) return "siv";
  if (FNI.test(normalisee)) return "fni";
  return "autre";
}

export function afficherImmatriculation(normalisee) {
  if (!normalisee) return "";
  if (SIV.test(normalisee)) {
    return `${normalisee.slice(0, 2)}-${normalisee.slice(2, 5)}-${normalisee.slice(5)}`;
  }
  const fni = normalisee.match(/^(\d{1,4})([A-Z]{1,3})(\d{2}|2A|2B|97\d)$/);
  if (fni) return `${fni[1]} ${fni[2]} ${fni[3]}`;
  return normalisee;
}
