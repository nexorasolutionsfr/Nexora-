import assert from "node:assert/strict";
import test from "node:test";

import { BESOINS, CONSTATS, besoinParCode, immobilise, prestationPour, resumeProbleme } from "./besoins.js";

test("chaque besoin renvoie à des services qui existent", async () => {
  const { SERVICES } = await import("../../components/auto/services.js");
  const codes = new Set(SERVICES.map((s) => s.code));
  for (const besoin of BESOINS) {
    for (const code of besoin.services) {
      assert.ok(codes.has(code), `${besoin.code} renvoie à « ${code} », qui n'existe pas`);
    }
  }
});

test("besoinParCode ne devine pas", () => {
  assert.equal(besoinParCode("entretenir")?.titre, "Entretenir ma voiture");
  assert.equal(besoinParCode("inconnu"), null);
  assert.equal(besoinParCode(undefined), null);
});

test("resumeProbleme met des mots, sans rien conclure", () => {
  assert.equal(
    resumeProbleme({ constat: "bruit", depuis: "quelques_jours", quand: "freinant" }),
    "Un bruit inhabituel, depuis quelques jours, en freinant.",
  );
  assert.equal(
    resumeProbleme({ constat: "bruit", depuis: "quelques_jours", quand: "freinant", precision: "Plutôt à l'avant droit." }),
    "Un bruit inhabituel, depuis quelques jours, en freinant. Plutôt à l'avant droit.",
  );
  // Rien de choisi : on ne fabrique pas de phrase.
  assert.equal(resumeProbleme({}), "");
  assert.equal(resumeProbleme({ precision: "  " }), "");
  // Une précision seule reste utile.
  assert.equal(resumeProbleme({ precision: "Bruit au démarrage" }), "Bruit au démarrage");
});

test("la prestation suit le besoin exprimé, jamais une cause supposée", () => {
  // Un bruit au freinage ne conclut PAS à un problème de freins.
  assert.equal(prestationPour("freinage"), "diagnostic");
  assert.equal(prestationPour("bruit"), "diagnostic");
  assert.equal(prestationPour("voyant"), "diagnostic");
  // Ne plus pouvoir rouler, c'est l'assistance.
  assert.equal(prestationPour("demarrage"), "assistance_panne");
  assert.equal(prestationPour("odeur"), "assistance_panne");
  assert.equal(immobilise("demarrage"), true);
  assert.equal(immobilise("bruit"), false);
  assert.equal(immobilise("inconnu"), false);
});

test("les constats restent des observations, pas des pannes nommées", () => {
  for (const c of CONSTATS) {
    assert.doesNotMatch(c.libelle, /plaquette|disque|batterie morte|embrayage|alternateur|injecteur/i, `« ${c.libelle} » nomme une pièce`);
  }
});
