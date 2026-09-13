// L'atelier tel qu'on y travaille : quatre files, pas huit étapes.
//
// POURQUOI CE MODULE
//
// L'écran Atelier affichait les six étapes engagées comme six colonnes de même
// rang. Or un garagiste ne se pose pas six questions le matin, il s'en pose
// quatre, et dans cet ordre : qu'est-ce qui arrive, qu'est-ce qui avance,
// qu'est-ce qui est coincé, qu'est-ce qui peut repartir. « Diagnostic » et
// « En intervention » appellent la même réponse — laisser travailler ;
// « Attente client » et « Attente pièce » aussi — relancer quelqu'un. Les
// séparer en colonnes égales oblige à relire l'écran entier pour retrouver les
// deux voitures bloquées.
//
// CE QU'ON NE FAIT PAS
//
// Aucun second système de statuts. `rendez_vous.statut_atelier` reste la seule
// vérité en base : les groupes ci-dessous ne sont qu'une lecture, et chaque
// étape détaillée reste visible sur sa carte et modifiable telle quelle. Rien
// n'est écrit ici, rien n'est deviné.

import { estRendezVousExclu, ETAPES_ATELIER } from "./calculs.js";

export const GROUPE_A_RECEVOIR = "a_recevoir";
export const GROUPE_EN_ATELIER = "en_atelier";
export const GROUPE_EN_ATTENTE = "en_attente";
export const GROUPE_PRETES = "pretes";

/**
 * Les quatre files, dans l'ordre où la journée se lit.
 *
 * `etapes` liste les sous-statuts que la file contient — ce sont les clés de
 * `WORKSHOP_STAGES`, inchangées. `a_recevoir` est le seul groupe daté : une
 * voiture attendue n'a de sens que le jour où on l'attend. Les trois autres
 * ignorent la date, sinon une voiture entrée avant-hier disparaîtrait de
 * l'atelier sans être sortie.
 */
export const GROUPES_ATELIER = [
  {
    key: GROUPE_A_RECEVOIR,
    label: "À recevoir",
    description: "Attendues aujourd'hui, pas encore arrivées.",
    vide: "Aucune voiture attendue aujourd'hui.",
    etapes: ["a_venir"],
    duJourSeulement: true,
    accent: "#64748B",
  },
  {
    key: GROUPE_EN_ATELIER,
    label: "En atelier",
    description: "Le travail avance.",
    vide: "Aucune voiture en cours de travail.",
    etapes: ["depose", "diagnostic", "intervention"],
    duJourSeulement: false,
    accent: "#3D6BE0",
  },
  {
    key: GROUPE_EN_ATTENTE,
    label: "En attente",
    description: "Rien n'avance tant que quelqu'un n'a pas répondu ou livré.",
    vide: "Aucune voiture bloquée.",
    etapes: ["attente_client", "attente_piece"],
    duJourSeulement: false,
    accent: "#D97706",
  },
  {
    key: GROUPE_PRETES,
    label: "Prêtes",
    description: "Terminées, en attente du client.",
    vide: "Aucune voiture prête.",
    etapes: ["pret"],
    duJourSeulement: false,
    accent: "#16A34A",
  },
];

const LIBELLE_ETAPE = Object.fromEntries(
  [{ key: "a_venir", label: "À venir" }, ...ETAPES_ATELIER].map((e) => [e.key, e.label])
);

/**
 * La raison de l'attente, écrite.
 *
 * Une pastille orange dit qu'il se passe quelque chose, pas quoi. Sur les deux
 * étapes d'attente, le blocage a un nom et une suite — on les donne. Pour les
 * autres étapes, `null` : il n'y a pas de blocage à nommer.
 */
export function raisonBlocage(etape) {
  if (etape === "attente_client") return "Attente de la réponse du client";
  if (etape === "attente_piece") return "Attente de la pièce commandée";
  return null;
}

export function groupeDeLEtape(etape) {
  return GROUPES_ATELIER.find((g) => g.etapes.includes(etape || "a_venir")) || null;
}

function memeJour(valeur, maintenant, zone = "Europe/Paris") {
  if (!valeur) return false;
  const format = (d) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return false;
  return format(date) === format(maintenant);
}

