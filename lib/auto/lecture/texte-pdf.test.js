import assert from "node:assert/strict";
import test from "node:test";

import { ErreurLecture } from "./anthropic.js";
import { creerFournisseurTextePdf } from "./texte-pdf.js";

const base64 = Buffer.from("%PDF-1.4 factice").toString("base64");

test("Texte PDF : gratuit, lit le texte extrait et rend le format commun", async () => {
  const f = creerFournisseurTextePdf({ extraire: async () => ["Garage Exemple\nFacture 12 du 03/03/2026\nKm : 12 000\nTotal TTC 99,00 €"] });
  assert.equal(f.gratuit, true);
  assert.deepEqual(await f.compterJetons(), { jetonsEntree: 0 });
  const { brut, usage } = await f.lire({ typeMime: "application/pdf", base64 });
  assert.equal(usage, null);
  assert.deepEqual(brut.montant_ttc, { valeur: 99, certitude: "lue" });
  assert.deepEqual(brut.kilometrage, { valeur: 12000, certitude: "lue" });
});

test("Texte PDF : scan sans texte, PDF abîmé, photo : échec non facturé, rien d'inventé", async () => {
  const cas = [
    [creerFournisseurTextePdf({ extraire: async () => ["   ", ""] }), "application/pdf", "pdf_sans_texte"],
    [creerFournisseurTextePdf({ extraire: async () => { throw new Error("corrompu"); } }), "application/pdf", "pdf_illisible"],
    [creerFournisseurTextePdf({ extraire: async () => assert.fail("pas d'extraction") }), "image/jpeg", "format_non_lu"],
  ];
  for (const [f, typeMime, code] of cas) {
    await assert.rejects(f.lire({ typeMime, base64 }), (e) => e instanceof ErreurLecture && e.code === code && e.facturation === "non_facturee", code);
  }
});

test("Texte PDF : vraie extraction par unpdf sur un PDF minimal", async () => {
  // PDF d'une page contenant « Total TTC 12,50 EUR Facture 1 du 01/02/2026 ».
  const contenu = "BT /F1 12 Tf 20 100 Td (Facture 1 du 01/02/2026 - Total TTC 12,50 EUR - paiement CB) Tj ET";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const positions = [];
  objets.forEach((o, i) => {
    positions.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const { brut } = await creerFournisseurTextePdf().lire({ typeMime: "application/pdf", base64: Buffer.from(pdf, "latin1").toString("base64") });
  assert.deepEqual(brut.montant_ttc, { valeur: 12.5, certitude: "lue" });
  assert.deepEqual(brut.date_facture, { valeur: "2026-02-01", certitude: "lue" });
});

test("Texte PDF : trop de pages une fois ouvert, extraction trop longue : échec non facturé", async () => {
  const { TropDePages } = await import("./texte-pdf.js");
  const tropLong = creerFournisseurTextePdf({ extraire: async (_octets, { pagesMax }) => { assert.equal(pagesMax, 4); throw new TropDePages(); } });
  await assert.rejects(tropLong.lire({ typeMime: "application/pdf", base64 }), (e) => e.code === "pdf_trop_long" && e.facturation === "non_facturee");
  const lent = creerFournisseurTextePdf({ delaiMs: 20, extraire: () => new Promise((r) => setTimeout(() => r(["texte"]), 500)) });
  await assert.rejects(lent.lire({ typeMime: "application/pdf", base64 }), (e) => e.code === "delai_depasse" && e.facturation === "non_facturee");
});

test("Texte PDF : un vrai PDF de 5 pages est refusé après ouverture, même si son décompte brut ment", async () => {
  const pages = 5;
  const objets = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${pages} >>`];
  for (let i = 0; i < pages; i += 1) objets.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>");
  let pdf = "%PDF-1.4\n";
  const decalages = [];
  objets.forEach((o, i) => {
    decalages.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${decalages.map((d) => `${String(d).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const f = creerFournisseurTextePdf();
  await assert.rejects(f.lire({ typeMime: "application/pdf", base64: Buffer.from(pdf).toString("base64") }), (e) => e.code === "pdf_trop_long");
});
