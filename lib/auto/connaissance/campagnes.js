// Les campagnes de rappel publiées qui PEUVENT concerner une voiture.
//
// Ce que Nexora dit, et ne dira jamais autrement : « des campagnes publiées
// visent des voitures comme la vôtre — vérifiez l'éligibilité de la vôtre
// auprès du constructeur ». Jamais « votre voiture est rappelée ». La fiche
// officielle ne porte ni la plaque ni le numéro de série de personne ; seul le
// constructeur peut répondre, à partir du VIN.
//
// Trois raisons d'être prudent, toutes constatées dans les données réelles :
// - le modèle est un texte libre (« c3 aircross v3 : … ») : chercher « c3 »
//   y trouve aussi l'Aircross, qui est une autre voiture ;
// - la période donnée est une période de FABRICATION ou de commercialisation,
//   pas d'immatriculation : une voiture produite en décembre s'immatricule en
//   janvier suivant ;
// - la marque est parfois une sous-marque (« renault trucks »,
//   « fiat professional ») qui ne désigne pas la même gamme.
//
// Module pur, testé (campagnes.test.js). L'appel réseau vit ailleurs
// (campagnes-serveur.js) : ici on ne fait qu'apparier des fiches déjà lues.

export const SOURCE = "rappelconso-v2";
export const CATEGORIE = "automobiles et moyens de déplacement";
export const SOUS_CATEGORIE = "automobiles, motos, scooters";

// Une immatriculation suit la fabrication de quelques mois. On élargit la
// fenêtre par la fin, jamais par le début : une voiture ne roule pas avant
// d'être faite.
//
// ATTENTION à ce que ces douze mois sont, et ne sont pas. C'est une HYPOTHÈSE
// de délai courant entre la sortie d'usine et la première immatriculation —
// pas une mesure, et surtout pas une preuve. Une voiture de stock, une
// voiture de démonstration, un import immatriculé tard : tous dépassent
// douze mois sans cesser d'appartenir au lot fabriqué. Dépasser cette marge
// ne prouve donc RIEN, et ne peut pas fonder une exclusion.
//
// Le sens de l'écart change tout, et c'est la seule asymétrie qui tienne :
// être immatriculé APRÈS la fin de fabrication + marge est douteux ; être
// immatriculé AVANT le début de la fabrication est impossible.
export const MOIS_APRES_FABRICATION = 12;

export function normaliser(texte) {
  if (typeof texte !== "string") return "";
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Les noms sous lesquels une marque apparaît dans les fiches officielles.
// Relevé sur les données réelles du 20 septembre 2026. Les sous-marques
// utilitaires ou poids lourds sont volontairement absentes.
export const ALIAS_MARQUES = {
  citroen: ["citroen"],
  ds: ["ds", "ds automobiles"],
  opel: ["opel", "opel/vauxhall"],
  "mercedes-benz": ["mercedes-benz", "mercedes"],
  volkswagen: ["volkswagen", "vw"],
  mini: ["mini", "bmw/mini"],
};

export function marquesEquivalentes(marque) {
  const base = normaliser(marque);
  if (!base) return [];
  return ALIAS_MARQUES[base] ?? [base];
}

export function memeMarque(marqueVehicule, marqueFiche) {
  const cherchees = marquesEquivalentes(marqueVehicule);
  const lue = normaliser(marqueFiche);
  if (!lue || cherchees.length === 0) return false;
  // « opel/vauxhall » désigne bien une Opel ; « renault trucks » ne désigne
  // pas une Renault de tourisme, et n'est donc pas coupé en morceaux.
  const morceaux = [lue, ...lue.split("/").map((m) => m.trim())];
  return morceaux.some((m) => cherchees.includes(m));
}


// Les gens nomment leur voiture comme ils la voient : « 208 (essai) »,
// « Clio IV », « C3 Picasso », « Golf 7 ». Les fiches officielles, elles,
// écrivent « 208 v2 » ou « clio ». Chercher le libellé entier ne trouverait
// rien, et Nexora conclurait à tort « aucune campagne ».
//
// On ne découpe donc pas le libellé au hasard : on le LIT. Ce qui est entre
// parenthèses est une annotation de la personne (« essai », « la bleue »),
// pas un nom de modèle — elle ne part jamais dans une recherche.
export function analyserLibelleModele(modele) {
  const brut = normaliser(modele);
  const annotation = (brut.match(/\(([^)]*)\)/) ?? [])[1]?.trim() || null;
  const nom = brut
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return { nom: nom || null, annotation };
}

