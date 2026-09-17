import assert from "node:assert/strict";
import test from "node:test";

import {
  champsCorriges,
  incoherencesKilometrage,
  interventionsRessemblantes,
  libelleOperations,
  modeInitial,
  plaqueDifferente,
  saisieDepuisProposition,
  typePrincipal,
  validerFacture,
  voitureDeLaPlaque,
} from "./factures.js";
import { empreinteSha256 } from "./empreinte.js";

const AUJOURDHUI = "2026-09-16";
const lue = (valeur) => ({ valeur, certitude: "lue" });
const absente = { valeur: null, certitude: "absente" };

const proposition = {
  estFacture: true,
  champs: {
    dateFacture: lue("2026-03-14"),
    dateIntervention: absente,
    professionnel: { valeur: "Garage des Tilleuls", certitude: "incertaine" },
    immatriculation: lue("GH456JK"),
    kilometrage: absente,
    montantTtc: lue(412.5),
  },
  operations: [
    { libelle: "Vidange + filtre", type: "vidange", certitude: "lue" },
    { libelle: "Plaquettes avant", type: "freinage", certitude: "lue" },
  ],
};

test("Saisie : date de facture proposée comme date d'intervention, à vérifier ; absents vides", () => {
  const { saisie, incertains, nonLus, immatriculationLue } = saisieDepuisProposition(proposition);
  assert.equal(saisie.dateIntervention, "2026-03-14");
  assert.equal(saisie.dateFacture, "2026-03-14");
  assert.ok(incertains.has("dateIntervention"));
  assert.ok(incertains.has("professionnel"));
  assert.ok(nonLus.has("kilometrage"));
  assert.equal(saisie.kilometrage, "");
  assert.equal(saisie.montant, "412,5");
  assert.equal(saisie.type, "freinage");
  assert.equal(immatriculationLue, "GH456JK");
  assert.deepEqual(saisieDepuisProposition(null).saisie.operations, []);
});

test("Type principal : la révision explicite l'emporte ; une vidange seule reste vidange", () => {
  assert.equal(typePrincipal([{ type: "vidange" }, { type: "revision" }]), "revision");
  assert.equal(typePrincipal([{ type: "vidange" }]), "vidange");
  assert.equal(typePrincipal([]), "autre");
  assert.equal(libelleOperations([{ libelle: " Vidange " }, { libelle: "" }, { libelle: "Plaquettes" }]), "Vidange ; Plaquettes");
});

