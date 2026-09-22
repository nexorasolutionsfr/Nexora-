// Les services, rangés par besoin plutôt que par vocabulaire de garage.
//
// Personne ne se réveille en pensant « géométrie » ou « detailing ». On pense
// « ma voiture fait un bruit » ou « il faut que je prépare le contrôle ». Ces
// entrées ne remplacent pas le catalogue : elles y mènent.
//
// Pur et testé (besoins.test.js). Aucun prix, aucun professionnel, aucun
// créneau : rien qui n'existe pas encore.

// Une seule liste, et c'est celle-ci. Les « intentions » du chantier du
// 22 septembre n'ont pas produit une deuxième énumération concurrente : elles
// ont rejoint celle qui existait, parce que deux listes de ce que veut un
// conducteur auraient fatalement divergé.
//
// Trois attributs disent ce qui se passe au clic, et ils s'excluent :
// - `guide`       : un parcours de questions existe (« J'ai un problème ») ;
// - `preparation` : l'écran produit un résumé à emporter (lib/auto/preparation.js) ;
// - `fiche`       : la réponse est déjà affichée ailleurs, on y mène.
// Sans aucun des trois, le besoin rassemble simplement des prestations.
export const BESOINS = [
  {
    code: "entretenir",
    titre: "Comprendre l'entretien de ma voiture",
    resume: "Ce qui est suivi, ce qui ne l'est pas, et comment le savoir.",
    preparation: true,
    services: ["revision", "vidange", "freinage", "batterie", "climatisation"],
  },
  {
    code: "rendez_vous",
    titre: "Préparer un rendez-vous",
    resume: "Partir chez un professionnel avec sa voiture résumée et les bonnes questions.",
    preparation: true,
    services: ["revision", "diagnostic", "controle_technique"],
  },
  {
    code: "probleme",
    titre: "Décrire un problème",
    resume: "Un bruit, un voyant, une fuite : mettez des mots dessus.",
    guide: true,
    services: ["diagnostic", "assistance_panne"],
  },
  {
    code: "informations",
    titre: "Retrouver ce que Nexora sait déjà",
    resume: "Rappels publiés, classe Crit'Air, entretien du constructeur.",
    fiche: "connaissance",
    services: [],
  },
  {
    code: "controle_technique",
    titre: "Préparer mon contrôle technique",
    resume: "Ce que le contrôle vérifie, et ce qui se prépare avant.",
    services: ["controle_technique", "freinage", "pneus_remplacement"],
  },
  {
    code: "nettoyer",
    titre: "Nettoyer ma voiture",
    resume: "Lavage complet ou remise en état.",
    services: ["lavage_complet", "detailing"],
  },
];

export function besoinParCode(code) {
  return BESOINS.find((b) => b.code === code) ?? null;
}

// ---------------------------------------------------------------------------
// « J'ai un problème » : mettre des mots, pas un diagnostic
// ---------------------------------------------------------------------------
//
// Ce parcours aide à FORMULER. Il ne conclut jamais à une pièce, ni à une
// cause. Le seul lien fait avec une prestation est celui que la prestation
// revendique elle-même : chercher l'origine d'un symptôme, c'est la définition
// du diagnostic ; ne plus pouvoir rouler, c'est l'assistance.

export const CONSTATS = [
  { code: "bruit", libelle: "Un bruit inhabituel", sujet: "un bruit inhabituel" },
  { code: "voyant", libelle: "Un voyant allumé au tableau de bord", sujet: "un voyant allumé au tableau de bord" },
  { code: "demarrage", libelle: "La voiture démarre mal, ou plus du tout", sujet: "un problème de démarrage", immobilise: true },
  { code: "freinage", libelle: "Quelque chose a changé au freinage", sujet: "un changement au freinage", securite: true },
  { code: "tenue", libelle: "La voiture tire, vibre ou tient mal la route", sujet: "une voiture qui tire, vibre ou tient mal la route", securite: true },
  { code: "fuite", libelle: "Une fuite, une tache sous la voiture", sujet: "une tache sous la voiture" },
  { code: "odeur", libelle: "Une odeur ou de la fumée", sujet: "une odeur ou de la fumée", immobilise: true, securite: true },
  { code: "autre", libelle: "Autre chose", sujet: "quelque chose d'inhabituel" },
];