// Deux paliers, et le second est annoncé comme moins précis. On ne descend au
// second que si le premier ne trouve rien : élargir une recherche augmente les
// résultats ET les faux positifs, jamais la certitude.
export function paliersDeRecherche(modele) {
  const { nom } = analyserLibelleModele(modele);
  if (!nom) return [];
  const paliers = [{ terme: nom, precision: "exacte" }];
  const premier = nom.split(" ")[0];
  if (premier && premier !== nom) paliers.push({ terme: premier, precision: "moins_precise" });
  return paliers;
}

const MOTS_NEUTRES = new Set([
  "voiture", "voitures", "de", "du", "des", "le", "la", "les", "un", "une", "tourisme",
  "vehicule", "vehicules", "utilitaire", "leger", "legere", "fourgonnette", "moto", "motos",
  "scooter", "cyclomoteur", "camping", "car", "quad", "et", "ou", "a", "niv", "vin", "nis",
  "particuliere", "particulieres", "equipee", "equipes", "equipees", "sous", "code", "rappel",
]);

// Les fiches numérotent les générations : « 208 v2 », « boxer ng ». Ce n'est
// pas un autre modèle, c'est le même à une autre phase — que l'écran affiche,
// parce qu'une génération n'est pas l'autre.
const estMarqueurDeGeneration = (mot) => /^v\d+$/.test(mot) || /^ph\d?$/.test(mot) || /^(i{1,3}|iv|v|vi)$/.test(mot) || mot === "ng" || mot === "phase";

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Le modèle cherché doit former un mot entier : « 208 » ne doit pas se
// reconnaître dans « 2008 », ni « clio » dans « cliox ».
export function mentionneModele(texte, modele) {
  const cible = normaliser(modele);
  const lu = normaliser(texte);
  if (!cible || !lu) return false;
  return new RegExp(`(^|[^a-z0-9])${echapper(cible)}([^a-z0-9]|$)`).test(lu);
}

// À quel point la fiche parle-t-elle de CE modèle ?
//
// - "exacte"     : le terme se tient seul dans l'énumération de la fiche ;
// - "generation" : il est suivi d'un numéro de génération (« 208 v2 ») ;
// - "voisine"    : il fait partie d'un nom plus long (« yaris cross »,
//                  « gr yaris », « c3 aircross ») — un autre véhicule ;
// - null         : la fiche ne le nomme pas.
//
// Un mot n'est un voisin que s'il est collé par une ESPACE : dans
// « aygo, aygo x, yaris, gr yaris », la virgule après « yaris » clôt le nom,
// donc la fiche nomme bien la Yaris — en plus de la GR Yaris.
export function correspondance(texte, modele) {
  const cible = normaliser(modele);
  const lu = normaliser(texte);
  if (!cible || !lu) return null;
  const e = echapper(cible);
  const motif = new RegExp(`(?:^|([a-z0-9-]+)(\\s+)|[^a-z0-9])${e}(?:(\\s+)([a-z0-9-]+)|[^a-z0-9]|$)`, "g");

  let meilleure = null;
  let m = motif.exec(lu);
  while (m) {
    const avant = m[2] ? m[1] : null;
    const apres = m[3] ? m[4] : null;
    const voisin = (mot) => mot && !MOTS_NEUTRES.has(mot) && !estMarqueurDeGeneration(mot);
    const generation = [avant, apres].some((mot) => mot && estMarqueurDeGeneration(mot));
    const niveau = voisin(avant) || voisin(apres) ? "voisine" : generation ? "generation" : "exacte";
    if (niveau === "exacte") return "exacte";
    if (niveau === "generation" || !meilleure) meilleure = niveau;
    m = motif.exec(lu);
  }
  return meilleure;
}

