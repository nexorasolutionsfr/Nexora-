import assert from "node:assert/strict";
import test from "node:test";

import { TAILLE_MAX_OCTETS, cheminDocument, nomAffichable, tailleLisible, typeMimeDe, verifierFichier } from "./documents.js";

test("typeMimeDe : le type donné, sinon l'extension", () => {
  assert.equal(typeMimeDe({ type: "application/pdf", name: "facture.pdf" }), "application/pdf");
  assert.equal(typeMimeDe({ type: "", name: "IMG_0042.HEIC" }), "image/heic");
  assert.equal(typeMimeDe({ type: "", name: "photo.jpeg" }), "image/jpeg");
  assert.equal(typeMimeDe({ type: "application/zip", name: "archive.zip" }), null);
});

test("verifierFichier : format, vide, 10 Mo", () => {
  assert.deepEqual(verifierFichier({ type: "image/png", name: "pv.png", size: 2048 }), { valide: true, typeMime: "image/png" });
  assert.equal(verifierFichier(null).erreur, "Choisissez un fichier.");
  assert.match(verifierFichier({ type: "text/plain", name: "a.txt", size: 10 }).erreur, /Format non accepté/);
  assert.equal(verifierFichier({ type: "application/pdf", name: "vide.pdf", size: 0 }).erreur, "Ce fichier est vide.");
  assert.equal(verifierFichier({ type: "application/pdf", name: "gros.pdf", size: TAILLE_MAX_OCTETS + 1 }).erreur, "Fichier trop lourd : 10 Mo au plus.");
});

test("cheminDocument : propriétaire, voiture, fichier", () => {
  assert.equal(
    cheminDocument({ proprietaireId: "u-1", vehiculeId: "v-2", identifiant: "f-3", typeMime: "image/heic" }),
    "u-1/v-2/f-3.heic",
  );
});

test("nomAffichable et tailleLisible", () => {
  assert.equal(nomAffichable("  facture.pdf "), "facture.pdf");
  assert.equal(nomAffichable(""), "document");
  assert.equal(nomAffichable("a".repeat(300)).length, 199);
  assert.equal(tailleLisible(512), "512 o");
  assert.equal(tailleLisible(120000), "117 Ko");
  assert.equal(tailleLisible(3.5 * 1024 * 1024), "3,5 Mo");
});
