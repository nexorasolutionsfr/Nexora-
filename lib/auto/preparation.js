// Ce qu'on emporte chez un professionnel quand Nexora ne sait pas tout.
//
// Le problème que ce module résout, et qu'aucun autre ne résolvait : une
// voiture dont le programme d'entretien n'est publié nulle part — une Corsa
// 1.3 CDTI de 2007, par exemple — n'obtenait qu'une liste de ce qui MANQUE.
// Trois gestes proposés, et les trois réclamaient une information que son
// propriétaire n'a pas : la date de sa dernière révision, son intervalle, une
// facture. Un mur poli, mais un mur.
//
// Or il manque à Nexora exactement ce qu'un garage sait déjà. Le renversement
// tient en une phrase : **ce que Nexora ne sait pas devient ce qu'il faut
// demander.** Chaque manque se retourne en question à poser, et la personne
// repart avec sa voiture résumée et trois questions précises, sans avoir rien
// saisi de plus.
//
// Deux listes qu'il ne faut jamais confondre :
//
// - `manquesEntretien` (entretien.js) — ce qu'il manque à NEXORA pour
//   calculer. Ce sont des gestes, pour la personne, dans l'application.
// - `pointsAdemander` (ici) — ce que le PROFESSIONNEL peut dire et qu'on ne
//   trouvera nulle part ailleurs. Ce sont des questions, pour le garage.
//
// Module pur, testé (preparation.test.js). Aucun diagnostic, aucune pièce
// déclarée usée, aucun prix, aucun créneau, aucune périodicité inventée : on
// ne pose que des questions dont la réponse appartient au professionnel.

// L'intention porte le code d'un besoin (lib/auto/besoins.js). Il n'y a
// volontairement PAS de seconde liste ici : deux énumérations de ce que veut
// un conducteur auraient divergé au premier ajout.
import { manquesEntretien } from "./entretien.js";

// ---------------------------------------------------------------------------
// Ce que Nexora sait déjà, et qu'elle ne redemandera pas
// ---------------------------------------------------------------------------
//
// Une ligne n'existe que si sa valeur est connue. Rien n'est inventé, rien
// n'est approché, et un champ vide ne produit pas une ligne « non renseigné » :
// un résumé n'est pas un formulaire à trous.
//
// Le kilométrage est le seul cas à trois états, et ils ne se valent pas :
// un relevé est une mesure, une estimation est un calcul. Les confondre dans
// un texte qu'on lit à un garagiste serait lui mentir.

const LIGNES = [
  { cle: "marque_modele", libelle: "Voiture", lire: (v) => [v.marque, v.modele].filter(Boolean).join(" ") || null },
  { cle: "motorisation", libelle: "Motorisation", lire: (v) => v.motorisation || null },
  { cle: "energie", libelle: "Énergie", lire: (v, f) => (v.energie ? f.energie(v.energie) : null) },
  {
    cle: "mise_en_circulation",
    libelle: "Première mise en circulation",
    lire: (v, f) => (v.date_mise_en_circulation ? f.date(v.date_mise_en_circulation) : v.annee ? String(v.annee) : null),
  },
];

const FORMATEURS = { date: (d) => String(d), km: (n) => String(n), energie: (e) => String(e) };

// [{ cle, libelle, valeur, precision? }]
export function identiteConnue(vehicule, { kilometrage = null, controle = null, formateurs = FORMATEURS } = {}) {
  if (!vehicule) return [];
  const f = { ...FORMATEURS, ...formateurs };
  const lignes = [];

  for (const l of LIGNES) {
    const valeur = l.lire(vehicule, f);
    if (valeur) lignes.push({ cle: l.cle, libelle: l.libelle, valeur });
  }

  // Un relevé est une mesure ; une estimation est un calcul. Le résumé porte
  // toujours le relevé, et ne mentionne l'estimation que comme telle.
  //
  // Et quand les relevés se contredisent, le dire. Emporter « 95 000 km » chez
  // un garagiste alors que l'application sait que deux compteurs ne concordent
  // pas, ce serait lui transmettre un chiffre auquel elle ne croit pas
  // elle-même (constaté sur une voiture de recette, le 22 septembre 2026).
  if (kilometrage?.etat === "releve" && Number.isFinite(kilometrage.dernier?.kilometrage)) {
    const ligne = {
      cle: "kilometrage",
      libelle: "Dernier compteur relevé",
      valeur: f.km(kilometrage.dernier.kilometrage),
    };
    const quand = kilometrage.dernier.date ? `relevé le ${f.date(kilometrage.dernier.date)}` : null;
    const doute = kilometrage.aVerifier ? "à vérifier : deux relevés enregistrés se contredisent" : null;
    ligne.precision = [quand, doute].filter(Boolean).join(" — ") || undefined;
    lignes.push(ligne);
  }

  if (controle?.etat === "calcule" && controle.date) {
    lignes.push({ cle: "controle_technique", libelle: "Contrôle technique valable jusqu'au", valeur: f.date(controle.date) });
  }

  return lignes;
}

