import assert from "node:assert/strict";
import test from "node:test";

import { AVERTISSEMENT_EXPORT, construireExport, exportCsv, nomFichierExport, provenanceIntervention } from "./export.js";

const libelles = {
  interventions: { vidange: "Vidange", controle_technique: "Contrôle technique", revision: "Révision" },
  energies: { diesel: "Diesel" },
  documents: { facture: "Facture", proces_verbal_ct: "Procès-verbal de contrôle technique" },
  resultats: { favorable: "Favorable" },
};
const vehicule = { marque: "Škoda", modele: "Octavia Combi", annee: 2019, energie: "diesel", immatriculation: "GH456JK", date_mise_en_circulation: "2019-05-02", archive_le: null };
const historique = [
  { id: "h1", type: "vidange", realise_le: "2026-03-12", kilometrage: 84200, prestataire: 'Garage "Le Relais"; Nord', montant_ttc: "189.90", saisie: "document", source: "proprietaire", operations: [{ type: "vidange", libelle: "Vidange moteur" }, { type: "autre", libelle: "Filtre à huile" }] },
  { id: "h2", type: "controle_technique", realise_le: "2025-04-30", kilometrage: null, prestataire: "=HYPERLINK(\"http://exemple.invalid\")", montant_ttc: null, saisie: "manuelle", source: "proprietaire", resultat_controle: "favorable", controle_valable_jusqu_au: "2027-04-29" },
];
const releves = [{ id: "r1", releve_le: "2026-09-01", kilometrage: 86000, source: "proprietaire" }];
const documents = [
  { type: "facture", titre: null, date_document: "2026-03-14", historique_id: "h1", chemin: "u/v/secret.pdf", nom_fichier: "facture.pdf" },
  { type: "proces_verbal_ct", titre: "PV 2025", date_document: "2025-04-30", historique_id: null, chemin: "u/v/pv.pdf" },
];

test("export : dossier complet, provenance et avertissement, sans fichier ni lien", () => {
  const d = construireExport({ vehicule, releves, historique, documents, libelles, aujourdhui: "2026-09-17" });
  assert.equal(d.avertissement, AVERTISSEMENT_EXPORT);
  assert.match(d.avertissement, /ni un certificat/);
  assert.deepEqual(d.vehicule, { marque: "Škoda", modele: "Octavia Combi", motorisation: null, annee: 2019, energie: "Diesel", immatriculation: "GH456JK", miseEnCirculation: "2019-05-02", archiveeLe: null });
  assert.deepEqual(d.interventions.map((i) => [i.date, i.type, i.provenance]), [["2026-03-12", "Vidange", "D'après une facture"], ["2025-04-30", "Contrôle technique", "Saisie par le propriétaire"]]);
  assert.deepEqual(d.interventions[0].operations, ["Vidange moteur", "Filtre à huile"]);
  assert.equal(d.interventions[0].montantTtc, 189.9);
  assert.deepEqual(d.kilometrages.map((k) => [k.kilometrage, k.source]), [[86000, "Relevé du propriétaire"], [84200, "Intervention : Vidange"]]);
  assert.equal(d.depenses.totalCentimes, 18990);
  assert.equal(d.depenses.nombreSansMontant, 1);
  assert.deepEqual(d.documents, [
    { titre: "Facture", type: "Facture", date: "2026-03-14", justifie: "Vidange du 2026-03-12" },
    { titre: "PV 2025", type: "Procès-verbal de contrôle technique", date: "2025-04-30", justifie: null },
  ]);
  assert.equal(JSON.stringify(d).includes("secret.pdf") || JSON.stringify(d).includes("chemin"), false, "aucun chemin de fichier exporté");
  assert.equal(provenanceIntervention({ source: "prestation", saisie: "manuelle" }), "Enregistrée par Nexora");
});

test("export CSV : séparateur français, guillemets, formules neutralisées, marque UTF-8", () => {
  const csv = exportCsv(construireExport({ vehicule, releves, historique, documents, libelles, aujourdhui: "2026-09-17" }));
  assert.ok(csv.startsWith("\uFEFFRubrique;Date;Type;Kilométrage;"));
  const lignes = csv.trimEnd().split("\r\n");
  assert.equal(lignes.length, 1 + 2 + 2);
  assert.equal(lignes[1], 'Intervention;2026-03-12;Vidange;84200;"Garage ""Le Relais""; Nord";189,9;Vidange moteur ; Filtre à huile;D\'après une facture'.replace("Vidange moteur ; Filtre à huile", '"Vidange moteur ; Filtre à huile"'));
  assert.match(lignes[2], /^Intervention;2025-04-30;Contrôle technique;;"'=HYPERLINK\(""http:\/\/exemple\.invalid""\)";;Favorable;Saisie par le propriétaire$/);
  assert.equal(lignes[3], "Kilométrage;2026-09-01;;86000;;;;Relevé du propriétaire");
});

test("nom du fichier : sans accents ni espaces", () => {
  assert.equal(nomFichierExport(vehicule, "2026-09-17"), "nexora-dossier-skoda-octavia-combi-2026-09-17.csv");
});
