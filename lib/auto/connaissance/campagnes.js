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

// Le modèle cherché doit former un mot entier : « 208 » ne doit pas se
// reconnaître dans « 2008 », ni « clio » dans « cliox ».
export function mentionneModele(texte, modele) {
  const cible = normaliser(modele);
  const lu = normaliser(texte);
  if (!cible || !lu) return false;
  const echappe = cible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${echappe}([^a-z0-9]|$)`).test(lu);
}

// Les gens nomment leur voiture comme ils la voient : « 208 (essai) »,
// « Clio IV », « C3 Picasso », « Golf 7 ». Les fiches officielles, elles,
// écrivent « 208 v2 » ou « clio ». Chercher le libellé entier ne trouverait
// rien, et Nexora conclurait à tort « aucune campagne ».
//
// On cherche donc du plus précis au plus large : le libellé nettoyé de ses
// parenthèses d'abord, puis son premier mot. L'écran dit toujours sur quoi la
// recherche a porté, pour qu'un élargissement ne passe pas pour une certitude.
export function termesDeModele(modele) {
  const base = normaliser(modele)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!base) return [];
  const premier = base.split(" ")[0];
  return premier && premier !== base ? [base, premier] : [base];
}

const MOTS_NEUTRES = new Set([
  "voiture", "voitures", "de", "du", "des", "le", "la", "les", "un", "une", "tourisme",
  "vehicule", "vehicules", "utilitaire", "leger", "legere", "fourgonnette", "moto", "motos",
  "scooter", "cyclomoteur", "camping", "car", "quad", "et", "ou", "a", "niv", "vin", "nis",
]);

// Les fiches numérotent les générations : « 208 v2 », « boxer ng ». Ce n'est
// pas un autre modèle, c'est le même à une autre phase.
const estMarqueurDeGeneration = (mot) => /^v\d+$/.test(mot) || /^ph\d?$/.test(mot) || mot === "ng" || mot === "phase";

// « c3 » trouvé dans « c3 aircross » : le mot suivant n'est ni neutre ni un
// numéro de génération, donc la fiche parle probablement d'un autre modèle. On
// le signale au lieu de filtrer : c'est la personne qui reconnaît sa voiture.
export function modeleVoisin(texte, modele) {
  const cible = normaliser(modele);
  const lu = normaliser(texte);
  const echappe = cible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = lu.match(new RegExp(`(^|[^a-z0-9])${echappe}[^a-z0-9]+([a-z0-9-]+)`));
  if (!m) return false;
  return !MOTS_NEUTRES.has(m[2]) && !estMarqueurDeGeneration(m[2]);
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
  if (dates.length === 0) return null;
  const debut = dates.map((d) => d.debut).sort()[0];
  const fin = dates.map((d) => d.fin).sort().at(-1);
  return debut && fin ? { debut, fin } : null;
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

// "compatible" | "hors_periode" | "inconnue"
export function situerDansLaPeriode(periode, { dateMiseEnCirculation, annee } = {}) {
  if (!periode) return "inconnue";
  const jour = typeof dateMiseEnCirculation === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateMiseEnCirculation) ? dateMiseEnCirculation.slice(0, 10) : null;
  if (jour) {
    const finElargie = ajouterMois(periode.fin, MOIS_APRES_FABRICATION);
    if (jour < periode.debut) return "hors_periode";
    if (jour > finElargie) return "hors_periode";
    return "compatible";
  }
  if (Number.isInteger(annee)) {
    const anneeDebut = Number(periode.debut.slice(0, 4));
    const anneeFin = Number(ajouterMois(periode.fin, MOIS_APRES_FABRICATION).slice(0, 4));
    return annee >= anneeDebut && annee <= anneeFin ? "compatible" : "hors_periode";
  }
  return "inconnue";
}

// Une fiche officielle → ce que l'écran en montre. Aucun champ inventé : tout
// vient de la fiche, et le lien renvoie à l'original.
export function resumerFiche(fiche, vehicule) {
  const periode = lirePeriode(fiche?.identification_produits);
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
    situation: situerDansLaPeriode(periode, vehicule ?? {}),
    modeleVoisin: vehicule?.modele ? modeleVoisin(fiche?.modeles_ou_references, vehicule.modele) : false,
  };
}

// { etat, retenues, ecartees, total }
// - "a_verifier"        : au moins une campagne peut concerner cette voiture ;
// - "aucune_connue"     : la marque et le modèle n'apparaissent dans aucune fiche ;
// - "donnees_insuffisantes" : sans marque ni modèle, on ne cherche rien.
export function campagnesPour({ vehicule, fiches = [] } = {}) {
  if (!vehicule?.marque || !vehicule?.modele) {
    return { etat: "donnees_insuffisantes", manques: ["marque_modele"], retenues: [], ecartees: [], total: 0, terme: null, elargi: false };
  }

  const deLaMarque = fiches
    .filter((f) => normaliser(f?.sous_categorie_produit) === normaliser(SOUS_CATEGORIE))
    .filter((f) => memeMarque(vehicule.marque, f?.marque_produit));

  // Le premier terme qui trouve quelque chose gagne : on n'élargit jamais
  // au-delà du nécessaire, et on ne mélange pas deux niveaux de précision.
  const termes = termesDeModele(vehicule.modele);
  let terme = termes[0] ?? null;
  let trouvees = [];
  for (const t of termes) {
    trouvees = deLaMarque.filter((f) => mentionneModele(f?.modeles_ou_references, t));
    if (trouvees.length > 0) {
      terme = t;
      break;
    }
  }

  const candidates = trouvees
    .map((f) => resumerFiche(f, { ...vehicule, modele: terme }))
    .sort((a, b) => String(b.publiee_le ?? "").localeCompare(String(a.publiee_le ?? "")));

  // Une fiche dont la période exclut clairement la voiture est écartée de la
  // liste principale, jamais supprimée : la période est indicative.
  const retenues = candidates.filter((c) => c.situation !== "hors_periode");
  const ecartees = candidates.filter((c) => c.situation === "hors_periode");

  return {
    etat: candidates.length > 0 ? "a_verifier" : "aucune_connue",
    retenues,
    ecartees,
    total: candidates.length,
    terme,
    // Vrai quand le libellé de la personne n'a pas suffi et qu'on a cherché
    // plus large : l'écran doit le dire.
    elargi: Boolean(terme) && terme !== termes[0],
  };
}