// La génération nommée juste après le modèle, quand il y en a une.
//
// On parcourt TOUTES les occurrences : une fiche qui écrit « c3 aircross v2,
// c3 v4 » nomme bien la génération v4, même si la première occurrence de
// « c3 » est suivie d'autre chose. Ne regarder que la première rendait
// « la génération indiquée » là où on pouvait la nommer.
export function generationNommee(texte, modele) {
  const lu = normaliser(texte);
  const motif = new RegExp(`(?:^|[^a-z0-9])${echapper(normaliser(modele))}\\s+([a-z0-9-]+)`, "g");
  let m = motif.exec(lu);
  while (m) {
    if (estMarqueurDeGeneration(m[1])) return m[1];
    m = motif.exec(lu);
  }
  return null;
}

// « 25.03.2014 - 26.08.2020 », « 01.2011 – 06.2015 », plusieurs lignes, ou rien.
// On retient la plus large enveloppe lisible ; à défaut, null.
export function lirePeriode(identification) {
  const texte = Array.isArray(identification) ? identification.join("\n") : typeof identification === "string" ? identification : "";
  const dates = [];
  const motif = /(\d{1,2})[./](\d{1,2})[./](\d{4})|(?:^|[^\d./])(\d{1,2})[./](\d{4})/g;
  let m = motif.exec(texte);
  while (m) {
    if (m[3]) {
      dates.push({ debut: iso(m[3], m[2], m[1]), fin: iso(m[3], m[2], m[1]) });
    } else if (m[5]) {
      dates.push({ debut: iso(m[5], m[4], 1), fin: finDeMois(m[5], m[4]) });
    }
    m = motif.exec(texte);
  }
  // Il faut DEUX dates pour former une période. Une seule — « à partir du
  // 01.01.2020 », une date de publication égarée dans le champ — donnerait une
  // fenêtre d'un jour, et ferait passer pour « hors période » une voiture qui
  // ne l'est pas. Mieux vaut dire « période non précisée ».
  if (dates.length < 2) return null;
  const debut = dates.map((d) => d.debut).sort()[0];
  const fin = dates.map((d) => d.fin).sort().at(-1);
  return debut && fin && debut < fin ? { debut, fin } : null;
}

const deuxChiffres = (n) => String(Number(n)).padStart(2, "0");
const iso = (a, m, j) => (Number(m) >= 1 && Number(m) <= 12 ? `${a}-${deuxChiffres(m)}-${deuxChiffres(j)}` : null);
const finDeMois = (a, m) => {
  if (!(Number(m) >= 1 && Number(m) <= 12)) return null;
  const d = new Date(Date.UTC(Number(a), Number(m), 0));
  return d.toISOString().slice(0, 10);
};

function ajouterMois(isoJour, mois) {
  const [a, m, j] = isoJour.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mois, Math.min(j, dernier))).toISOString().slice(0, 10);
}

// Où se situe la voiture par rapport à la période lue sur la fiche.
//
// Quatre réponses, et deux seulement sont du même ordre :
//
// - "compatible"  : la date tombe dans la fenêtre, marge comprise ;
// - "anterieure"  : la voiture roulait AVANT que cette fabrication commence.
//                   C'est une contradiction, pas une estimation : elle ne
//                   dépend d'aucune marge, et elle exclut pour de bon ;
// - "posterieure" : la voiture a été immatriculée plus de douze mois après la
//                   fin de fabrication. Douteux, jamais démontré — c'est la
//                   marge, donc une hypothèse, qui produit cet écart ;
// - "inconnue"    : la fiche ne donne pas de période lisible, ou la voiture
//                   n'a pas de date.
//
// Seule "anterieure" autorise à écarter. "posterieure" demande à vérifier.
export function situerDansLaPeriode(periode, { dateMiseEnCirculation, annee } = {}) {
  if (!periode) return "inconnue";
  const jour = typeof dateMiseEnCirculation === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateMiseEnCirculation) ? dateMiseEnCirculation.slice(0, 10) : null;
  if (jour) {
    if (jour < periode.debut) return "anterieure";
    if (jour > ajouterMois(periode.fin, MOIS_APRES_FABRICATION)) return "posterieure";
    return "compatible";
  }
  if (Number.isInteger(annee)) {
    const anneeDebut = Number(periode.debut.slice(0, 4));
    const anneeFin = Number(ajouterMois(periode.fin, MOIS_APRES_FABRICATION).slice(0, 4));
    if (annee < anneeDebut) return "anterieure";
    if (annee > anneeFin) return "posterieure";
    return "compatible";
  }
  return "inconnue";
}

