// « À traiter » — une seule liste, deux moteurs existants, aucun troisième.
//
// POURQUOI CE FICHIER
//
// Aujourd'hui portait deux listes de priorités : celle des interventions
// (`classerPriorites`) et celle du Cockpit (`deriveOpportunites`). Elles
// lisaient les mêmes données sans se connaître : un devis accepté pouvait
// apparaître trois fois, une inspection deux. Le garagiste ne comparait plus
// des voitures, il comparait des blocs.
//
// CE QUE CE MODULE NE FAIT PAS
//
// Il ne décide de rien. Il ne sait pas quand une relance est due, ni ce qu'est
// une voiture prête, ni quand un devis devient urgent. Les deux moteurs le
// savent déjà, chacun pour son domaine, et le journal `opportunites_actions`
// garde le traité/reporté. Ce module fusionne, dédoublonne, ordonne.
//
// La correspondance complète — source, identité, condition, destination, règle
// de report — est dans `docs/architecture/aujourdhui-a-traiter.md`. Toute
// modification ici doit s'y retrouver.

import {
  CIBLE_DEVIS,
  CIBLE_DEVIS_SANS_INTERVENTION,
  CIBLE_ORDRE,
} from "../atelier/filVehicule.js";

/**
 * Rang des sections du Cockpit sur l'échelle des priorités d'intervention
 * (0 = le plus contraignant, 7 = le moins pressé). Aucun seuil n'est inventé :
 * on place les sections existantes entre les raisons existantes.
 *
 *   0 contradiction · 1 notification bloquée · 2 non envoyée · 3 incertaine
 *   4 attendue en retard · 5 créneau dépassé · 6 document à envoyer
 *   7 à vous de jouer
 */
export const RANG_SECTION = {
  maintenant: 1,
  aujourdhui: 6,
  a_planifier: 9,
};

/**
 * Ce qui identifie une ligne, de façon stable.
 *
 * Pour le Cockpit, c'est déjà `sourceType:sourceId`. Pour une intervention,
 * c'est le rendez-vous ET la raison : deux gestes différents sur le même
 * rendez-vous sont deux tâches. Un document relancé est identifié par le
 * document, parce qu'un même devis est rattaché à plusieurs rendez-vous.
 */
export function cleDeLigne(l) {
  if (l.origine === "cockpit") return l.cle;
  if (l.raisonCle === "document_a_envoyer") {
    const doc = l.facture?.id || l.devis?.id;
    if (doc) return `doc:${doc}`;
  }
  return `rdv:${l.rdv?.id || l.id}|${l.raisonCle}`;
}

/**
 * Le devis DONT CETTE LIGNE PARLE — pas celui que sa voiture porte.
 *
 * PARTAGER UN IDENTIFIANT N'EST PAS ÊTRE LE MÊME GESTE
 *
 * Première version : on prenait `l.devis?.id` de TOUTE priorité. Or `dossiers`
 * rattache à chaque rendez-vous n'importe quel devis non refusé du véhicule.
 * Une ligne « Travaux prévus jusqu'à 10:30, dépassés » portait donc l'id d'un
 * devis accepté — et faisait disparaître la ligne « Devis accepté par … » du
 * Cockpit. Deux gestes différents, une seule ligne affichée : la réponse du
 * client était perdue.
 *
 * Ne comptent donc que les raisons qui parlent VRAIMENT du devis :
 *
 *   · `document_a_envoyer` sur un devis — le document attend d'être envoyé ;
 *   · `a_vous_de_jouer` quand le fil pointe le devis lui-même ou l'ordre à
 *     ouvrir depuis un devis accepté.
 *
 * Tout le reste — créneau dépassé, arrivée en retard, message de
 * disponibilité, contradiction — garde sa ligne ET laisse celle du Cockpit.
 */
const CIBLES_DEVIS = [CIBLE_DEVIS, CIBLE_DEVIS_SANS_INTERVENTION, CIBLE_ORDRE];

function devisConcerne(l) {
  if (l.origine === "cockpit") return null;
  const id = l.devis?.id;
  if (!id) return null;
  if (l.raisonCle === "document_a_envoyer") return l.facture?.id ? null : id;
  if (l.raisonCle === "a_vous_de_jouer" && CIBLES_DEVIS.includes(l.fil?.cible)) return id;
  return null;
}

/** Normalise une opportunité du Cockpit en ligne de la liste unique. */
function depuisCockpit(o) {
  return {
    ...o,
    // `deriveOpportunites` nomme son identité `key` ; la liste unique parle de
    // `cle`. Sans cette ligne, toutes les opportunités partageaient la même
    // clé « undefined » et le dédoublonnage n'en gardait qu'une — une demande
    // et une inspection devenaient une seule tâche. Trouvé par le test.
    cle: o.key,
    origine: "cockpit",
    rang: RANG_SECTION[o.section] ?? RANG_SECTION.a_planifier,
    urgent: Boolean(o.urgent),
    titre: o.titre,
    probleme: o.meta || null,
    actionLibelle: o.action,
  };
}

/** Normalise une priorité d'intervention en ligne de la liste unique. */
function depuisIntervention(l, nommer, action) {
  const { titre, sous } = nommer(l);
  return {
    ...l,
    origine: "intervention",
    cle: cleDeLigne({ ...l, origine: "intervention" }),
    rang: l.rang,
    urgent: Boolean(l.urgent),
    titre,
    sujet: sous,
    probleme: l.raison,
    actionLibelle: action(l),
  };
}

