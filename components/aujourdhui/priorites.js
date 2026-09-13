// Ce qui passe en premier, et pourquoi — l'écran Aujourd'hui.
//
// POURQUOI CE MODULE
//
// « À traiter maintenant » listait des devis dans l'ordre où la base les
// rendait. Un garagiste qui ouvre Nexora à 8 h ne veut pas une liste : il veut
// savoir par quoi commencer, et pourquoi. Un ordre qu'on ne peut pas expliquer
// n'est pas un ordre, c'est un hasard qu'on subit.
//
// CE QU'IL NE FAIT PAS
//
// Il ne calcule aucun nouvel état. `filVehicule` reste seul juge de l'état
// d'une voiture, de la prochaine action et de qui doit agir ; ce module-ci ne
// fait que classer ce qu'il a déjà dit, et nommer la raison du classement.
// Deux lectures concurrentes de la même donnée, c'est exactement ce que le fil
// unique a supprimé.

import { AGIT_GARAGE, CIBLE_ATELIER } from "../atelier/filVehicule.js";

/**
 * Les raisons d'être en tête, de la plus contraignante à la moins pressante.
 *
 * `rang` est l'ordre. `urgent` marque celles qui ne doivent JAMAIS disparaître
 * derrière la limite d'affichage : une contradiction qu'on ne voit pas se
 * propage, et un client qui attend sans le savoir attend pour rien.
 */
export const RAISONS = [
  { cle: "contradiction", rang: 0, urgent: true },
  { cle: "prete_client_pas_prevenu", rang: 1, urgent: true },
  { cle: "attendue_en_retard", rang: 2, urgent: false },
  { cle: "creneau_depasse", rang: 3, urgent: false },
  { cle: "document_a_envoyer", rang: 4, urgent: false },
  { cle: "a_vous_de_jouer", rang: 5, urgent: false },
];

const PAR_CLE = Object.fromEntries(RAISONS.map((r) => [r.cle, r]));

const heure = (valeur) => {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
};

const memeJour = (valeur, maintenant) => {
  if (!valeur) return false;
  const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const d = new Date(valeur);
  return !Number.isNaN(d.getTime()) && f(d) === f(maintenant);
};

/**
 * La raison pour laquelle cette voiture mérite d'être regardée maintenant.
 *
 * `null` quand il n'y en a aucune — la balle est au client, ou le dossier est
 * clos. Une ligne sans raison n'a rien à faire dans « À faire maintenant » :
 * c'est ce qui transformait la liste en inventaire.
 */
export function raisonDePriorite({ fil, rdv, etatEnvoiDevis = null, etatEnvoiFacture = null, clientPrevenu = null }, maintenant = new Date()) {
  if (!fil) return null;

  // Une incohérence passe avant tout : tant qu'elle est là, aucune décision
  // prise à partir de cet écran n'est fiable.
  if (fil.contradiction) {
    return { cle: "contradiction", texte: "L'atelier et l'ordre de réparation se contredisent" };
  }

  const etape = rdv?.statut_atelier || "a_venir";

  // La voiture est prête et le client ne le sait pas : il attend pour rien, et
  // la place reste occupée. `clientPrevenu` vient de `etat_envoi_atelier` —
  // on ne le devine pas. `null` = on ne sait pas encore, on ne conclut rien.
  if (etape === "pret" && clientPrevenu === false) {
    return { cle: "prete_client_pas_prevenu", texte: "Prête, et le client ne le sait pas encore" };
  }

  // Attendue, l'heure est passée : c'est le moment d'appeler, pas dans deux
  // heures. Seulement le jour même — une voiture d'avant-hier restée « à
  // venir » relève du ménage, pas de l'urgence.
  if (etape === "a_venir" && rdv?.date_debut && memeJour(rdv.date_debut, maintenant)) {
    const debut = new Date(rdv.date_debut);
    if (!Number.isNaN(debut.getTime()) && debut.getTime() < maintenant.getTime()) {
      return { cle: "attendue_en_retard", texte: `Attendue à ${heure(rdv.date_debut)}, pas encore arrivée` };
    }
  }

  // Le reste ne concerne que ce qui attend un geste DU GARAGE.
  if (fil.quiAgit !== AGIT_GARAGE) return null;

  // Les travaux devaient être finis. Le garage peut agir : prévenir, ou finir.
  if (["depose", "diagnostic", "intervention"].includes(etape) && rdv?.date_fin && memeJour(rdv.date_debut, maintenant)) {
    const fin = new Date(rdv.date_fin);
    if (!Number.isNaN(fin.getTime()) && fin.getTime() < maintenant.getTime()) {
      return { cle: "creneau_depasse", texte: `Créneau de ${heure(rdv.date_debut)} dépassé` };
    }
  }

  // Un document établi que le client n'a pas reçu ne rapporte rien.
  if (etatEnvoiDevis === "aucune" || etatEnvoiDevis === "a_valider") {
    return { cle: "document_a_envoyer", texte: "Devis établi, pas encore envoyé au client" };
  }
  if (etatEnvoiFacture === "aucune" || etatEnvoiFacture === "a_valider") {
    return { cle: "document_a_envoyer", texte: "Facture établie, pas encore envoyée au client" };
  }

  // SUIVRE L'AVANCEMENT N'EST PAS UNE DÉCISION
  //
  // Constaté sur la journée chargée du prototype : 13 voitures sur 13
  // remontaient en priorité. `filVehicule` dit « à vous de jouer » pour toute
  // voiture en cours de travail ou en attente d'une pièce — c'est juste, au
  // sens où le garage est bien le seul à pouvoir avancer. Mais ce n'est pas
  // une décision à prendre maintenant : c'est du travail en cours, et sa place
  // est dans l'Atelier. Une liste qui contient tout ne hiérarchise rien.
  //
  // Ne restent donc ici que les fils qui pointent vers un DOCUMENT ou une
  // PLANIFICATION — quelque chose qui attend un geste, pas du temps.
  if (fil.cible === CIBLE_ATELIER || fil.cible === null) return null;

  return { cle: "a_vous_de_jouer", texte: fil.prochaineAction };
}

