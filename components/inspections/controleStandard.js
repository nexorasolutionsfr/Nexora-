// Le contrôle standard : la liste qui existe déjà quand le mécanicien arrive.
//
// CE QU'ON CORRIGE
//
// La saisie partait d'une page vide. Pour chaque élément, il fallait le créer
// (une frappe ou un choix dans les suggestions), puis choisir son état parmi
// quatre, puis passer à la catégorie suivante — sept écrans au total. Un
// contrôle de vingt points demandait plus de quarante gestes, debout, à côté
// d'une voiture. C'est plus long que de le noter sur une feuille, donc ça ne
// se fait pas.
//
// LA RÈGLE INVERSÉE
//
// Un contrôle, dans la vraie vie, est presque entièrement « rien à signaler ».
// C'est l'exception qui a de la valeur, pas la conformité. La liste est donc
// posée d'un coup, tout au vert, et le mécanicien ne touche QUE ce qui cloche.
// Vingt points deviennent trois gestes.
//
// CE QUE ÇA N'EST PAS
//
// Ce n'est pas un contrôle technique, ni une liste réglementaire. C'est le
// tour du véhicule qu'un garage fait déjà de tête. Chaque point reste
// supprimable et n'importe quel libellé libre reste ajoutable : la liste est
// un point de départ, jamais une contrainte.

import { SUGGESTIONS_PAR_CATEGORIE } from "./inspectionsConstants.js";

/**
 * Les points posés par « Démarrer le contrôle standard ».
 *
 * L'ordre compte : c'est celui du tour de la voiture. On fait le tour de la
 * carrosserie, on regarde les pneus, on s'assoit au volant pour les voyants,
 * on note ce qui traîne dans l'habitacle. Un ordre qui suit le geste évite les
 * allers-retours.
 */
// Les points sont TIRÉS des suggestions existantes, jamais réécrits.
//
// Une première version les avait recopiés à la main : « Pare-chocs avant »
// contre « Pare-choc avant » dans les suggestions. Résultat, la puce
// d'ajout rapide proposait encore un point déjà posé, et deux libellés
// presque identiques cohabitaient dans le même contrôle. Une liste écrite à
// deux endroits diverge toujours ; celle-ci n'existe qu'une fois.
const RETENUS = {
  exterieur: null, // toutes
  pneus: ["Avant gauche", "Avant droit", "Arrière gauche", "Arrière droit"],
  voyants: null, // tous
  objets: ["Objets personnels laissés à bord", "Propreté intérieure"],
};

/**
 * Les points posés par « Démarrer le contrôle standard ».
 *
 * L'ordre est celui du tour de la voiture : la carrosserie, les pneus, les
 * voyants une fois au volant, puis l'habitacle. Un ordre qui suit le geste
 * évite les allers-retours autour du véhicule.
 *
 * La roue de secours en est absente à dessein : beaucoup de véhicules récents
 * n'en ont plus, et un point « sans objet » dans chaque contrôle est du bruit.
 * Elle reste à une puce de distance pour qui en a besoin.
 */
export const CONTROLE_STANDARD = ["exterieur", "pneus", "voyants", "objets"].flatMap(
  (categorie) => {
    const toutes = SUGGESTIONS_PAR_CATEGORIE[categorie] || [];
    const garder = RETENUS[categorie];
    const libelles = garder === null ? toutes : toutes.filter((l) => garder.includes(l));
    return libelles.map((libelle) => ({ categorie, libelle }));
  },
);

/** L'état neutre. Tout part au vert, l'exception se signale. */
export const ETAT_PAR_DEFAUT = "ok";

/** Les états qui méritent l'attention du garagiste — et celle du client. */
export const ETATS_A_SIGNALER = ["a_surveiller", "a_valider_client", "dommage"];

/**
 * Les lignes à insérer pour un contrôle standard, en écartant ce qui existe
 * déjà. Relancer l'action sur une inspection entamée ne crée donc pas de
 * doublons — elle complète.
 *
 * La comparaison ignore la casse et les espaces de bord : « Pare-brise » et
 * « pare-brise  » sont le même point pour un humain, et le doublon se verrait.
 */
export function pointsAInserer(pointsExistants = [], modele = CONTROLE_STANDARD) {
  const clef = (categorie, libelle) => `${categorie}::${String(libelle).trim().toLowerCase()}`;
  const deja = new Set(pointsExistants.map((p) => clef(p.categorie, p.libelle || "")));
  return modele
    .filter((p) => !deja.has(clef(p.categorie, p.libelle)))
    .map((p) => ({ ...p, etat: ETAT_PAR_DEFAUT }));
}

/** Combien de points d'une catégorie demandent une attention. */
export function compterASignaler(points, categorie = null) {
  return points.filter(
    (p) => (categorie === null || p.categorie === categorie) && ETATS_A_SIGNALER.includes(p.etat),
  ).length;
}

/**
 * Le résumé d'un contrôle, tel qu'on le dirait à voix haute.
 * C'est ce qui doit apparaître avant la liste : le garagiste veut savoir s'il
 * y a quelque chose, pas relire dix-huit lignes conformes.
 */
export function resumeControle(points) {
  const total = points.length;
  const aSignaler = compterASignaler(points);
  const soumis = points.filter((p) => p.soumis_client).length;
  return { total, aSignaler, conformes: total - aSignaler, soumis };
}
