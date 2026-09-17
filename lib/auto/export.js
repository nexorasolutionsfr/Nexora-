// Exporter le dossier d'une voiture : ce que la personne a enregistré, à
// garder, imprimer ou transmettre elle-même.
//
// Règles :
// - Ce n'est ni un certificat ni un historique vérifié : l'en-tête le dit, et
//   chaque intervention porte sa provenance (saisie, d'après une facture,
//   enregistrée par Nexora).
// - Les documents sont listés, jamais joints : aucun fichier ni lien d'accès
//   ne sort du compte.
// - Les dépenses sont les montants déclarés, additionnés en centimes.
//
// Pur et testé (export.test.js).

import { resumerDepenses } from "./depenses.js";
import { lignesKilometrage } from "./kilometrage.js";

export const AVERTISSEMENT_EXPORT =
  "Informations saisies ou confirmées par le propriétaire dans Nexora. Ce document n'est ni un certificat, ni un historique vérifié par Nexora ou par un professionnel.";

const PROVENANCES = { prestation: "Enregistrée par Nexora", document: "D'après une facture", manuelle: "Saisie par le propriétaire" };
const SOURCES_KM = { releve: "Relevé du propriétaire", prestation: "Relevé Nexora", intervention: "Intervention" };

export function provenanceIntervention(ligne) {
  if (ligne?.source === "prestation") return PROVENANCES.prestation;
  return ligne?.saisie === "document" ? PROVENANCES.document : PROVENANCES.manuelle;
}

const date = (v) => (typeof v === "string" ? v.slice(0, 10) : null);

// { genereLe, avertissement, vehicule, interventions, kilometrages, depenses, documents }
// Les libellés (types, énergies) sont fournis par l'appelant pour rester pur.
export function construireExport({ vehicule, releves = [], historique = [], documents = [], libelles = {}, aujourdhui }) {
  const libelle = (liste, valeur) => (valeur == null ? null : libelles[liste]?.[valeur] ?? valeur);
  const interventions = [...historique]
    .sort((a, b) => (date(a.realise_le) === date(b.realise_le) ? 0 : date(a.realise_le) < date(b.realise_le) ? 1 : -1))
    .map((h) => ({
      id: h.id,
      date: date(h.realise_le),
      type: libelle("interventions", h.type),
      kilometrage: Number.isFinite(h.kilometrage) ? h.kilometrage : null,
      professionnel: h.prestataire ?? null,
      montantTtc: h.montant_ttc == null ? null : Number(h.montant_ttc),
      detail: h.libelle ?? null,
      operations: Array.isArray(h.operations) ? h.operations.map((o) => o.libelle) : [],
      resultatControle: libelle("resultats", h.resultat_controle),
      controleValableJusquAu: date(h.controle_valable_jusqu_au),
      provenance: provenanceIntervention(h),
    }));
  const parId = new Map(interventions.map((i) => [i.id, i]));
  return {
    genereLe: aujourdhui,
    avertissement: AVERTISSEMENT_EXPORT,
    vehicule: {
      marque: vehicule.marque,
      modele: vehicule.modele,
      motorisation: vehicule.motorisation ?? null,
      annee: vehicule.annee ?? null,
      energie: libelle("energies", vehicule.energie),
      immatriculation: vehicule.immatriculation ?? null,
      miseEnCirculation: date(vehicule.date_mise_en_circulation),
      archiveeLe: date(vehicule.archive_le),
    },
    interventions,
    kilometrages: lignesKilometrage({ releves, historique }).map((l) => ({
      date: l.date,
      kilometrage: l.kilometrage,
      source: l.origine === "intervention" ? `${SOURCES_KM.intervention} : ${libelle("interventions", l.type)}` : SOURCES_KM[l.origine],
    })),
    depenses: resumerDepenses(historique, { aujourdhui }),
    documents: [...documents]
      .sort((a, b) => ((date(a.date_document) ?? date(a.created_at)) < (date(b.date_document) ?? date(b.created_at)) ? 1 : -1))
      .map((d) => {
        const justifie = d.historique_id ? parId.get(d.historique_id) : null;
        return {
          titre: d.titre || libelle("documents", d.type),
          type: libelle("documents", d.type),
          date: date(d.date_document),
          justifie: justifie ? `${justifie.type} du ${justifie.date}` : null,
        };
      }),
  };
}

// Tableur : une ligne par intervention, puis une par kilométrage. Séparateur
// « ; » et marque UTF-8, comme l'attend un tableur réglé en français.
const cellule = (v) => {
  if (v == null) return "";
  const texte = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  // Une cellule qui commence par = + - @ serait lue comme une formule.
  const sure = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return /[";\n\r]/.test(sure) ? `"${sure.replace(/"/g, '""')}"` : sure;
};

export function exportCsv(dossier) {
  const lignes = [
    ["Rubrique", "Date", "Type", "Kilométrage", "Professionnel", "Montant TTC (€)", "Détail", "Provenance"],
    ...dossier.interventions.map((i) => [
      "Intervention",
      i.date,
      i.type,
      i.kilometrage,
      i.professionnel,
      i.montantTtc,
      [i.operations.length ? i.operations.join(" ; ") : i.detail, i.resultatControle].filter(Boolean).join(" — "),
      i.provenance,
    ]),
    ...dossier.kilometrages.map((k) => ["Kilométrage", k.date, null, k.kilometrage, null, null, null, k.source]),
  ];
  return "\uFEFF" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

export function nomFichierExport(vehicule, aujourdhui) {
  const nom = `${vehicule.marque}-${vehicule.modele}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `nexora-dossier-${nom || "voiture"}-${aujourdhui}.csv`;
}