/**
 * La liste unique.
 *
 * @param opportunites sortie de `deriveOpportunites` (sections + masquees)
 * @param priorites    sortie de `classerPriorites`
 * @param nommer       (ligne) => { titre, sous } — le nommage véhicule existant
 * @param action       (ligne) => string — le libellé d'action existant
 */
export function construireATraiter({ opportunites = null, priorites = [], nommer, action, resoudreVehicule = null } = {}) {
  const lignes = [];

  for (const l of priorites) lignes.push(depuisIntervention(l, nommer, action));

  // Les deux fusions inter-moteurs : un devis dont une intervention porte DÉJÀ
  // le geste ne revient pas une seconde fois par le Cockpit.
  const porteusesParDevis = new Map();
  for (const l of lignes) {
    const id = devisConcerne(l);
    if (id && !porteusesParDevis.has(id)) porteusesParDevis.set(id, l);
  }

  const sections = opportunites?.sections || {};
  for (const nom of Object.keys(sections)) {
    for (const o of sections[nom] || []) {
      const porteuse = (o.sourceType === "devis" || o.sourceType === "reponse_devis")
        ? porteusesParDevis.get(o.sourceId)
        : null;
      if (porteuse) {
        // FUSION LÉGITIME : on garde la ligne d'intervention — elle nomme la
        // voiture et ouvre le dossier — mais on n'avale pas ce qu'elle
        // apportait. On reprend son détail, et surtout son identité de source,
        // sans laquelle « Marquer traité » et « Reporter » disparaîtraient
        // pour ce devis.
        porteuse.sourceType = porteuse.sourceType || o.sourceType;
        porteuse.sourceId = porteuse.sourceId || o.sourceId;
        porteuse.fusionne = [...(porteuse.fusionne || []), o.key];
        if (o.meta && !porteuse.precision) porteuse.precision = o.meta;
        continue;
      }
      // Le véhicule quand il existe — jamais inventé. Une demande de
      // rendez-vous n'en a pas encore : elle reste nommée par son client.
      const v = resoudreVehicule ? resoudreVehicule(o) : null;
      lignes.push(depuisCockpit({
        ...o,
        section: o.section || nom,
        vehiculeId: v?.id || null,
        meta: v?.libelle ? [v.libelle, o.meta].filter(Boolean).join(" · ") : o.meta,
      }));
    }
  }

  // Dédoublonnage final sur l'identité stable. Il ne devrait plus rien trouver
  // après les fusions ci-dessus : c'est un garde-fou, pas une règle.
  const vues = new Set();
  const retenues = lignes.filter((l) => {
    const c = cleDeLigne(l);
    if (vues.has(c)) return false;
    vues.add(c);
    return true;
  });

  retenues.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.rang !== b.rang) return a.rang - b.rang;
    const ta = a.rdv?.date_debut ? new Date(a.rdv.date_debut).getTime() : Infinity;
    const tb = b.rdv?.date_debut ? new Date(b.rdv.date_debut).getTime() : Infinity;
    return ta - tb;
  });

  // DEUX LIGNES JUMELLES RESTENT DISTINGUABLES
  // Deux interventions à facturer sur la même voiture portent le même libellé.
  // Ce sont deux tâches ; la date de leur visite les sépare.
  const parLibelle = new Map();
  for (const l of retenues) {
    if (l.origine !== "intervention") continue;
    const k = `${l.rdv?.vehicule_id || l.id}|${l.probleme}`;
    parLibelle.set(k, (parLibelle.get(k) || 0) + 1);
  }
  return retenues.map((l) => {
    if (l.origine !== "intervention") return l;
    const k = `${l.rdv?.vehicule_id || l.id}|${l.probleme}`;
    if ((parLibelle.get(k) || 0) < 2) return l;
    return { ...l, precision: precisionDeVisite(l) };
  });
}

function precisionDeVisite(l) {
  const quand = l.rdv?.date_debut;
  if (!quand) return null;
  const d = new Date(quand);
  if (Number.isNaN(d.getTime())) return null;
  return `Visite du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

/**
 * Ce que le compteur annonce : les lignes de la liste, après fusion.
 *
 * Une source fusionnée compte pour une. Et on distingue les actions des
 * voitures : « 11 actions » ne veut pas dire onze voitures.
 */
export function compterATraiter(lignes = []) {
  const vehicules = new Set();
  for (const l of lignes) {
    const v = l.rdv?.vehicule_id;
    if (v) vehicules.add(v);
  }
  return {
    actions: lignes.length,
    urgentes: lignes.filter((l) => l.urgent).length,
    vehicules: vehicules.size,
    sansVehicule: lignes.filter((l) => !l.rdv?.vehicule_id).length,
  };
}

/**
 * La liste courte, et ce qu'elle cache.
 *
 * Les urgentes ne passent jamais sous la limite : une tâche qu'on ne voit pas
 * est une tâche qu'on ne fait pas.
 */
export function decouper(lignes = [], limite = 6) {
  const urgentes = lignes.filter((l) => l.urgent);
  const reste = lignes.filter((l) => !l.urgent);
  const place = Math.max(0, limite - urgentes.length);
  const visibles = [...urgentes, ...reste.slice(0, place)];
  return { visibles, total: lignes.length, masquees: Math.max(0, lignes.length - visibles.length) };
}
