// Les services, rangés par besoin plutôt que par vocabulaire de garage.
//
// Personne ne se réveille en pensant « géométrie » ou « detailing ». On pense
// « ma voiture fait un bruit » ou « il faut que je prépare le contrôle ». Ces
// entrées ne remplacent pas le catalogue : elles y mènent.
//
// Pur et testé (besoins.test.js). Aucun prix, aucun professionnel, aucun
// créneau : rien qui n'existe pas encore.

export const BESOINS = [
  {
    code: "entretenir",
    titre: "Entretenir ma voiture",
    resume: "Révision, vidange, freins, batterie : ce qui se fait au rythme du carnet.",
    services: ["revision", "vidange", "freinage", "batterie", "climatisation"],
  },
  {
    code: "probleme",
    titre: "J'ai un problème",
    resume: "Un bruit, un voyant, une fuite : mettez des mots dessus.",
    guide: true,
    services: ["diagnostic", "assistance_panne"],
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
  { code: "bruit", libelle: "Un bruit inhabituel" },
  { code: "voyant", libelle: "Un voyant allumé au tableau de bord" },
  { code: "demarrage", libelle: "La voiture démarre mal, ou plus du tout", immobilise: true },
  { code: "freinage", libelle: "Quelque chose a changé au freinage" },
  { code: "tenue", libelle: "La voiture tire, vibre ou tient mal la route" },
  { code: "fuite", libelle: "Une fuite, une tache sous la voiture" },
  { code: "odeur", libelle: "Une odeur ou de la fumée", immobilise: true },
  { code: "autre", libelle: "Autre chose" },
];

export const DEPUIS = [
  { code: "aujourdhui", libelle: "Aujourd'hui" },
  { code: "quelques_jours", libelle: "Depuis quelques jours" },
  { code: "quelques_semaines", libelle: "Depuis quelques semaines" },
  { code: "longtemps", libelle: "Depuis longtemps" },
];

export const QUAND = [
  { code: "toujours", libelle: "Tout le temps" },
  { code: "froid", libelle: "À froid, au démarrage" },
  { code: "roulant", libelle: "En roulant" },
  { code: "freinant", libelle: "En freinant" },
  { code: "tournant", libelle: "En tournant" },
];

const libelleDe = (liste, code) => liste.find((e) => e.code === code)?.libelle ?? null;

// La phrase qu'on pourra lire à un professionnel. Modifiable ensuite : c'est un
// point de départ, pas un verdict.
export function resumeProbleme({ constat, depuis, quand, precision } = {}) {
  const morceaux = [libelleDe(CONSTATS, constat), libelleDe(DEPUIS, depuis)?.toLowerCase(), libelleDe(QUAND, quand)?.toLowerCase()].filter(Boolean);
  const phrase = morceaux.join(", ");
  const detail = String(precision ?? "").trim();
  if (!phrase) return detail;
  return detail ? `${phrase}. ${detail}` : `${phrase}.`;
}

// Le constat empêche-t-il de rouler sereinement ? Sert à proposer l'assistance
// plutôt que la prise de rendez-vous — et à rappeler la prudence, sans énoncer
// de règle de sécurité que nous ne pourrions pas sourcer.
export function immobilise(constat) {
  return Boolean(CONSTATS.find((c) => c.code === constat)?.immobilise);
}

// La prestation qui correspond au BESOIN exprimé, jamais à une cause supposée.
export function prestationPour(constat) {
  return immobilise(constat) ? "assistance_panne" : "diagnostic";
}