/**
 * Les quatre files garnies, chacune avec le détail de ses sous-statuts.
 *
 * `sousStatuts` n'est pas décoratif : c'est ce qui permet de replier quatre
 * files sans perdre l'information des six étapes. Une file « En atelier (3) »
 * qui précise « Déposé 1 · Diagnostic 1 · En intervention 1 » en dit autant
 * que trois colonnes, sur une ligne.
 */
export function regrouperOperationnel(rendezVous = [], maintenant = new Date()) {
  const retenus = (rendezVous || []).filter((r) => !estRendezVousExclu(r));
  return GROUPES_ATELIER.map((groupe) => {
    const dedans = retenus.filter((r) => {
      const etape = r.statut_atelier || "a_venir";
      if (!groupe.etapes.includes(etape)) return false;
      return groupe.duJourSeulement ? memeJour(r.date_debut, maintenant) : true;
    });
    // Tri : l'ordre des sous-statuts dans le groupe, puis l'heure. Une voiture
    // déposée passe avant une voiture en intervention parce qu'elle attend
    // qu'on s'en occupe ; à sous-statut égal, la plus ancienne d'abord.
    dedans.sort((a, b) => {
      const ra = groupe.etapes.indexOf(a.statut_atelier || "a_venir");
      const rb = groupe.etapes.indexOf(b.statut_atelier || "a_venir");
      if (ra !== rb) return ra - rb;
      return new Date(a.date_debut) - new Date(b.date_debut);
    });
    const sousStatuts = groupe.etapes
      .map((etape) => ({ etape, label: LIBELLE_ETAPE[etape] || etape, nombre: dedans.filter((r) => (r.statut_atelier || "a_venir") === etape).length }))
      .filter((s) => s.nombre > 0);
    return { ...groupe, rendezVous: dedans, sousStatuts };
  });
}

/**
 * Ce que la carte a le droit d'écrire au sujet du temps.
 *
 * Le modèle ne porte aucune échéance de restitution : `date_debut` et
 * `date_fin` décrivent le créneau du rendez-vous, rien d'autre. Présenter ce
 * créneau comme une échéance sur une voiture entrée avant-hier serait inventer
 * une promesse. On s'en tient donc à ce qui est vrai :
 *   — une voiture attendue aujourd'hui a une heure d'arrivée ;
 *   — une voiture entrée un autre jour porte la date de son rendez-vous, dite
 *     comme telle ;
 *   — une voiture du jour dont le créneau est dépassé, on le signale.
 * `null` quand il n'y a rien d'exact à dire — et alors la carte n'affiche
 * pas de ligne vide.
 */
export function echeanceCarte(rdv, maintenant = new Date(), groupe = null) {
  if (!rdv?.date_debut) return null;
  const debut = new Date(rdv.date_debut);
  if (Number.isNaN(debut.getTime())) return null;
  const duJour = memeJour(rdv.date_debut, maintenant);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(debut);

  if (groupe === GROUPE_A_RECEVOIR) {
    return { texte: `Attendue à ${heure}`, enRetard: debut.getTime() < maintenant.getTime() };
  }
  if (duJour) {
    const fin = rdv.date_fin ? new Date(rdv.date_fin) : null;
    const depasse = fin && !Number.isNaN(fin.getTime()) && fin.getTime() < maintenant.getTime();
    return { texte: depasse ? `Créneau de ${heure} dépassé` : `Rendez-vous de ${heure}`, enRetard: Boolean(depasse) };
  }
  const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(debut);
  return { texte: `Rendez-vous du ${jour}`, enRetard: false };
}

/**
 * Les compteurs d'en-tête, calculés sur les mêmes files que l'affichage.
 *
 * Ils l'étaient auparavant sur un découpage voisin mais distinct — « Dans
 * l'atelier » comptait les voitures prêtes, que la grille en dessous ne
 * montrait pas. Un chiffre qui ne correspond à aucune liste cliquable est un
 * chiffre qu'on ne peut pas vérifier.
 */
export function compteursParGroupe(rendezVous = [], maintenant = new Date()) {
  return Object.fromEntries(regrouperOperationnel(rendezVous, maintenant).map((g) => [g.key, g.rendezVous.length]));
}