test("Validation : plusieurs opérations, un seul montant total ; dates distinctes contrôlées", () => {
  const { saisie } = saisieDepuisProposition(proposition);
  const r = validerFacture({ ...saisie, dateIntervention: "2026-03-13", kilometrage: "58 200" }, { aujourdhui: AUJOURDHUI });
  assert.equal(r.valide, true);
  assert.equal(r.donnees.montantTtc, 412.5);
  assert.equal(r.donnees.operations.length, 2);
  assert.equal(r.donnees.libelle, "Vidange + filtre ; Plaquettes avant");
  assert.equal(r.donnees.realiseLe, "2026-03-13");
  assert.equal(r.donnees.dateFacture, "2026-03-14");
  assert.equal(r.donnees.kilometrage, 58200);

  const avant = validerFacture({ ...saisie, dateIntervention: "2026-03-20" }, { aujourdhui: AUJOURDHUI });
  assert.match(avant.avertissements.dateFacture, /avant l'intervention/);
  const faux = validerFacture({ ...saisie, dateIntervention: "2026-10-01", montant: "douze", type: "" }, { aujourdhui: AUJOURDHUI });
  assert.deepEqual(Object.keys(faux.erreurs).sort(), ["dateIntervention", "montant", "type"]);
});

test("Doublon potentiel : même date et même montant, ou même type sans montant ; jamais seulement la date", () => {
  const historique = [
    { id: "a", type: "vidange", realise_le: "2026-03-13", montant_ttc: "412.50" },
    { id: "b", type: "freinage", realise_le: "2026-03-13", montant_ttc: null },
    { id: "c", type: "pneus", realise_le: "2026-03-13", montant_ttc: 80 },
    { id: "d", type: "freinage", realise_le: "2026-03-12", montant_ttc: 412.5 },
  ];
  assert.deepEqual(interventionsRessemblantes(historique, { realiseLe: "2026-03-13", montantTtc: 412.5, type: "freinage" }).map((h) => h.id), ["a", "b"]);
  assert.deepEqual(interventionsRessemblantes(historique, { realiseLe: "2026-03-13", montantTtc: null, type: "lavage" }).map((h) => h.id), []);
  assert.deepEqual(interventionsRessemblantes(historique, { realiseLe: null, montantTtc: 412.5, type: "freinage" }), []);
});

test("Kilométrage : une facture ancienne n'écrase rien ; les contradictions sont montrées", () => {
  const dossier = { releves: [{ releve_le: "2026-09-12", kilometrage: 61400 }], historique: [{ realise_le: "2025-10-01", kilometrage: 47000 }] };
  assert.deepEqual(incoherencesKilometrage(dossier, { date: "2024-05-02", kilometrage: 31000 }), []);
  assert.deepEqual(incoherencesKilometrage(dossier, { date: "2026-03-13", kilometrage: 58200 }), []);
  const conflits = incoherencesKilometrage(dossier, { date: "2026-03-13", kilometrage: 42000 });
  assert.deepEqual(conflits.map((p) => p.date), ["2025-10-01"]);
  assert.deepEqual(incoherencesKilometrage(dossier, { date: "2024-05-02", kilometrage: 65000 }).map((p) => p.date), ["2025-10-01", "2026-09-12"]);
});

test("Plaque, corrections mesurées sans valeurs, empreinte du fichier", async () => {
  assert.equal(plaqueDifferente({ immatriculation: "GH456JK" }, "gh-456-jk"), false);
  assert.equal(plaqueDifferente({ immatriculation: "GH456JK" }, "AB123CD"), true);
  assert.equal(plaqueDifferente({ immatriculation: null }, "AB123CD"), false);

  const { saisie } = saisieDepuisProposition(proposition);
  const finale = { ...saisie, kilometrage: "58200", operations: [...saisie.operations, { type: "autre", libelle: "  " }] };
  assert.deepEqual(champsCorriges(saisie, finale), ["kilometrage"]);

  const e = await empreinteSha256(new TextEncoder().encode("facture").buffer);
  assert.match(e, /^[0-9a-f]{64}$/);
  assert.equal(e, await empreinteSha256(new Blob(["facture"])));
});

test("Devis ou attestation : gardé comme document par défaut, jamais comme intervention", () => {
  assert.equal(modeInitial({ ...proposition, estFacture: false }), "document");
  assert.equal(modeInitial(proposition), "intervention");
  assert.equal(modeInitial(null), "intervention", "sans lecture : saisie manuelle d'une facture");
});

test("voitureDeLaPlaque : la plaque lue est celle d'une autre voiture du garage", () => {
  const garage = [
    { id: "a", marque: "Toyota", modele: "Yaris", immatriculation: null },
    { id: "b", marque: "Peugeot", modele: "308", immatriculation: "AB-123-CD" },
  ];
  // La voiture regardée n'a pas de plaque : `plaqueDifferente` ne voit rien,
  // celle-ci reconnaît la 308.
  assert.equal(voitureDeLaPlaque(garage, "AB123CD", "a")?.id, "b");
  // Formats différents, même plaque.
  assert.equal(voitureDeLaPlaque(garage, "ab 123 cd", "a")?.id, "b");
  // C'est déjà la bonne voiture : rien à signaler.
  assert.equal(voitureDeLaPlaque(garage, "AB-123-CD", "b"), null);
  // Plaque inconnue du garage : rien à signaler ici.
  assert.equal(voitureDeLaPlaque(garage, "ZZ-999-ZZ", "a"), null);
  // Rien de lu, ou pas de garage.
  assert.equal(voitureDeLaPlaque(garage, null, "a"), null);
  assert.equal(voitureDeLaPlaque(null, "AB123CD", "a"), null);
});
