// Confirmer une facture : de la proposition lue au formulaire unique, et les
// contrôles montrés avant l'enregistrement.
//
// Règles :
// - Une information absente reste vide ; une information incertaine est
//   mise en évidence. La personne corrige seulement ce qui le nécessite.
// - Date d'intervention ≠ date de facture. Sans date d'intervention imprimée,
//   la date de facture est proposée comme date d'intervention, marquée « à
//   vérifier ».
// - Une facture = une intervention et un montant total, compté une fois,
//   quel que soit le nombre d'opérations.
// - Rien n'est fusionné ni remplacé en silence : une intervention
//   ressemblante (même voiture, même date, même montant — ou même type sans
//   montant) est un DOUBLON POTENTIEL que la personne tranche ; une
//   incohérence de kilométrage est signalée, jamais corrigée.
//
// Pur et testé (factures.test.js).

import { pointsKilometrage } from "./kilometrage.js";
import { normaliserImmatriculation } from "./immatriculation.js";

const PRIORITE_TYPE = ["revision", "controle_technique", "distribution", "freinage", "pneus", "batterie", "climatisation", "vidange", "carrosserie", "reparation", "lavage", "autre"];

export const CHAMPS_FACTURE = ["dateIntervention", "dateFacture", "professionnel", "kilometrage", "montant", "type", "operations"];

// Le type retenu pour l'intervention : la révision l'emporte si elle figure
// explicitement, sinon l'opération la plus significative.
export function typePrincipal(operations = []) {
  const types = new Set(operations.map((o) => o.type));
  return PRIORITE_TYPE.find((t) => types.has(t)) ?? "autre";
}

export function libelleOperations(operations = []) {
  const texte = operations
    .map((o) => o.libelle.trim())
    .filter(Boolean)
    .join(" ; ");
  return texte.length > 300 ? `${texte.slice(0, 297)}…` : texte;
}

const valeurTexte = (v) => (v == null ? "" : String(v));

// Proposition normalisée (lib/auto/lecture/proposition.js) → saisie du
// formulaire + ce qu'il faut mettre en évidence.
// { saisie, incertains: Set, nonLus: Set, immatriculationLue }
export function saisieDepuisProposition(proposition) {
  const incertains = new Set();
  const nonLus = new Set();
  if (!proposition?.champs) {
    return { saisie: saisieVide(), incertains, nonLus, immatriculationLue: null, estFacture: null };
  }
  const c = proposition.champs;
  const marquer = (nom, champ) => {
    if (!champ || champ.certitude === "absente") nonLus.add(nom);
    else if (champ.certitude === "incertaine") incertains.add(nom);
  };

  marquer("dateFacture", c.dateFacture);
  marquer("professionnel", c.professionnel);
  marquer("kilometrage", c.kilometrage);
  marquer("montant", c.montantTtc);

  let dateIntervention = c.dateIntervention?.valeur ?? null;
  if (dateIntervention) {
    marquer("dateIntervention", c.dateIntervention);
  } else if (c.dateFacture?.valeur) {
    dateIntervention = c.dateFacture.valeur;
    incertains.add("dateIntervention");
  } else {
    nonLus.add("dateIntervention");
  }

  const operations = (proposition.operations ?? []).map((o) => ({ type: o.type, libelle: o.libelle }));
  if (operations.length === 0) nonLus.add("operations");
  else if ((proposition.operations ?? []).some((o) => o.certitude !== "lue")) incertains.add("operations");

  return {
    saisie: {
      dateIntervention: valeurTexte(dateIntervention),
      dateFacture: valeurTexte(c.dateFacture?.valeur),
      professionnel: valeurTexte(c.professionnel?.valeur),
      kilometrage: valeurTexte(c.kilometrage?.valeur),
      montant: c.montantTtc?.valeur == null ? "" : String(c.montantTtc.valeur).replace(".", ","),
      type: operations.length ? typePrincipal(operations) : "",
      operations,
    },
    incertains,
    nonLus,
    immatriculationLue: c.immatriculation?.valeur ?? null,
    estFacture: proposition.estFacture ?? null,
  };
}