export const DEPUIS = [
  { code: "aujourdhui", libelle: "Aujourd'hui", suite: "constaté aujourd'hui" },
  { code: "quelques_jours", libelle: "Depuis quelques jours", suite: "depuis quelques jours" },
  { code: "quelques_semaines", libelle: "Depuis quelques semaines", suite: "depuis quelques semaines" },
  { code: "longtemps", libelle: "Depuis longtemps", suite: "depuis longtemps" },
];

// La deuxième question dépend du constat.
//
// « À quel moment ? — tout le temps / à froid / en roulant / en freinant / en
// tournant » était posée à l'identique après « un voyant allumé » comme après
// « une fuite » : très générale, et elle produisait des phrases qui se
// répétaient (constat du 18 sept. 2026).
//
// Chaque réponse porte le SUJET complet de la phrase, pas un fragment à
// recoller. Toutes décrivent ce qui se voit, s'entend ou se sent : aucune ne
// nomme une pièce ni une cause — ce serait un diagnostic, et Nexora n'en fait
// pas.
export const PRECISIONS = {
  bruit: {
    question: "Quand l'entendez-vous ?",
    options: [
      { code: "demarrage", libelle: "Au démarrage", sujet: "un bruit inhabituel au démarrage" },
      { code: "roulant", libelle: "En roulant", sujet: "un bruit inhabituel en roulant" },
      { code: "freinant", libelle: "En freinant", sujet: "un bruit inhabituel au freinage" },
      { code: "tournant", libelle: "En tournant", sujet: "un bruit inhabituel en tournant" },
      { code: "toujours", libelle: "Tout le temps", sujet: "un bruit inhabituel, tout le temps" },
    ],
  },
  voyant: {
    question: "À quoi ressemble-t-il ?",
    options: [
      { code: "rouge", libelle: "Rouge", sujet: "un voyant rouge allumé au tableau de bord", securite: true },
      { code: "orange", libelle: "Orange ou jaune", sujet: "un voyant orange allumé au tableau de bord" },
      { code: "clignote", libelle: "Il clignote", sujet: "un voyant qui clignote au tableau de bord", securite: true },
      { code: "intermittent", libelle: "Il s'allume puis s'éteint", sujet: "un voyant qui s'allume puis s'éteint" },
      { code: "inconnu", libelle: "Je ne sais pas dire", sujet: "un voyant allumé au tableau de bord" },
    ],
  },
  demarrage: {
    question: "Que se passe-t-il quand vous tournez la clé ?",
    options: [
      { code: "rien", libelle: "Rien du tout", sujet: "un moteur qui ne tourne pas du tout au démarrage" },
      { code: "tourne", libelle: "Le moteur tourne mais ne démarre pas", sujet: "un moteur qui tourne sans démarrer" },
      { code: "essais", libelle: "Il démarre après plusieurs essais", sujet: "un démarrage qui demande plusieurs essais" },
      { code: "claquement", libelle: "Un bruit de claquement", sujet: "un claquement au démarrage" },
      { code: "inconnu", libelle: "Je ne sais pas dire", sujet: "un problème de démarrage" },
    ],
  },
  freinage: {
    question: "Qu'est-ce qui a changé ?",
    options: [
      { code: "pedale", libelle: "La pédale s'enfonce plus qu'avant", sujet: "une pédale de frein qui s'enfonce plus qu'avant" },
      { code: "bruit", libelle: "Un bruit au freinage", sujet: "un bruit au freinage" },
      { code: "tire", libelle: "La voiture tire d'un côté", sujet: "une voiture qui tire d'un côté au freinage" },
      { code: "vibrations", libelle: "Des vibrations dans la pédale", sujet: "des vibrations dans la pédale de frein" },
      { code: "distance", libelle: "La distance d'arrêt s'allonge", sujet: "une distance d'arrêt qui s'allonge" },
    ],
  },
  tenue: {
    question: "À quel moment ?",
    options: [
      { code: "toujours", libelle: "Tout le temps", sujet: "une voiture qui tire, vibre ou tient mal la route, tout le temps" },
      { code: "vitesse", libelle: "À vitesse élevée", sujet: "des vibrations à vitesse élevée" },
      { code: "freinant", libelle: "En freinant", sujet: "une voiture qui tire ou vibre au freinage" },
      { code: "tournant", libelle: "En tournant", sujet: "une voiture qui tire ou vibre en tournant" },
      { code: "route", libelle: "Sur route dégradée", sujet: "une voiture qui tient mal la route sur chaussée dégradée" },
    ],
  },
  fuite: {
    question: "De quelle couleur est la tache ?",
    options: [
      { code: "transparente", libelle: "Transparente", sujet: "une tache transparente sous la voiture" },
      { code: "noire", libelle: "Noire ou brune", sujet: "une tache noire ou brune sous la voiture" },
      { code: "rouge", libelle: "Rouge ou rose", sujet: "une tache rouge ou rose sous la voiture" },
      { code: "verte", libelle: "Verte ou jaune", sujet: "une tache verte ou jaune sous la voiture" },
      { code: "inconnue", libelle: "Je n'ai pas regardé", sujet: "une tache sous la voiture" },
    ],
  },
  odeur: {
    question: "Qu'est-ce que vous sentez ou voyez ?",
    options: [
      { code: "brule", libelle: "Une odeur de brûlé", sujet: "une odeur de brûlé" },
      { code: "carburant", libelle: "Une odeur d'essence ou de gazole", sujet: "une odeur d'essence ou de gazole" },
      { code: "sucree", libelle: "Une odeur sucrée", sujet: "une odeur sucrée" },
      { code: "fumee_blanche", libelle: "De la fumée blanche", sujet: "de la fumée blanche" },
      { code: "fumee_noire", libelle: "De la fumée noire", sujet: "de la fumée noire" },
    ],
  },
  autre: {
    question: "À quel moment ?",
    options: [
      { code: "toujours", libelle: "Tout le temps", sujet: "quelque chose d'inhabituel, tout le temps" },
      { code: "froid", libelle: "À froid, au démarrage", sujet: "quelque chose d'inhabituel à froid, au démarrage" },
      { code: "roulant", libelle: "En roulant", sujet: "quelque chose d'inhabituel en roulant" },
      { code: "freinant", libelle: "En freinant", sujet: "quelque chose d'inhabituel au freinage" },
      { code: "tournant", libelle: "En tournant", sujet: "quelque chose d'inhabituel en tournant" },
    ],
  },
};