// Les deux questions que l'écran ne doit jamais fondre en une seule.
//
// PERTINENCE — « cette fiche parle-t-elle de mon modèle ? » C'est la lecture
// d'un texte : `correspondance` y répond (exacte, génération, voisine).
//
// APPLICABILITÉ — « ma voiture peut-elle faire partie du lot visé ? » C'est
// une comparaison de dates : `situation` y répond, et sa meilleure réponse
// reste « rien ne s'y oppose ». Aucune valeur de `situation` ne vaut
// confirmation : seul le constructeur confirme, à partir du VIN.
//
// Les confondre ferait deux fautes symétriques : une fiche douteuse promue en
// alerte, ou une fiche pertinente enterrée sous une hypothèse.
export const APPLICABILITE = {
  compatible: "rien_ne_s_y_oppose",
  inconnue: "rien_ne_s_y_oppose",
  posterieure: "a_verifier",
  anterieure: "contredite",
};

export function applicabiliteDe(situation) {
  return APPLICABILITE[situation] ?? "rien_ne_s_y_oppose";
}

// Une fiche officielle → ce que l'écran en montre. Aucun champ inventé : tout
// vient de la fiche, et le lien renvoie à l'original.
export function resumerFiche(fiche, { terme, vehicule }) {
  const periode = lirePeriode(fiche?.identification_produits);
  const situation = situerDansLaPeriode(periode, vehicule ?? {});
  return {
    id: String(fiche?.id ?? fiche?.numero_fiche ?? ""),
    numero: fiche?.numero_fiche ?? null,
    publiee_le: typeof fiche?.date_publication === "string" ? fiche.date_publication.slice(0, 10) : null,
    marque: fiche?.marque_produit ?? null,
    modeles: fiche?.modeles_ou_references ?? null,
    motif: fiche?.motif_rappel ?? null,
    risques: fiche?.risques_encourus ?? null,
    conduite: fiche?.conduites_a_tenir_par_le_consommateur ?? null,
    lien: fiche?.lien_vers_la_fiche_rappel ?? null,
    periode,
    // Les deux axes, côte à côte et jamais fondus : ce que la fiche nomme, et
    // ce que les dates permettent d'en dire.
    situation,
    applicabilite: applicabiliteDe(situation),
    correspondance: correspondance(fiche?.modeles_ou_references, terme),
    generation: generationNommee(fiche?.modeles_ou_references, terme),
  };
}

// Quatre groupes, un seul au premier plan, aucun supprimé.
//
// L'ordre de classement dit dans quel ordre les objections comptent :
//
// 1. ecartees   — la fabrication a commencé APRÈS la mise en circulation de
//                 la voiture. Contradiction de dates, pas d'hypothèse ;
// 2. voisines   — la fiche nomme un autre véhicule (« corsa e », « gr yaris »).
//                 Objection de pertinence : elle ne parle pas de ce modèle ;
// 3. aConfirmer — la fiche nomme bien ce modèle, mais la voiture a été
//                 immatriculée au-delà de la marge. Objection d'applicabilité,
//                 et cette objection-là n'est PAS démontrée : la fiche reste
//                 accessible, sous « période à vérifier » ;
// 4. principales — rien ne s'oppose à ce que cette voiture en fasse partie.
//                  C'est le seul groupe qui alimente le compteur de l'accueil.
//
// Le groupe 3 existe précisément pour que lever une exclusion douteuse ne
// transforme pas un doute en alerte : sortir de `ecartees` ne fait pas entrer
// dans `principales`.
export function repartir(candidates = []) {
  const ecartees = candidates.filter((c) => c.applicabilite === "contredite");
  const retenues = candidates.filter((c) => c.applicabilite !== "contredite");
  const voisines = retenues.filter((c) => c.correspondance === "voisine");
  const nommant = retenues.filter((c) => c.correspondance !== "voisine");
  return {
    retenues,
    ecartees,
    voisines,
    aConfirmer: nommant.filter((c) => c.applicabilite === "a_verifier"),
    principales: nommant.filter((c) => c.applicabilite !== "a_verifier"),
  };
}

