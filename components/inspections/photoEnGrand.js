// Logique pure de la vue « photo en grand » d'un constat, isolée du rendu pour
// être testable avec `node --test` (comme components/clients/vehicule.js).
// Aucune analyse de jeton ici : une photo qui ne se charge pas peut aussi bien
// venir du réseau que d'un lien arrivé à expiration, et nous ne prétendons pas
// trancher — voir MESSAGE_ERREUR_PHOTO.

export const MESSAGE_ERREUR_PHOTO =
  "Cette photo n'a pas pu être affichée. Vérifiez votre connexion, puis réessayez. Si le problème persiste, rechargez la page ou redemandez le lien à votre garage.";

/** Index de la photo suivante, en boucle. Renvoie l'index reçu si la liste est vide ou unique. */
export function indexSuivant(index, total) {
  if (!Number.isFinite(total) || total <= 1) return 0;
  return (((index + 1) % total) + total) % total;
}

/** Index de la photo précédente, en boucle. */
export function indexPrecedent(index, total) {
  if (!Number.isFinite(total) || total <= 1) return 0;
  return (((index - 1) % total) + total) % total;
}

/** Libellé lu par les lecteurs d'écran à l'ouverture de la fenêtre. */
export function libelleDialogue(titrePoint) {
  const titre = (titrePoint || "").trim();
  return titre ? `Photo du constat : ${titre}` : "Photo du constat";
}

/** « 2 / 4 » — affiché seulement quand le point porte plusieurs photos. */
export function compteurPhotos(index, total) {
  if (!Number.isFinite(total) || total <= 1) return "";
  return `${Math.min(Math.max(index, 0), total - 1) + 1} / ${total}`;
}

/** Le clavier de la fenêtre : fermeture et navigation. Renvoie l'action à exécuter, ou null. */
export function actionTouche(key, total) {
  if (key === "Escape") return "fermer";
  if (total > 1 && (key === "ArrowRight" || key === "ArrowDown")) return "suivante";
  if (total > 1 && (key === "ArrowLeft" || key === "ArrowUp")) return "precedente";
  return null;
}

/**
 * Activation de la vignette au clavier. Un <button> s'active nativement avec
 * Entrée et Espace, mais nous le déclenchons explicitement : l'activation native
 * dépend de l'action par défaut de l'événement, qui n'est pas toujours délivrée
 * (claviers logiciels, outils d'assistance, pilotage automatisé). Avec
 * preventDefault côté appelant, il n'y a jamais double ouverture.
 */
export function ouvreAuClavier(key) {
  return key === "Enter" || key === " " || key === "Spacebar";
}
