// Exécution : node --test components/inspections/photoEnGrand.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MESSAGE_ERREUR_PHOTO,
  actionTouche,
  compteurPhotos,
  indexPrecedent,
  indexSuivant,
  libelleDialogue,
  ouvreAuClavier,
} from "./photoEnGrand.js";

test("une seule photo : la navigation ne bouge pas et le compteur reste vide", () => {
  assert.equal(indexSuivant(0, 1), 0);
  assert.equal(indexPrecedent(0, 1), 0);
  assert.equal(compteurPhotos(0, 1), "");
  assert.equal(actionTouche("ArrowRight", 1), null);
});

test("plusieurs photos : la navigation tourne en boucle dans les deux sens", () => {
  assert.equal(indexSuivant(0, 3), 1);
  assert.equal(indexSuivant(2, 3), 0);
  assert.equal(indexPrecedent(0, 3), 2);
  assert.equal(indexPrecedent(2, 3), 1);
});

test("liste vide ou total invalide : on retombe sur la première photo, jamais sur NaN", () => {
  assert.equal(indexSuivant(0, 0), 0);
  assert.equal(indexPrecedent(0, undefined), 0);
  assert.equal(compteurPhotos(0, 0), "");
});

test("compteur lisible, borné même si l'index déborde", () => {
  assert.equal(compteurPhotos(0, 2), "1 / 2");
  assert.equal(compteurPhotos(1, 2), "2 / 2");
  assert.equal(compteurPhotos(7, 2), "2 / 2");
  assert.equal(compteurPhotos(-3, 2), "1 / 2");
});

test("libellé d'accessibilité construit à partir du point, sans point vide", () => {
  assert.equal(libelleDialogue("Disque de frein avant gauche"), "Photo du constat : Disque de frein avant gauche");
  assert.equal(libelleDialogue("  "), "Photo du constat");
  assert.equal(libelleDialogue(undefined), "Photo du constat");
});

test("clavier : Échap ferme, les flèches naviguent seulement s'il y a plusieurs photos", () => {
  assert.equal(actionTouche("Escape", 1), "fermer");
  assert.equal(actionTouche("Escape", 3), "fermer");
  assert.equal(actionTouche("ArrowRight", 3), "suivante");
  assert.equal(actionTouche("ArrowDown", 3), "suivante");
  assert.equal(actionTouche("ArrowLeft", 3), "precedente");
  assert.equal(actionTouche("ArrowUp", 3), "precedente");
  assert.equal(actionTouche("Enter", 3), null);
  assert.equal(actionTouche("a", 3), null);
});

test("le message d'erreur ne conclut pas à l'expiration du lien", () => {
  assert.match(MESSAGE_ERREUR_PHOTO, /connexion/i);
  assert.match(MESSAGE_ERREUR_PHOTO, /réessayez/i);
  assert.doesNotMatch(MESSAGE_ERREUR_PHOTO, /expiré/i);
});

test("la vignette s'ouvre avec Entrée et Espace, pas avec une autre touche", () => {
  assert.equal(ouvreAuClavier("Enter"), true);
  assert.equal(ouvreAuClavier(" "), true);
  assert.equal(ouvreAuClavier("Spacebar"), true);
  assert.equal(ouvreAuClavier("Escape"), false);
  assert.equal(ouvreAuClavier("a"), false);
  assert.equal(ouvreAuClavier("Tab"), false);
});