// ---------------------------------------------------------------------------
// Les questions à poser — celles dont la réponse appartient au garage
// ---------------------------------------------------------------------------
//
// Règle unique, et elle décide de tout ce qui suit : **on ne pose que des
// questions, jamais de constats.** « Tous les combien doit-elle être
// révisée ? » est une question. « Votre courroie est à changer » serait un
// diagnostic, et Nexora n'en fait pas — elle n'a jamais vu la voiture.
//
// Chaque manque du suivi se retourne en question, parce que c'est exactement
// ce qu'un professionnel lit dans son propre système ou sur le carnet.

const QUESTIONS_DE_MANQUE = {
  intervalle: {
    texte: "Tous les combien cette voiture doit-elle être révisée ? En kilomètres et en durée.",
    pourquoi: "C'est la seule chose qui manque à Nexora pour calculer vos échéances toute seule ensuite.",
    rapporter: "intervalle",
  },
  derniere_intervention: {
    texte: "Quelle est la date de sa dernière révision, si vous la retrouvez dans votre historique ?",
    pourquoi: "C'est le point de départ du calcul. Sans lui, aucune échéance ne se situe.",
    rapporter: "revision",
  },
  kilometrage_revision: {
    texte: "À quel kilométrage la dernière révision a-t-elle été faite ?",
    pourquoi: "Votre intervalle se compte au compteur : il lui faut ce point de départ.",
    rapporter: "revision",
  },
};

// Questions propres à l'intention, ajoutées après celles qui viennent des
// manques. Aucune ne suppose un défaut : ce sont des questions ouvertes.
const QUESTIONS_INTENTION = {
  entretenir: [
    {
      cle: "echeances_age",
      texte: "Y a-t-il des points qui se jouent à l'âge plutôt qu'au kilométrage ?",
      pourquoi: "Une voiture peu roulée passe à côté des échéances comptées en kilomètres.",
    },
  ],
  rendez_vous: [
    {
      cle: "duree",
      texte: "Combien de temps la voiture doit-elle rester ?",
      pourquoi: "Pour savoir s'il faut s'organiser autrement pour la journée.",
    },
    {
      cle: "devis",
      texte: "Un devis écrit est-il établi avant l'intervention ?",
      pourquoi: "Pour décider en connaissance de cause, avant que le travail commence.",
    },
    {
      cle: "carnet",
      texte: "Faut-il apporter le carnet d'entretien ou un document particulier ?",
      pourquoi: "Pour ne pas faire le trajet deux fois.",
    },
  ],
};

// La question qui n'a de sens que si aucune source publique ne couvre la
// voiture. Quand un programme EST publié, la poser ferait perdre du temps.
// Deux questions qui n'ont de sens que si aucune source publique ne couvre la
// voiture. Quand le programme EST affiché sur la fiche, les poser ferait
// demander au garage ce que la personne a déjà sous les yeux.
const QUESTIONS_SANS_PROGRAMME = [
  {
    cle: "programme_introuvable",
    texte: "Avez-vous accès au plan d'entretien du constructeur pour cette voiture ?",
    pourquoi: "Nexora n'a pas trouvé de programme publié pour ce modèle dans les sources qu'elle a examinées. Un professionnel équipé y a souvent accès.",
  },
  {
    cle: "plan_motorisation",
    texte: "Quelles opérations le plan d'entretien prévoit-il pour cette motorisation précise ?",
    pourquoi: "Les périodicités dépendent de la motorisation exacte, pas du nom du modèle.",
  },
];

// [{ cle, texte, pourquoi, rapporter? }]
//
// `programmeConnu` dit qu'une source publique couvre déjà ce modèle : dans ce
// cas on ne demande pas au garage ce qui est déjà affiché à l'écran.
export function pointsAdemander({ vehicule = null, intention = "entretenir", programmeConnu = false } = {}) {
  if (!vehicule) return [];

  const points = manquesEntretien(vehicule)
    .map((m) => QUESTIONS_DE_MANQUE[m.cle] && { cle: m.cle, ...QUESTIONS_DE_MANQUE[m.cle] })
    .filter(Boolean);

  if (!programmeConnu && intention === "entretenir") points.push(...QUESTIONS_SANS_PROGRAMME);

  for (const q of QUESTIONS_INTENTION[intention] ?? []) points.push(q);

  // Une liste de questions qu'on lit à un comptoir doit tenir dans une main.
  return points.slice(0, MAX_POINTS);
}