export function saisieVide() {
  return { dateIntervention: "", dateFacture: "", professionnel: "", kilometrage: "", montant: "", type: "", operations: [] };
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function entier(texte) {
  const brut = String(texte ?? "").replace(/[\s\u00A0\u202F.]/g, "").replace(/km$/i, "");
  return /^\d+$/.test(brut) ? Number(brut) : Number.NaN;
}

function montant(texte) {
  const brut = String(texte ?? "").replace(/[\s\u00A0\u202F€]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(brut) ? Number(brut) : Number.NaN;
}

// Rend { valide, erreurs, avertissements, donnees }.
export function validerFacture(saisie, { aujourdhui }) {
  const erreurs = {};
  const avertissements = {};
  const donnees = {};

  const di = String(saisie.dateIntervention ?? "").trim();
  if (!di) erreurs.dateIntervention = "Indiquez la date de l'intervention.";
  else if (!DATE_ISO.test(di) || di < "1990-01-01") erreurs.dateIntervention = "Cette date n'est pas valide.";
  else if (di > aujourdhui) erreurs.dateIntervention = "La date ne peut pas être dans le futur.";
  donnees.realiseLe = di || null;

  const df = String(saisie.dateFacture ?? "").trim();
  donnees.dateFacture = null;
  if (df) {
    if (!DATE_ISO.test(df) || df < "1990-01-01") erreurs.dateFacture = "Cette date n'est pas valide.";
    else if (df > aujourdhui) erreurs.dateFacture = "La date ne peut pas être dans le futur.";
    else {
      donnees.dateFacture = df;
      if (di && df < di) avertissements.dateFacture = "La facture est datée avant l'intervention : vérifiez les deux dates.";
    }
  }

  donnees.type = saisie.type || null;
  if (!donnees.type) erreurs.type = "Choisissez le type d'intervention.";

  donnees.operations = (saisie.operations ?? [])
    .map((o) => ({ type: o.type || "autre", libelle: String(o.libelle ?? "").replace(/\s+/g, " ").trim().slice(0, 120) }))
    .filter((o) => o.libelle);

  const pro = String(saisie.professionnel ?? "").replace(/\s+/g, " ").trim();
  donnees.prestataire = pro ? pro.slice(0, 120) : null;

  donnees.kilometrage = null;
  if (String(saisie.kilometrage ?? "").trim()) {
    const n = entier(saisie.kilometrage);
    if (!Number.isFinite(n) || n > 2000000) erreurs.kilometrage = "Ce kilométrage n'est pas valide.";
    else donnees.kilometrage = n;
  }

  donnees.montantTtc = null;
  if (String(saisie.montant ?? "").trim()) {
    const n = montant(saisie.montant);
    if (!Number.isFinite(n) || n > 100000) erreurs.montant = "Ce montant n'est pas valide.";
    else donnees.montantTtc = n;
  }

  donnees.libelle = libelleOperations(donnees.operations) || null;
  return { valide: Object.keys(erreurs).length === 0, erreurs, avertissements, donnees };
}

const centimes = (v) => (v == null || v === "" ? null : Math.round(Number(v) * 100));

// Interventions de la même voiture qui ressemblent à celle-ci : même date et
// même montant, ou même date et même type quand l'un des montants manque.
// Même définition que la base (auto_enregistrer_facture).
export function interventionsRessemblantes(historique = [], { realiseLe, montantTtc, type }) {
  if (!realiseLe) return [];
  const m = centimes(montantTtc);
  return historique.filter((h) => {
    if (String(h.realise_le).slice(0, 10) !== realiseLe) return false;
    const mh = centimes(h.montant_ttc);
    if (m != null && mh != null) return m === mh;
    return Boolean(type) && h.type === type;
  });
}

// Points de kilométrage qui contredisent la nouvelle valeur : plus élevés à
// une date antérieure, ou plus bas à une date postérieure. Rien n'est modifié.
export function incoherencesKilometrage({ releves = [], historique = [] }, { date, kilometrage }) {
  if (!date || !Number.isFinite(kilometrage)) return [];
  return pointsKilometrage({ releves, historique }).filter(
    (p) => (p.date < date && p.kilometrage > kilometrage) || (p.date > date && p.kilometrage < kilometrage),
  );
}

// La plaque lue diffère-t-elle de celle de la voiture choisie ?
export function plaqueDifferente(vehicule, immatriculationLue) {
  if (!immatriculationLue || !vehicule?.immatriculation) return false;
  return normaliserImmatriculation(immatriculationLue) !== normaliserImmatriculation(vehicule.immatriculation);
}

// Champs modifiés par la personne par rapport à la proposition : mesure des
// corrections, sans aucune valeur (pas de donnée personnelle).
export function champsCorriges(initiale, finale) {
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return CHAMPS_FACTURE.filter((nom) => {
    if (nom === "operations") {
      const f = (ops) => (ops ?? []).map((o) => ({ type: o.type, libelle: String(o.libelle ?? "").trim() })).filter((o) => o.libelle);
      return !egal(f(initiale.operations), f(finale.operations));
    }
    return String(initiale[nom] ?? "").trim() !== String(finale[nom] ?? "").trim();
  });
}
