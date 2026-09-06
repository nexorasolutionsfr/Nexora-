// Lecture et reconnaissance d'un fichier client exporté d'un autre logiciel.
//
// Tout est ici : rien de ce fichier ne touche au réseau, à React ou à Supabase.
// C'est volontaire — c'est la partie qui doit être éprouvée par des tests, parce
// que c'est elle qui décide si un garage réussit sa reprise ou abandonne.
//
// Le principe : le garage ne doit RIEN configurer. On lit son fichier tel qu'il
// sort de son ancien logiciel, on devine le séparateur, on devine à quoi
// correspond chaque colonne, et on lui montre le résultat pour qu'il corrige si
// besoin. Deviner juste la plupart du temps vaut mieux que demander toujours.

export const CHAMPS = [
  { cle: "nom", label: "Nom du client", requis: true },
  { cle: "email", label: "E-mail" },
  { cle: "telephone", label: "Téléphone" },
  { cle: "immatriculation", label: "Immatriculation" },
  { cle: "marque", label: "Marque" },
  { cle: "modele", label: "Modèle" },
  { cle: "annee", label: "Année" },
  { cle: "kilometrage", label: "Kilométrage" },
];

// Intitulés réellement rencontrés dans les exports de logiciels de garage
// français et anglophones. L'ordre compte : le premier motif qui correspond
// l'emporte, donc les plus spécifiques sont placés avant les plus généraux.
// « nom » seul arrive après « nom du client » pour la même raison.
const MOTIFS = {
  email: ["email", "e mail", "mail", "courriel", "adresse mail", "adresse email"],
  telephone: [
    "telephone", "tel", "tel.", "telephone portable", "portable", "mobile",
    "gsm", "phone", "numero de telephone", "no tel", "n tel", "tel fixe",
  ],
  immatriculation: [
    "immatriculation", "immat", "immat.", "plaque", "plaque immatriculation",
    "no immat", "n immat", "numero immatriculation", "license plate", "plate",
    "registration", "vin",
  ],
  marque: ["marque", "constructeur", "make", "brand", "marque vehicule"],
  modele: ["modele", "model", "type vehicule", "type de vehicule", "version"],
  annee: [
    "annee", "annee vehicule", "annee mise en circulation", "mise en circulation",
    "year", "millesime", "date mise circulation",
  ],
  kilometrage: [
    "kilometrage", "km", "kms", "kilometres", "compteur", "mileage", "odometer",
    "releve compteur",
  ],
  nom: [
    "nom du client", "nom client", "client", "raison sociale", "nom et prenom",
    "nom complet", "customer", "customer name", "nom", "prenom nom", "titulaire",
  ],
};

// Ordre de résolution : les champs les plus discriminants d'abord. « nom » est
// traité en dernier parce que son motif « client » est large et attraperait
// volontiers une colonne « code client » ou « client email ».
const ORDRE = [
  "email", "immatriculation", "telephone", "kilometrage",
  "annee", "marque", "modele", "nom",
];

export function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Devine le séparateur en comparant, sur les premières lignes, laquelle des
// trois ponctuations découpe le fichier en un nombre de colonnes CONSTANT.
// Compter les occurrences ne suffit pas : une colonne d'adresses pleine de
// virgules ferait gagner la virgule sur un fichier pourtant en point-virgule.
export function devinerSeparateur(texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 8);
  if (lignes.length === 0) return ";";

  let meilleur = ";";
  let meilleurScore = -1;
  for (const sep of [";", ",", "\t", "|"]) {
    const comptes = lignes.map((l) => decouperLigne(l, sep).length);
    const premier = comptes[0];
    if (premier < 2) continue;
    const constant = comptes.every((c) => c === premier);
    // Un découpage régulier vaut mieux qu'un découpage abondant.
    const score = (constant ? 1000 : 0) + premier;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = sep;
    }
  }
  return meilleur;
}

// Découpe une ligne CSV en respectant les guillemets doubles et le doublement
// interne ("" = un guillemet littéral). Écrit à la main plutôt qu'avec une
// bibliothèque : c'est trente lignes, et une dépendance de plus sur un chemin
// aussi central se paie plus cher qu'elle ne rapporte.
export function decouperLigne(ligne, separateur) {
  const champs = [];
  let courant = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          courant += '"';
          i += 1;
        } else {
          dansGuillemets = false;
        }
      } else {
        courant += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === separateur) {
      champs.push(courant);
      courant = "";
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs.map((v) => v.trim());
}

// Associe chaque champ Nexora à l'indice de colonne du fichier, ou à null.
// Une colonne déjà prise ne peut plus l'être : deux champs ne partagent jamais
// la même source, sinon l'aperçu montrerait la même valeur deux fois sans que
// le garage comprenne pourquoi.
export function deviner(entetes) {
  const normalisees = entetes.map(normaliser);
  const correspondance = {};
  const prises = new Set();

  for (const champ of ORDRE) {
    let trouve = null;
    for (const motif of MOTIFS[champ]) {
      const cible = normaliser(motif);
      // Égalité stricte d'abord : c'est le cas franc, et il doit primer sur
      // toute correspondance partielle trouvée dans une autre colonne.
      let i = normalisees.findIndex((e, idx) => !prises.has(idx) && e === cible);
      if (i === -1) {
        i = normalisees.findIndex(
          (e, idx) => !prises.has(idx) && e !== "" && (e.startsWith(cible + " ") || e.endsWith(" " + cible))
        );
      }
      if (i !== -1) {
        trouve = i;
        break;
      }
    }
    if (trouve !== null) prises.add(trouve);
    correspondance[champ] = trouve;
  }
  return correspondance;
}

// Analyse complète : texte brut -> en-têtes, lignes, correspondance devinée.
export function analyser(texte) {
  const sansBom = texte.replace(/^\uFEFF/, "");
  const brutes = sansBom.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (brutes.length === 0) {
    return { erreur: "Le fichier est vide.", entetes: [], lignes: [], separateur: ";", correspondance: {} };
  }

  const separateur = devinerSeparateur(sansBom);
  const entetes = decouperLigne(brutes[0], separateur);

  if (entetes.length < 2) {
    return {
      erreur: "Aucune colonne n'a pu être reconnue. Le fichier doit être un CSV avec une ligne d'en-têtes.",
      entetes: [], lignes: [], separateur, correspondance: {},
    };
  }

  const lignes = brutes.slice(1).map((l) => decouperLigne(l, separateur));
  return { erreur: null, entetes, lignes, separateur, correspondance: deviner(entetes) };
}

// Construit le tableau envoyé à la base, dans la forme exacte qu'attend
// `importer_clients_vehicules`. Les lignes entièrement vides sont écartées ici
// plutôt que rejetées côté base : ce sont des artefacts d'export, pas des
// erreurs du garage, et les faire apparaître dans le rapport de rejets
// donnerait l'impression que son fichier est mauvais.
export function construireLignes(lignes, correspondance) {
  const resultat = [];
  for (const cellules of lignes) {
    const objet = {};
    let vide = true;
    for (const { cle } of CHAMPS) {
      const i = correspondance[cle];
      const valeur = i === null || i === undefined ? "" : (cellules[i] ?? "");
      objet[cle] = valeur;
      if (valeur !== "") vide = false;
    }
    if (!vide) resultat.push(objet);
  }
  return resultat;
}

// Aperçu des premières lignes telles qu'elles seront comprises, pour que le
// garage vérifie la correspondance sur ses vraies données et pas sur des
// intitulés abstraits.
export function apercu(lignes, correspondance, combien = 5) {
  return construireLignes(lignes.slice(0, combien), correspondance);
}
