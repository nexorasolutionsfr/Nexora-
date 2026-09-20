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
export function generationNommee(texte, modele) {
  const lu = normaliser(texte);
  const m = lu.match(new RegExp(`(?:^|[^a-z0-9])${echapper(normaliser(modele))}\\s+([a-z0-9-]+)`));
  return m && estMarqueurDeGeneration(m[1]) ? m[1] : null;
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
export function resumerFiche(fiche, { terme, vehicule }) {
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
    correspondance: correspondance(fiche?.modeles_ou_references, terme),
    generation: generationNommee(fiche?.modeles_ou_references, terme),
  };
}

// { etat, retenues, ecartees, total, terme, precision, exactes, voisines }
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
  const vide = { retenues: [], ecartees: [], total: 0, terme: null, precision: null, exactes: 0, voisines: 0 };
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

  const candidates = trouvees
    .map((f) => resumerFiche(f, { terme: palier.terme, vehicule }))
    .sort((a, b) => String(b.publiee_le ?? "").localeCompare(String(a.publiee_le ?? "")));

  // Une fiche dont la période exclut clairement la voiture est écartée de la
  // liste principale, jamais supprimée : cette période est une période de
  // FABRICATION, et notre date est une immatriculation. Les deux ne coïncident
  // pas, et l'écart se compte en mois.
  const retenues = candidates.filter((c) => c.situation !== "hors_periode");
  const ecartees = candidates.filter((c) => c.situation === "hors_periode");

  return {
    etat: candidates.length > 0 ? "a_verifier" : "aucune_fiche",
    retenues,
    ecartees,
    total: candidates.length,
    terme: palier.terme,
    precision: palier.precision,
    exactes: retenues.filter((c) => c.correspondance === "exacte").length,
    voisines: retenues.filter((c) => c.correspondance === "voisine").length,
  };
}
