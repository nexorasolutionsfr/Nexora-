// Ce que l'écran dit quand l'enregistrement d'un véhicule échoue.
//
// POURQUOI CE MODULE
//
// « Impossible de créer le véhicule » ne dit ni ce qui s'est passé ni quoi
// faire. Dans le cas de loin le plus fréquent — la voiture est déjà dans le
// fichier du garage — la base sait exactement quoi répondre, et depuis la
// migration 20260918000100 elle le formule en français :
//
//   « Ce garage a déjà un véhicule immatriculé AB-123-CD. Ouvrez sa fiche au
//     lieu d'en créer une seconde. »
//
// On la laisse parler plutôt que de la recouvrir d'un message générique. Le
// message vient d'un `raise exception` de notre propre trigger, pas d'une
// saisie : le reprendre tel quel n'expose rien qui ne soit déjà au garage.
//
// POUR TOUT LE RESTE, ON NE DEVINE PAS
//
// Une panne réseau, un droit refusé, une contrainte à laquelle on n'a pas
// pensé : on retombe sur un message neutre. Inventer une cause plausible
// enverrait le garagiste chercher au mauvais endroit.

/** Le doublon de plaque, tel que le trigger le signale. */
export const CODE_DOUBLON = "23505";

export const MESSAGE_GENERIQUE = "Impossible d'enregistrer le véhicule. Réessayez dans un instant.";

/**
 * Vrai si l'erreur est le doublon de plaque dans le garage courant.
 *
 * On exige le code ET la forme du message. Le code seul couvre d'autres
 * contraintes d'unicité qui pourraient apparaître plus tard et dont le texte
 * ne serait pas destiné au comptoir.
 */
export function estDoublonDePlaque(erreur) {
  if (!erreur) return false;
  if (erreur.code !== CODE_DOUBLON) return false;
  return /vehicule immatricule/i.test(String(erreur.message || ""));
}

/** Le message à afficher, à partir de l'erreur remontée par la base. */
export function messageErreurVehicule(erreur) {
  if (estDoublonDePlaque(erreur)) return String(erreur.message).trim();
  return MESSAGE_GENERIQUE;
}
