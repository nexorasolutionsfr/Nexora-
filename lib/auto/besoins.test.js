import assert from "node:assert/strict";
import test from "node:test";

import { BESOINS, CONSTATS, besoinParCode, immobilise, precisionsPour, prestationPour, resumeProbleme, securite } from "./besoins.js";

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

test("resumeProbleme écrit une phrase, pas une liste de choix recollés", () => {
  // Avant le 18 sept. 2026 : « Quelque chose a changé au freinage, depuis
  // quelques jours, en freinant. » — le constat et le moment se répétaient.
  assert.equal(resumeProbleme({ constat: "freinage", depuis: "quelques_jours", precision: "bruit" }), "Un bruit au freinage, depuis quelques jours.");
  assert.equal(resumeProbleme({ constat: "voyant", depuis: "aujourdhui", precision: "rouge" }), "Un voyant rouge allumé au tableau de bord, constaté aujourd'hui.");
  assert.equal(
    resumeProbleme({ constat: "fuite", depuis: "longtemps", precision: "rouge", complement: "Sous le moteur, côté droit." }),
    "Une tache rouge ou rose sous la voiture, depuis longtemps. Sous le moteur, côté droit.",
  );
  // Sans précision, le constat suffit ; sans date non plus, la phrase tient.
  assert.equal(resumeProbleme({ constat: "bruit", depuis: "longtemps" }), "Un bruit inhabituel, depuis longtemps.");
  assert.equal(resumeProbleme({ constat: "bruit" }), "Un bruit inhabituel.");
  // Rien de choisi : on ne fabrique pas de phrase.
  assert.equal(resumeProbleme({}), "");
  assert.equal(resumeProbleme({ complement: "  " }), "");
  assert.equal(resumeProbleme({ complement: "Bruit au démarrage" }), "Bruit au démarrage");
});

test("chaque constat pose SA question, et chaque réponse porte une phrase entière", () => {
  for (const c of CONSTATS) {
    const jeu = precisionsPour(c.code);
    assert.ok(jeu, `« ${c.libelle} » n'a pas de deuxième question`);
    assert.ok(jeu.question.endsWith("?"), `${c.code} : la question n'en est pas une`);
    assert.ok(jeu.options.length >= 4, `${c.code} : trop peu de réponses`);
    for (const o of jeu.options) {
      // Le sujet se lit seul : c'est lui qui devient la phrase.
      assert.ok(o.sujet && o.sujet === o.sujet.toLowerCase().charAt(0) + o.sujet.slice(1), `${c.code}/${o.code} : sujet mal formé`);
      assert.match(resumeProbleme({ constat: c.code, precision: o.code }), /^[A-ZÀÉÈÎÔÛ].*\.$/u);
    }
  }
});

test("une question adaptée n'est pas une question qui diagnostique", () => {
  const nomsDePieces = /plaquette|disque|batterie|embrayage|alternateur|injecteur|courroie|amortisseur|démarreur|turbo|joint de culasse|liquide de refroidissement|huile moteur/i;
  for (const c of CONSTATS) {
    assert.doesNotMatch(c.libelle, nomsDePieces, `« ${c.libelle} » nomme une pièce`);
    for (const o of precisionsPour(c.code).options) {
      assert.doesNotMatch(o.libelle, nomsDePieces, `${c.code}/${o.code} : « ${o.libelle} » nomme une pièce`);
      assert.doesNotMatch(o.sujet, nomsDePieces, `${c.code}/${o.code} : « ${o.sujet} » nomme une pièce`);
    }
  }
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

test("« ne prenez pas la route » ne s'affiche que là où cela veut dire quelque chose", () => {
  // Ce qui touche à la maîtrise du véhicule.
  assert.equal(securite("freinage"), true);
  assert.equal(securite("tenue"), true);
  assert.equal(securite("odeur"), true);
  // Une voiture qui ne démarre pas ne prend la route nulle part : le message
  // y était un contresens, l'assistance reste la prestation qui correspond.
  assert.equal(securite("demarrage"), false);
  assert.equal(immobilise("demarrage"), true);
  assert.equal(securite("bruit"), false);
  assert.equal(securite("inconnu"), false);

  // « Un voyant » est trop vague pour rappeler quoi que ce soit ; la réponse,
  // elle, peut l'être. Nexora ne dit toujours pas ce que signifie ce voyant.
  assert.equal(securite("voyant"), false);
  assert.equal(securite("voyant", "rouge"), true);
  assert.equal(securite("voyant", "clignote"), true);
  assert.equal(securite("voyant", "orange"), false);
  assert.equal(securite("voyant", "inconnu"), false);
});

test("les constats restent des observations, pas des pannes nommées", () => {
  for (const c of CONSTATS) {
    assert.doesNotMatch(c.libelle, /plaquette|disque|batterie morte|embrayage|alternateur|injecteur/i, `« ${c.libelle} » nomme une pièce`);
  }
});
