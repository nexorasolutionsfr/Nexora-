import assert from "node:assert/strict";
import test from "node:test";

import {
  TAILLE_MAX_OCTETS,
  cheminDocument,
  formatReel,
  nomAffichable,
  phraseLimites,
  tailleLisible,
  typeMimeDe,
  verifierContenu,
  verifierFichier,
  verifierFichierComplet,
} from "./documents.js";

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
  assert.equal(nomAffichable("fac\u0000ture\u001F\u007F.pdf"), "facture.pdf", "caractères de contrôle retirés");
  assert.equal(nomAffichable("a".repeat(300)).length, 199);
  assert.equal(tailleLisible(512), "512 o");
  assert.equal(tailleLisible(120000), "117 Ko");
  assert.equal(tailleLisible(3.5 * 1024 * 1024), "3,5 Mo");
});

const octets = (...parties) => {
  const liste = parties.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  const tampon = new Uint8Array(Math.max(32, liste.length));
  tampon.set(liste);
  return tampon;
};

test("formatReel : reconnaît le contenu, pas le nom", () => {
  assert.equal(formatReel(octets("%PDF-1.7\n")), "application/pdf");
  assert.equal(formatReel(octets([0xef, 0xbb, 0xbf], "\n%PDF-1.4")), "application/pdf");
  assert.equal(formatReel(octets([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(formatReel(octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(formatReel(octets("RIFF", [1, 2, 3, 4], "WEBPVP8 ")), "image/webp");
  assert.equal(formatReel(octets([0, 0, 0, 24], "ftypheic")), "image/heic");
  assert.equal(formatReel(octets([0, 0, 0, 24], "ftypmif1")), "image/heif");
  assert.equal(formatReel(octets([0, 0, 0, 24], "ftypavif")), null);
  assert.equal(formatReel(octets('{"statusCode":"400","error":"InvalidJWT"}')), null);
  assert.equal(formatReel(octets("<!DOCTYPE html><html>")), null);
  assert.equal(formatReel(new Uint8Array([0x25, 0x50])), null);
  assert.equal(formatReel(null), null);
});

test("verifierContenu : refuse un faux PDF, garde le vrai format d'une photo mal nommée", () => {
  assert.match(verifierContenu(octets('{"error":"x"}'), "application/pdf").erreur, /ni un PDF ni une photo/);
  assert.deepEqual(verifierContenu(octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg"), { valide: true, typeMime: "image/png" });
  assert.deepEqual(verifierContenu(octets([0, 0, 0, 24], "ftypmif1"), "image/heic"), { valide: true, typeMime: "image/heic" });
  assert.deepEqual(verifierContenu(octets("%PDF-1.7"), "application/pdf"), { valide: true, typeMime: "application/pdf" });
});

test("verifierFichierComplet : nom et taille d'abord, puis contenu", async () => {
  const faux = new File(['{"statusCode":"400"}'], "facture.pdf", { type: "application/pdf" });
  assert.match((await verifierFichierComplet(faux)).erreur, /ni un PDF ni une photo/);
  const vrai = new File(["%PDF-1.7\n1 0 obj\n"], "facture.pdf", { type: "application/pdf" });
  assert.deepEqual(await verifierFichierComplet(vrai), { valide: true, typeMime: "application/pdf" });
  assert.match((await verifierFichierComplet(new File(["abc"], "note.txt", { type: "text/plain" }))).erreur, /Format non accepté/);
});

test("phraseLimites ne promet pas de lire un scan : c'est le TEXTE du PDF qui est lu", () => {
  const pdfSeul = phraseLimites({ lisibles: ["application/pdf"], tailleLectureMax: 5 * 1024 * 1024, pagesMax: 4 });
  assert.match(pdfSeul, /PDF contenant du texte/);
  assert.match(pdfSeul, /un scan, une photo ou un PDF plus lourd est conservé/);
  // Le jour où une photo sera lue, la phrase ne mentira pas dans l'autre sens.
  const avecImages = phraseLimites({ lisibles: ["application/pdf", "image/jpeg"], tailleLectureMax: 5 * 1024 * 1024, pagesMax: 4 });
  assert.doesNotMatch(avecImages, /contenant du texte/);
  assert.match(avecImages, /les documents de moins de 5 Mo/);
});

test("phraseLimites annonce les DEUX limites, celle du dépôt et celle de la lecture", () => {
  const avec = phraseLimites({ lisibles: ["application/pdf"], tailleLectureMax: 5 * 1024 * 1024, pagesMax: 4 });
  assert.match(avec, /10 Mo au plus/);
  assert.match(avec, /moins de 5 Mo/);
  assert.match(avec, /4 pages au plus/);
  // Sans lecture automatique, on n'annonce pas une limite qui ne s'applique pas.
  const sans = phraseLimites({ lisibles: [], tailleLectureMax: null });
  assert.match(sans, /10 Mo au plus/);
  assert.doesNotMatch(sans, /moins de/);
  assert.doesNotMatch(phraseLimites(), /moins de/);
});
