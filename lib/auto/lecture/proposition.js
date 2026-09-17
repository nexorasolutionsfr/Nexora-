// Proposition lue sur une facture : le format attendu de tout fournisseur de
// lecture, et sa normalisation.
//
// Le fournisseur (aujourd'hui Claude Haiku 4.5, remplaçable) rend des valeurs
// brutes ; ce module les ramène à des champs sûrs. Chaque champ porte sa
// certitude :
// - "lue"        : clairement imprimée sur le document ;
// - "incertaine" : partiellement lisible, déduite, ou jugée douteuse ici ;
// - "absente"    : non trouvée. Aucune valeur n'est alors inventée.
//
// Deux gardes indépendantes du fournisseur :
// - une opération n'est une « révision » que si son libellé le dit ; une
//   vidange reste une vidange ;
// - une date future, un montant ou un kilométrage hors bornes deviennent
//   « incertains » (ou absents s'ils sont illisibles), jamais corrigés.
//
// Pur et testé (proposition.test.js).

import { normaliserImmatriculation } from "../immatriculation.js";

export const TYPES_OPERATION = [
  "vidange",
  "revision",
  "controle_technique",
  "pneus",
  "freinage",
  "batterie",
  "distribution",
  "climatisation",
  "carrosserie",
  "reparation",
  "lavage",
  "autre",
];

export const CHAMPS_PROPOSITION = ["dateFacture", "dateIntervention", "professionnel", "immatriculation", "kilometrage", "montantTtc"];

const OPERATIONS_MAX = 30;
const KM_MAX = 2000000;
const MONTANT_MAX = 100000;

const champ = (description, valeur) => ({
  type: "object",
  description,
  properties: {
    valeur,
    certitude: { type: "string", enum: ["lue", "incertaine"], description: "« lue » si clairement imprimée, « incertaine » si partiellement lisible ou déduite." },
  },
  required: ["valeur", "certitude"],
});

// Schéma JSON demandé au fournisseur (outil « proposer_facture »).
export const SCHEMA_PROPOSITION = {
  type: "object",
  properties: {
    est_facture_vehicule: {
      type: "boolean",
      description: "true si le document est une facture, un ticket ou un devis accepté d'un professionnel pour une intervention sur un véhicule.",
    },
    date_facture: champ("Date d'émission de la facture.", { type: ["string", "null"], description: "AAAA-MM-JJ, ou null si absente." }),
    date_intervention: champ(
      "Date de réalisation des travaux, SEULEMENT si elle est imprimée séparément de la date de facture (date d'intervention, de réalisation, d'ordre de réparation). Sinon null.",
      { type: ["string", "null"], description: "AAAA-MM-JJ, ou null." },
    ),
    professionnel: champ("Nom commercial ou raison sociale du professionnel qui émet la facture.", { type: ["string", "null"] }),
    immatriculation: champ("Immatriculation du véhicule imprimée sur la facture.", { type: ["string", "null"] }),
    kilometrage: champ(
      "Kilométrage du compteur relevé à l'intervention. Pas un kilométrage de garantie ni de prochain entretien.",
      { type: ["integer", "null"] },
    ),
    montant_ttc: champ("Total TTC à payer de la facture entière (pas une ligne).", { type: ["number", "null"] }),
    operations: {
      type: "array",
      description:
        "Opérations réalisées. Pièces et main-d'œuvre d'une même opération = une seule opération. « revision » seulement si le document dit révision, entretien constructeur ou forfait entretien ; une vidange seule est « vidange ».",
      items: {
        type: "object",
        properties: {
          libelle: { type: "string", description: "Libellé court, tel qu'écrit sur la facture." },
          type: { type: "string", enum: TYPES_OPERATION },
          certitude: { type: "string", enum: ["lue", "incertaine"] },
        },
        required: ["libelle", "type", "certitude"],
      },
    },
  },
  required: ["est_facture_vehicule", "date_facture", "date_intervention", "professionnel", "immatriculation", "kilometrage", "montant_ttc", "operations"],
};

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOTS_REVISION = /r[ée]vision|entretien\s+(constructeur|p[ée]riodique|programm[ée])|forfait\s+entretien|plan\s+d'entretien/i;
const MOTS_VIDANGE = /vidange|huile\s+moteur|filtre\s+[àa]\s+huile/i;

