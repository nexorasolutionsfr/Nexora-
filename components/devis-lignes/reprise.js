// Constat → devis : la logique pure de la fenêtre « Préparer le devis ».
//
// Aucun accès réseau. Ce module décide QUELS points sont proposés, lesquels
// sont cochés d'avance, quel devis est proposé comme réceptacle, et comment
// résumer ce que la base a fait. La règle métier (idempotence, refus, garage,
// verrou) vit dans `preparer_devis_depuis_constat` (migration 20260919000100) ;
// ici on prépare une proposition lisible, jamais une décision cachée.

import { ETAT_POINT_LABEL } from "../inspections/inspectionsConstants.js";

/** Un point « OK » n'est pas un constat : rien à chiffrer. */
export function estUnConstat(point) {
  return Boolean(point) && point.etat !== "ok";
}

/**
 * Où chaque constat a déjà été repris, dans les AUTRES devis du véhicule.
 *
 * Recette du 15 septembre 2026 (BB-202-BB) : le dossier proposait de préparer
 * un nouveau devis avec « Pare-chocs avant fendu » coché d'avance, alors que
 * ce même point était déjà chiffré dans le devis accepté de la visite. Un
 * second devis est né sans que rien ne le signale.
 *
 * Renvoie une `Map` point → devis qui le portent (hors devis réceptacle).
 */
export function couvertureDesPoints(devis = [], cibleId = null) {
  const couverture = new Map();
  for (const d of devis || []) {
    if (!d?.id || d.id === cibleId) continue;
    for (const ligne of d.devis_lignes || []) {
      const pointId = ligne?.inspection_point_id;
      if (!pointId) continue;
      const liste = couverture.get(pointId) || [];
      if (!liste.some((x) => x.id === d.id)) liste.push(d);
      couverture.set(pointId, liste);
    }
  }
  return couverture;
}

// Le devis le plus parlant pour un point déjà repris ailleurs : un accord du
// client d'abord, puis un devis encore modifiable, puis un refus.
const RANG_COUVERTURE = { accepte: 0, brouillon: 1, en_attente: 1, refuse: 2 };

/**
 * Les points d'un contrôle, tels que la fenêtre les propose.
 *
 *  - un point refusé par le client est visible mais décoché, avec sa raison ;
 *  - un point déjà repris DANS CE DEVIS est visible mais décoché, avec sa raison ;
 *    ces deux cas sont `bloquant` : la case ne se coche pas ;
 *  - un point déjà repris dans UN AUTRE devis du véhicule (accepté, encore
 *    modifiable, ou refusé) est décoché d'avance et le dit, avec le devis en
 *    cause — mais il reste cochable : un complément est un choix légitime,
 *    à condition d'être explicite ;
 *  - les autres sont cochés d'avance : c'est le cas courant, et décocher
 *    coûte un geste là où cocher vingt points en coûterait vingt.
 *
 * `lignesExistantes` : les lignes du devis réceptacle (vide pour un nouveau).
 * `couverture` : `couvertureDesPoints(devisDuVehicule, cible)` ; facultative.
 */
export function proposerPoints(points = [], lignesExistantes = [], couverture = null) {
  const dejaRepris = new Set(
    (lignesExistantes || []).map((l) => l?.inspection_point_id).filter(Boolean),
  );
  return (points || [])
    .filter(estUnConstat)
    .map((point) => {
      let raison = null;
      let devisLie = null;
      if (point.decision_client === "refuse") raison = "refuse";
      else if (dejaRepris.has(point.id)) raison = "deja";
      else {
        const ailleurs = [...(couverture?.get(point.id) || [])]
          .filter((d) => d.statut in RANG_COUVERTURE)
          .sort((a, b) => RANG_COUVERTURE[a.statut] - RANG_COUVERTURE[b.statut]);
        devisLie = ailleurs[0] || null;
        if (devisLie?.statut === "accepte") raison = "couvert_accepte";
        else if (devisLie?.statut === "refuse") raison = "propose_refuse";
        else if (devisLie) raison = "dans_autre_devis";
      }
      return {
        point,
        raison,
        devisLie,
        bloquant: raison === "refuse" || raison === "deja",
        coche: raison === null,
        etatLabel: ETAT_POINT_LABEL[point.etat] || point.etat,
        valide: point.decision_client === "valide",
      };
    });
}

