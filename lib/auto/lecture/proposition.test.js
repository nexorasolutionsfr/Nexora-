import assert from "node:assert/strict";
import test from "node:test";

import { SCHEMA_PROPOSITION, TYPES_OPERATION, normaliserProposition, typeOperationSur } from "./proposition.js";

const AUJOURDHUI = "2026-09-16";
const lue = (valeur) => ({ valeur, certitude: "lue" });

test("Proposition : valeurs lues conservées, absentes jamais inventées", () => {
  const p = normaliserProposition(
    {
      est_facture_vehicule: true,
      date_facture: lue("2026-03-12"),
      date_intervention: { valeur: null, certitude: "lue" },
      professionnel: lue("  Garage   des Tilleuls "),
      immatriculation: lue("gh-456-jk"),
      kilometrage: lue(58200),
      montant_ttc: lue(189.9),
      operations: [{ libelle: "Vidange + filtre à huile", type: "vidange", certitude: "lue" }],
    },
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(p.estFacture, true);
  assert.deepEqual(p.champs.dateFacture, { valeur: "2026-03-12", certitude: "lue" });
  assert.deepEqual(p.champs.dateIntervention, { valeur: null, certitude: "absente" });
  assert.equal(p.champs.professionnel.valeur, "Garage des Tilleuls");
  assert.equal(p.champs.immatriculation.valeur, "GH456JK");
  assert.equal(p.champs.kilometrage.valeur, 58200);
  assert.equal(p.champs.montantTtc.valeur, 189.9);
  assert.deepEqual(p.operations, [{ libelle: "Vidange + filtre à huile", type: "vidange", certitude: "lue" }]);
});

test("Proposition : date future, date impossible, montant ou kilométrage hors bornes", () => {
  const p = normaliserProposition(
    {
      date_facture: lue("2027-01-01"),
      date_intervention: lue("2026-02-30"),
      kilometrage: lue(5000000),
      montant_ttc: lue(-12),
      professionnel: lue(""),
      operations: "pas une liste",
    },
    { aujourdhui: AUJOURDHUI },
  );
  assert.deepEqual(p.champs.dateFacture, { valeur: "2027-01-01", certitude: "incertaine" }, "signalée, pas corrigée");
  assert.equal(p.champs.dateIntervention.certitude, "absente");
  assert.deepEqual(p.champs.kilometrage, { valeur: null, certitude: "absente" });
  assert.deepEqual(p.champs.montantTtc, { valeur: null, certitude: "absente" });
  assert.equal(p.champs.professionnel.certitude, "absente");
  assert.deepEqual(p.operations, []);
  assert.equal(p.estFacture, false);
  assert.deepEqual(normaliserProposition(null, { aujourdhui: AUJOURDHUI }).operations, []);
});

test("Proposition : une vidange n'est jamais transformée en révision", () => {
  assert.deepEqual(typeOperationSur("Vidange huile moteur 5W30", "revision"), { type: "vidange", rectifie: true });
  assert.deepEqual(typeOperationSur("Remplacement essuie-glaces", "revision"), { type: "autre", rectifie: true });
  assert.deepEqual(typeOperationSur("Révision constructeur 60 000 km", "revision"), { type: "revision", rectifie: false });
  assert.deepEqual(typeOperationSur("Forfait entretien", "revision"), { type: "revision", rectifie: false });
  assert.deepEqual(typeOperationSur("Plaquettes AV", "inexistant"), { type: "autre", rectifie: false });
  const p = normaliserProposition({ operations: [{ libelle: "Vidange", type: "revision", certitude: "lue" }] }, { aujourdhui: AUJOURDHUI });
  assert.deepEqual(p.operations[0], { libelle: "Vidange", type: "vidange", certitude: "incertaine" });
});

test("Proposition : le schéma demandé couvre tous les champs et les types de la base", () => {
  assert.deepEqual(SCHEMA_PROPOSITION.properties.operations.items.properties.type.enum, TYPES_OPERATION);
  for (const cle of SCHEMA_PROPOSITION.required) assert.ok(SCHEMA_PROPOSITION.properties[cle], cle);
  assert.equal(TYPES_OPERATION.length, 12);
});