/**
 * Les priorités, classées, avec la raison de chacune.
 *
 * L'ordre : la raison d'abord, puis l'heure du rendez-vous — à raison égale,
 * la voiture attendue le plus tôt passe devant. Rien d'autre : un tri qu'on ne
 * peut pas expliquer en une phrase ne sera pas cru.
 */
export function classerPriorites(dossiers = [], maintenant = new Date()) {
  const lignes = [];
  for (const d of dossiers) {
    const raison = raisonDePriorite(d, maintenant);
    if (!raison) continue;
    const meta = PAR_CLE[raison.cle] || { rang: 99, urgent: false };
    lignes.push({ ...d, raison: raison.texte, raisonCle: raison.cle, rang: meta.rang, urgent: meta.urgent });
  }
  lignes.sort((a, b) => {
    if (a.rang !== b.rang) return a.rang - b.rang;
    const ta = a.rdv?.date_debut ? new Date(a.rdv.date_debut).getTime() : Infinity;
    const tb = b.rdv?.date_debut ? new Date(b.rdv.date_debut).getTime() : Infinity;
    return ta - tb;
  });
  return lignes;
}

/**
 * Ce qu'on montre tout de suite, et ce qu'on garde derrière « Voir toutes ».
 *
 * LA RÈGLE QUI COMPTE : la limite est une commodité de lecture, pas un filtre.
 * Une priorité marquée urgente est TOUJOURS visible, même si elles sont huit et
 * que la limite est à quatre. Une urgence cachée derrière un bouton est une
 * urgence qu'on découvre trop tard — et c'est précisément le reproche fait à
 * l'écran actuel, qui montrait tout et donc rien.
 */
export function decouperPriorites(lignes = [], limite = 4) {
  const urgentes = lignes.filter((l) => l.urgent);
  const reste = lignes.filter((l) => !l.urgent);
  const place = Math.max(0, limite - urgentes.length);
  const visibles = [...urgentes, ...reste.slice(0, place)];
  return { visibles, total: lignes.length, masquees: Math.max(0, lignes.length - visibles.length) };
}

/**
 * Les arrivées attendues aujourd'hui, avec leur heure — qui, elle, existe.
 */
export function arriveesDuJour(dossiers = [], maintenant = new Date()) {
  return dossiers
    .filter((d) => (d.rdv?.statut_atelier || "a_venir") === "a_venir" && memeJour(d.rdv?.date_debut, maintenant))
    .map((d) => ({ ...d, heure: heure(d.rdv.date_debut), enRetard: new Date(d.rdv.date_debut).getTime() < maintenant.getTime() }))
    .sort((a, b) => new Date(a.rdv.date_debut) - new Date(b.rdv.date_debut));
}

/**
 * Les voitures prêtes — SANS heure.
 *
 * Nexora ne porte aucune heure de restitution : `date_debut` est l'heure à
 * laquelle la voiture est arrivée, pas celle à laquelle le client repassera.
 * Une « restitution planifiée » n'existe donc pas dans le modèle, et cette
 * fonction n'en invente pas. L'écran le dit en toutes lettres plutôt que
 * d'afficher une heure qui serait celle du matin.
 */
export function pretesARendre(dossiers = []) {
  return dossiers
    .filter((d) => (d.rdv?.statut_atelier || "a_venir") === "pret")
    .sort((a, b) => new Date(a.rdv?.date_debut || 0) - new Date(b.rdv?.date_debut || 0));
}
