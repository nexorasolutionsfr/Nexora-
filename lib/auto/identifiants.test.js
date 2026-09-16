import assert from "node:assert/strict";
import test from "node:test";

import { estIdentifiant, identifiantOuNul } from "./identifiants.js";

test("Identifiant : seul un UUID complet est accepté", () => {
  assert.equal(estIdentifiant("deedafb9-3afa-4822-acdd-58fe79d24517"), true);
  assert.equal(estIdentifiant("DEEDAFB9-3AFA-4822-ACDD-58FE79D24517"), true);
  for (const valeur of ["670cab98", "", "nouveau", "deedafb9-3afa-4822-acdd-58fe79d2451", "deedafb9-3afa-4822-acdd-58fe79d24517x", null, undefined, ["deedafb9-3afa-4822-acdd-58fe79d24517"]]) {
    assert.equal(estIdentifiant(valeur), false, String(valeur));
  }
  assert.equal(identifiantOuNul("670cab98"), null);
  assert.equal(identifiantOuNul("deedafb9-3afa-4822-acdd-58fe79d24517"), "deedafb9-3afa-4822-acdd-58fe79d24517");
});
