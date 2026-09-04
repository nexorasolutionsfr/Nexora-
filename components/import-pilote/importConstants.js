// Import pilote — vocabulaire des colonnes et modèle de fichier.
//
// Les six champs repris sont exactement ceux que le schéma sait accueillir :
// `clients.nom`, `clients.telephone`, `clients.email`, puis
// `vehicules.immatriculation`, `vehicules.marque`, `vehicules.modele` et
// `vehicules.kilometrage`. L'année est acceptée en plus parce que la colonne
// existe, mais elle ne figure pas au modèle : rien n'oblige un garage à la
// fournir.

export const CHAMPS = [
  { cle: "nom", libelle: "Nom du client", requis: true },
  { cle: "telephone", libelle: "Téléphone", requis: false },
  { cle: "email", libelle: "E-mail", requis: false },
  { cle: "immatriculation", libelle: "Immatriculation", requis: false },
  { cle: "marque", libelle: "Marque", requis: false },
  { cle: "modele", libelle: "Modèle", requis: false },
  { cle: "kilometrage", libelle: "Kilométrage", requis: false },
  { cle: "annee", libelle: "Année", requis: false },
];

export const CLES_CHAMPS = CHAMPS.map((c) => c.cle);

// En-têtes rencontrés dans les exports des logiciels de garage. La
// comparaison se fait sur une forme réduite : minuscules, sans accent, sans
// ponctuation ni espace.
export const SYNONYMES = {
  nom: ["nom", "nomclient", "nomduclient", "nomdeclient", "client", "nomprenom", "nometprenom",
        "nomcomplet", "raisonsociale", "nomdefamille", "lastname", "name", "customer", "clientnom"],
  telephone: ["telephone", "tel", "telephoneclient", "telportable", "portable", "mobile", "gsm",
              "numero", "numerotelephone", "ndetelephone", "notelephone", "phone"],
  email: ["email", "mail", "adressemail", "adresseemail", "courriel", "emailclient"],
  immatriculation: ["immatriculation", "immat", "immatvehicule", "plaque", "plaqueimmatriculation",
                    "numeroimmatriculation", "noimmatriculation", "matricule"],
  marque: ["marque", "constructeur", "make", "brand"],
  modele: ["modele", "model", "type", "typevehicule", "version"],
  kilometrage: ["kilometrage", "km", "kms", "kilometres", "compteur", "mileage"],
  annee: ["annee", "anneemiseencirculation", "annees", "year", "millesime", "misecirculation"],
};

export const MAX_LIGNES = 2000;

// Modèle téléchargeable. Point-virgule et BOM : c'est ce qu'Excel en
// français ouvre correctement sans manipulation.
export const SEPARATEUR_MODELE = ";";

export const MODELE_ENTETES = [
  "Nom du client",
  "Téléphone",
  "E-mail",
  "Immatriculation",
  "Marque",
  "Modèle",
  "Kilométrage",
];

export const MODELE_EXEMPLES = [
  ["Martin Dupont", "0601020304", "martin.dupont@example.com", "AB-123-CD", "Peugeot", "308", "142000"],
  ["Garage du Centre", "0325000000", "", "EF-456-GH", "Renault", "Kangoo", "98500"],
  ["Claire Bernard", "0611223344", "claire.bernard@example.com", "", "", "", ""],
];

export function construireModeleCsv() {
  const lignes = [MODELE_ENTETES, ...MODELE_EXEMPLES];
  const corps = lignes
    .map((ligne) => ligne.map(echapperChampCsv).join(SEPARATEUR_MODELE))
    .join("\r\n");
  return `﻿${corps}\r\n`;
}

function echapperChampCsv(valeur) {
  const texte = String(valeur ?? "");
  if (texte.includes('"') || texte.includes(SEPARATEUR_MODELE) || /[\r\n]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

export const MOTIFS_LISIBLES = {
  "nom du client manquant": "Nom du client manquant",
  "adresse e-mail non valide": "Adresse e-mail non valide",
  "téléphone non valide": "Téléphone non valide",
  "kilométrage non valide": "Kilométrage non valide",
  "année non valide": "Année non valide",
  "immatriculation non disponible": "Immatriculation déjà enregistrée",
};