// { etat, retenues, principales, aConfirmer, voisines, ecartees, total, … }
//
// Trois états, et ils ne disent pas la même chose :
// - "a_verifier"        : au moins une fiche nomme ce modèle. Nexora ne peut
//                         PAS en conclure que cette voiture-ci est concernée ;
// - "aucune_fiche"      : aucune fiche publiée ne nomme ce modèle. Ce n'est
//                         pas « aucun rappel » : Nexora ne lit qu'une base,
//                         et une base ne prouve pas une absence ;
// - "donnees_insuffisantes" : sans marque ni modèle, on ne cherche rien.
//
// (Le quatrième cas — la base est injoignable — n'est pas ici : il se décide
// avant, dans moteur.js, parce qu'aucune fiche n'a été lue du tout.)
export function campagnesPour({ vehicule, fiches = [] } = {}) {
  const vide = { retenues: [], principales: [], aConfirmer: [], voisines: [], ecartees: [], total: 0, terme: null, precision: null, exactes: 0, generations: 0 };
  if (!vehicule?.marque || !vehicule?.modele) {
    return { etat: "donnees_insuffisantes", manques: ["marque_modele"], ...vide };
  }

  const deLaMarque = fiches
    .filter((f) => normaliser(f?.sous_categorie_produit) === normaliser(SOUS_CATEGORIE))
    .filter((f) => memeMarque(vehicule.marque, f?.marque_produit));

  // Le premier palier qui trouve quelque chose gagne : on ne descend au palier
  // moins précis que si le précédent est vide, et on ne mélange jamais deux
  // niveaux de précision dans une même liste.
  const paliers = paliersDeRecherche(vehicule.modele);
  let palier = paliers[0] ?? null;
  let trouvees = [];
  for (const p of paliers) {
    trouvees = deLaMarque.filter((f) => correspondance(f?.modeles_ou_references, p.terme));
    if (trouvees.length > 0) {
      palier = p;
      break;
    }
  }

  if (!palier) return { etat: "donnees_insuffisantes", manques: ["marque_modele"], ...vide };

  // Classement par PERTINENCE d'abord, par date ensuite. Trier uniquement par
  // date mettait une « version voisine » devant des fiches qui nomment le
  // modèle lui-même, et laissait au conducteur un travail de tri (constat de
  // Baptiste sur sa Corsa, en Production, le 20 septembre 2026).
  const RANG = { exacte: 0, generation: 1, voisine: 2 };
  const candidates = trouvees
    .map((f) => resumerFiche(f, { terme: palier.terme, vehicule }))
    .sort((a, b) => RANG[a.correspondance] - RANG[b.correspondance] || String(b.publiee_le ?? "").localeCompare(String(a.publiee_le ?? "")));

  const { retenues, principales, aConfirmer, voisines, ecartees } = repartir(candidates);

  return {
    etat: candidates.length > 0 ? "a_verifier" : "aucune_fiche",
    retenues,
    principales,
    aConfirmer,
    voisines,
    ecartees,
    total: candidates.length,
    terme: palier.terme,
    precision: palier.precision,
    exactes: retenues.filter((c) => c.correspondance === "exacte").length,
    generations: retenues.filter((c) => c.correspondance === "generation").length,
  };
}