export function precisionsPour(constat) {
  return PRECISIONS[constat] ?? null;
}

const constatDe = (code) => CONSTATS.find((c) => c.code === code) ?? null;

// La phrase qu'on lira à un professionnel — ou qu'on lui enverra.
//
// Une seule phrase, dans l'ordre où on le raconte : ce qu'on constate, depuis
// quand, puis ce qu'on ajoute soi-même. Modifiable ensuite : c'est un point de
// départ, pas un verdict.
export function resumeProbleme({ constat, depuis, precision, complement } = {}) {
  const base = constatDe(constat);
  if (!base) return String(complement ?? "").trim();

  const choisie = precisionsPour(constat)?.options.find((o) => o.code === precision);
  const sujet = choisie?.sujet ?? base.sujet;
  const suite = DEPUIS.find((d) => d.code === depuis)?.suite ?? null;

  const phrase = `${sujet}${suite ? `, ${suite}` : ""}.`;
  const principale = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  const detail = String(complement ?? "").trim();
  return detail ? `${principale} ${detail}` : principale;
}

// Deux choses qui étaient confondues (constat du 18 sept. 2026) :
//
// - `immobilise` : la voiture risque de ne pas repartir → c'est l'assistance
//   qui correspond au besoin, pas une prise de rendez-vous.
// - `securite`   : ce qui est constaté touche à la maîtrise du véhicule →
//   on rappelle la prudence.
//
// « Démarre mal » portait le message « ne prenez pas la route » alors que la
// voiture ne roule pas ; « quelque chose a changé au freinage » n'en portait
// aucun. Les deux attributs sont maintenant indépendants.
export function immobilise(constat) {
  return Boolean(constatDe(constat)?.immobilise);
}

// La réponse peut rendre prudent ce que le constat seul ne disait pas : « un
// voyant » est trop vague pour rappeler quoi que ce soit, « rouge » ou « il
// clignote » non. Le message reste le même — il porte sur le doute de la
// personne, pas sur ce que signifie ce voyant-là, que Nexora ignore.
export function securite(constat, precision = null) {
  if (constatDe(constat)?.securite) return true;
  return Boolean(precisionsPour(constat)?.options.find((o) => o.code === precision)?.securite);
}

// La prestation qui correspond au BESOIN exprimé, jamais à une cause supposée.
export function prestationPour(constat) {
  return immobilise(constat) ? "assistance_panne" : "diagnostic";
}