export function libelleRaison(raison, devisLie = null) {
  const ref = devisLie ? referenceDevis(devisLie) : "";
  switch (raison) {
    case "refuse":
      return "Refusé par le client — non repris. Une révision explicite est nécessaire pour le reproposer.";
    case "deja":
      return "Déjà dans ce devis.";
    case "couvert_accepte":
      return `Déjà chiffré dans le devis accepté ${ref}. Cochez seulement pour un travail complémentaire.`;
    case "dans_autre_devis":
      return `Déjà dans le devis ${ref}, encore modifiable. Complétez plutôt ce devis-là.`;
    case "propose_refuse":
      return `Déjà proposé dans le devis refusé ${ref}. Cochez pour le reproposer.`;
    default:
      return null;
  }
}

/** Un devis de cette visite a-t-il déjà été accepté ? Le nouveau est alors un complément. */
export function visiteAUnDevisAccepte(devis = [], rdvId = null) {
  return Boolean(rdvId) && (devis || []).some((d) => d?.rendez_vous_id === rdvId && d.statut === "accepte");
}

/**
 * Quel contrôle proposer par défaut.
 *
 * Celui de la visite courante s'il n'y en a qu'un. Sinon aucun : deux
 * contrôles sur une même voiture, c'est un choix, pas une devinette.
 */
export function controleParDefaut(inspections = [], rdvId = null) {
  const liste = inspections || [];
  if (liste.length === 1) return liste[0].id;
  if (rdvId) {
    const deLaVisite = liste.filter((i) => i.rendez_vous_id === rdvId);
    if (deLaVisite.length === 1) return deLaVisite[0].id;
  }
  return null;
}

/**
 * Les devis qui peuvent recevoir la reprise, et lequel proposer.
 *
 * Exploitable = encore modifiable (brouillon / en attente) ET de la même
 * voiture. Ceux rattachés à la visite courante passent en tête ; ceux sans
 * visite restent proposés, marqués comme tels. Le choix par défaut n'est
 * « compléter » que s'il existe exactement UN devis rattaché à cette visite —
 * jamais « le plus récent ».
 */
export function proposerDevis({ devis = [], vehiculeId = null, rdvId = null } = {}) {
  const exploitables = (devis || []).filter(
    (d) => d && (d.statut === "brouillon" || d.statut === "en_attente")
      && (!vehiculeId || !d.vehicule_id || d.vehicule_id === vehiculeId),
  );
  const deLaVisite = rdvId ? exploitables.filter((d) => d.rendez_vous_id === rdvId) : [];
  const sansVisite = exploitables.filter((d) => !d.rendez_vous_id);
  const candidats = [
    ...deLaVisite.map((d) => ({ devis: d, deLaVisite: true })),
    ...sansVisite.map((d) => ({ devis: d, deLaVisite: false })),
  ];
  const parDefaut = deLaVisite.length === 1 ? deLaVisite[0].id : "nouveau";
  return { candidats, parDefaut };
}

/** Référence lisible d'un devis : la même dérivation que le dossier véhicule. */
export function referenceDevis(devis) {
  return `Réf. ${String(devis?.id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * Ce que dit l'écran après la reprise. On nomme ce qui a été fait ET ce qui
 * ne l'a pas été : un point refusé ou déjà présent est signalé, pas avalé.
 */
export function resumerReprise(resultat) {
  if (!resultat?.ok) {
    switch (resultat?.raison) {
      case "client_inconnu":
        return "Ce contrôle n'est rattaché à aucun client : rattachez-le d'abord depuis la fiche du contrôle.";
      case "devis_verrouille":
        return "Ce devis est verrouillé : préparez une révision (nouveau devis) plutôt que de le modifier.";
      case "vehicule_different":
        return "Ce devis concerne un autre véhicule.";
      case "client_different":
        return "Ce devis concerne un autre client.";
      case "rendez_vous_incoherent":
        return "Ce rendez-vous ne correspond pas au client ou au véhicule du contrôle.";
      default:
        return "La préparation n'a pas abouti. Réessayez.";
    }
  }
  const n = (resultat.lignes_creees || []).length;
  const deja = (resultat.deja_reprises || []).length;
  const refuses = (resultat.refuses || []).length;
  const phrases = [];
  if (resultat.deja_jouee) phrases.push("Cette préparation avait déjà été enregistrée : rien n'a été ajouté une seconde fois.");
  else if (n === 0) phrases.push("Aucune ligne ajoutée.");
  else phrases.push(`${n} ligne${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} au devis, à chiffrer.`);
  if (deja > 0) phrases.push(`${deja} déjà présente${deja > 1 ? "s" : ""}, non dupliquée${deja > 1 ? "s" : ""}.`);
  if (refuses > 0) phrases.push(`${refuses} refusée${refuses > 1 ? "s" : ""} par le client, laissée${refuses > 1 ? "s" : ""} de côté.`);
  return phrases.join(" ");
}