const absente = () => ({ valeur: null, certitude: "absente" });
const certitudeDe = (brut) => (brut?.certitude === "lue" ? "lue" : "incertaine");

function dateValide(texte) {
  const m = DATE_ISO.exec(typeof texte === "string" ? texte.trim() : "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  if (m[1] < "1990") return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function champDate(brut, aujourdhui) {
  if (!brut || brut.valeur == null) return absente();
  const valeur = dateValide(brut.valeur);
  if (!valeur) return absente();
  // Une date future n'est pas corrigée : elle est signalée.
  return { valeur, certitude: valeur > aujourdhui ? "incertaine" : certitudeDe(brut) };
}

function champTexte(brut, longueurMax = 120) {
  if (!brut || typeof brut.valeur !== "string") return absente();
  const valeur = brut.valeur.replace(/\s+/g, " ").trim();
  if (!valeur) return absente();
  return { valeur: valeur.slice(0, longueurMax), certitude: valeur.length > longueurMax ? "incertaine" : certitudeDe(brut) };
}

function champNombre(brut, { entier, max }) {
  if (!brut || brut.valeur == null) return absente();
  const n = typeof brut.valeur === "number" ? brut.valeur : Number(String(brut.valeur).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return absente();
  const valeur = entier ? Math.round(n) : Math.round(n * 100) / 100;
  const douteux = n > max || (entier && !Number.isInteger(n));
  return { valeur: n > max ? null : valeur, certitude: n > max ? "absente" : douteux ? "incertaine" : certitudeDe(brut) };
}

// La garde « une vidange n'est pas une révision ».
export function typeOperationSur(libelle, typePropose) {
  const type = TYPES_OPERATION.includes(typePropose) ? typePropose : "autre";
  if (type !== "revision" || MOTS_REVISION.test(libelle)) return { type, rectifie: false };
  return { type: MOTS_VIDANGE.test(libelle) ? "vidange" : "autre", rectifie: true };
}

function operations(brutes) {
  if (!Array.isArray(brutes)) return [];
  return brutes
    .filter((o) => o && typeof o.libelle === "string" && o.libelle.trim())
    .slice(0, OPERATIONS_MAX)
    .map((o) => {
      const libelle = o.libelle.replace(/\s+/g, " ").trim().slice(0, 120);
      const { type, rectifie } = typeOperationSur(libelle, o.type);
      return { libelle, type, certitude: rectifie ? "incertaine" : certitudeDe(o) };
    });
}

// brut : l'objet rendu par le fournisseur (clés du schéma). Rend
// { estFacture, champs: { dateFacture, …, montantTtc }, operations }.
export function normaliserProposition(brut, { aujourdhui }) {
  const b = brut && typeof brut === "object" ? brut : {};
  const immat = champTexte(b.immatriculation, 20);
  const plaque = immat.valeur ? normaliserImmatriculation(immat.valeur) : null;
  return {
    estFacture: b.est_facture_vehicule === true,
    champs: {
      dateFacture: champDate(b.date_facture, aujourdhui),
      dateIntervention: champDate(b.date_intervention, aujourdhui),
      professionnel: champTexte(b.professionnel),
      immatriculation: plaque ? { valeur: plaque, certitude: immat.certitude } : absente(),
      kilometrage: champNombre(b.kilometrage, { entier: true, max: KM_MAX }),
      montantTtc: champNombre(b.montant_ttc, { entier: false, max: MONTANT_MAX }),
    },
    operations: operations(b.operations),
  };
}
