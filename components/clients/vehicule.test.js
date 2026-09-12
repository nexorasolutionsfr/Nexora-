// Exécution : node --test components/clients/vehicule.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { vehiculeDepuisSaisie } from "./vehicule.js";

test("rien de saisi : pas de véhicule, pas de ligne vide en base", () => {
  assert.equal(vehiculeDepuisSaisie(), null);
  assert.equal(vehiculeDepuisSaisie({ marque: "  ", modele: "", immatriculation: " " }), null);
});

test("une saisie partielle suffit, les trous deviennent null", () => {
  assert.deepEqual(vehiculeDepuisSaisie({ immatriculation: "ab-123-cd" }), { marque: null, modele: null, immatriculation: "AB-123-CD" });
  assert.deepEqual(vehiculeDepuisSaisie({ marque: " Renault ", modele: "Clio IV" }), { marque: "Renault", modele: "Clio IV", immatriculation: null });
});