export const MAX_POINTS = 5;

// Ce qu'on rapporte du rendez-vous, et le geste qui l'enregistre. Sans cela,
// la visite servirait une fois et Nexora resterait aussi ignorante qu'avant.
export function aRapporter(points = []) {
  const actions = [];
  for (const p of points) {
    if (p.rapporter && !actions.includes(p.rapporter)) actions.push(p.rapporter);
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Le texte qu'on emporte
// ---------------------------------------------------------------------------
//
// Il se lit à voix haute au comptoir, ou se colle dans un message. Donc :
// des lignes courtes, aucune mise en forme qui survivrait mal à un copier,
// et surtout aucune phrase que Nexora ne puisse assumer.

export function texteAEmporter({ identite = [], demande = null, points = [] } = {}) {
  const blocs = [];

  if (identite.length > 0) {
    blocs.push(identite.map((l) => `${l.libelle} : ${l.valeur}${l.precision ? ` (${l.precision})` : ""}`).join("\n"));
  }
  if (demande) blocs.push(`Ce que je viens faire :\n${demande}`);
  if (points.length > 0) {
    blocs.push(`Ce que je voudrais savoir :\n${points.map((p) => `- ${p.texte}`).join("\n")}`);
  }

  return blocs.join("\n\n");
}

// ---------------------------------------------------------------------------
// L'assemblage
// ---------------------------------------------------------------------------
//
// Rend tout ce dont l'écran a besoin, et le dit en une fois : de quoi parler,
// ce qu'on sait, ce qu'on demande, ce qu'on rapporte.
//
// `explication` s'adapte à ce qui est connu — c'est la seule phrase qui change
// vraiment d'une voiture à l'autre, et elle ne promet jamais ce qui n'est pas
// là.
export function preparerLaVisite({
  vehicule = null,
  intention = "entretenir",
  demande = null,
  programmeConnu = false,
  kilometrage = null,
  controle = null,
  formateurs = FORMATEURS,
} = {}) {
  if (!vehicule) return { etat: "sans_voiture", identite: [], points: [], texte: "", aRapporter: [] };

  const identite = identiteConnue(vehicule, { kilometrage, controle, formateurs });
  const points = pointsAdemander({ vehicule, intention, programmeConnu });
  const manques = manquesEntretien(vehicule);

  return {
    etat: "prete",
    intention,
    identite,
    points,
    demande,
    texte: texteAEmporter({ identite, demande, points }),
    aRapporter: aRapporter(points),
    // Dire « le programme est publié » sans y mener serait annoncer une aide
    // et la retenir. L'écran doit offrir ce dont il parle.
    voirProgramme: Boolean(programmeConnu),
    explication: explicationDe({ intention, programmeConnu, manques, identite }),
  };
}

// Une phrase, adaptée à ce qui est connu. Jamais un intervalle générique
// présenté comme une préconisation : si le programme n'est pas là, on le dit
// et on enchaîne sur ce qui reste utile.
function explicationDe({ intention, programmeConnu, manques, identite }) {
  if (intention === "rendez_vous") {
    return identite.length > 1
      ? "Nexora a résumé votre voiture avec ce qu'elle sait déjà. Emportez-le : vous n'aurez rien à chercher sur place."
      : "Nexora résume ici ce qu'elle sait de votre voiture. Complétez-la quand vous voudrez : ce résumé s'enrichira tout seul.";
  }

  if (programmeConnu && manques.length === 0) {
    return "Le programme du constructeur est affiché sur la fiche de votre voiture, et votre suivi est renseigné.";
  }
  if (programmeConnu) {
    return "Le programme du constructeur est publié pour ce modèle. Il dit à quelle fréquence chaque opération revient — pas à quelle date elle tombe chez vous.";
  }
  if (manques.length === 0) {
    return "Aucun programme publié n'a été trouvé pour cette voiture dans les sources examinées. Votre suivi repose donc sur l'intervalle de votre carnet, qui est renseigné.";
  }
  return "Aucun programme publié n'a été trouvé pour cette voiture dans les sources examinées. Ce que Nexora ignore, un garage le sait : voici quoi lui demander.";
}
