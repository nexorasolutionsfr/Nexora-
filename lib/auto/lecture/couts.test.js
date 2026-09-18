import assert from "node:assert/strict";
import test from "node:test";

import { coutMicroUsd, formaterUsd, reserveMicroUsd } from "./couts.js";
import { configurationLecture, MODELE_PAR_DEFAUT } from "./configuration.js";
import { LIMITES_LECTURE, compterPagesPdf, lisibleAutomatiquement } from "./limites.js";

test("Coût : 6 000 jetons en entrée et 600 en sortie sur Haiku 4.5 ≈ 0,009 $ (estimation)", () => {
  assert.equal(coutMicroUsd({ input_tokens: 6000, output_tokens: 600 }, MODELE_PAR_DEFAUT), 9000);
  assert.equal(formaterUsd(9000), "0,0090 $");
  assert.equal(coutMicroUsd({ input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 1000 }, MODELE_PAR_DEFAUT), 1100);
  assert.equal(coutMicroUsd({ input_tokens: 10 }, "modele-inconnu"), null);
  assert.equal(reserveMicroUsd({ jetonsEntree: LIMITES_LECTURE.jetonsEntreeMax, jetonsSortieMax: LIMITES_LECTURE.jetonsSortieMax }, MODELE_PAR_DEFAUT), 32500);
});

test("Configuration : gratuite par défaut ; payante seulement demandée, avec clé et budget, hors Production", () => {
  assert.deepEqual(configurationLecture({}), {
    disponible: true,
    fournisseur: "texte_pdf",
    modele: "regles-1",
    gratuit: true,
    formats: ["application/pdf"],
    budgetMicroUsd: null,
    lecturesParCompte24h: 10,
  });
  assert.equal(configurationLecture({ ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5" }).fournisseur, "texte_pdf", "une clé présente ne suffit pas à payer");
  assert.deepEqual(configurationLecture({ AUTO_LECTURE_FOURNISSEUR: "aucun" }), { disponible: false, raison: "desactivee" });
  assert.deepEqual(configurationLecture({ AUTO_LECTURE_FOURNISSEUR: "autre" }), { disponible: false, raison: "fournisseur_inconnu" });

  const payante = { AUTO_LECTURE_FOURNISSEUR: "anthropic" };
  assert.deepEqual(configurationLecture(payante), { disponible: false, raison: "cle_absente" });
  assert.deepEqual(configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x" }), { disponible: false, raison: "budget_absent" });
  assert.deepEqual(configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "0" }), { disponible: false, raison: "budget_absent" });
  assert.deepEqual(configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5", VERCEL_ENV: "production" }), { disponible: false, raison: "production" });
  assert.deepEqual(
    configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5", NEXT_PUBLIC_SUPABASE_URL: "https://omphppsmhmyllapdqevn.supabase.co" }),
    { disponible: false, raison: "production" },
  );
  assert.deepEqual(configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5", AUTO_LECTURE_MODELE: "claude-opus-5" }), { disponible: false, raison: "modele_sans_tarif" });
  assert.deepEqual(
    configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://slawilafseganlbghgwx.supabase.co" }),
    { disponible: false, raison: "previsualisation" },
    "jamais de lecture payante sur une prévisualisation, même reliée à Test",
  );
  const activee = configurationLecture({ ...payante, ANTHROPIC_API_KEY: "x", AUTO_LECTURE_BUDGET_USD: "5", AUTO_LECTURE_QUOTA_24H: "20" });
  assert.deepEqual([activee.fournisseur, activee.modele, activee.gratuit, activee.budgetMicroUsd, activee.lecturesParCompte24h], ["anthropic", MODELE_PAR_DEFAUT, false, 5000000, 20]);
  assert.equal(configurationLecture({ AUTO_LECTURE_QUOTA_24H: "5000" }).lecturesParCompte24h, 50);
  assert.equal(configurationLecture({ AUTO_LECTURE_QUOTA_24H: "n'importe" }).lecturesParCompte24h, 10);
});

const pdf = (corps) => new TextEncoder().encode(`%PDF-1.4\n${corps}\n%%EOF`);

test("Limites : pages d'un PDF, format, taille", () => {
  assert.equal(compterPagesPdf(pdf("1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >> endobj 2 0 obj << /Type /Page >> endobj 3 0 obj << /Type /Page >> endobj")), 2);
  assert.equal(compterPagesPdf(pdf("1 0 obj << /Count 7 /Type /Pages >> endobj")), 7);
  assert.equal(compterPagesPdf(pdf("<< /Filter /FlateDecode >> stream xxx endstream")), null);
  assert.equal(compterPagesPdf(new TextEncoder().encode("pas un pdf")), null);

  assert.deepEqual(lisibleAutomatiquement({ typeMime: "image/jpeg", taille: 800000 }), { lisible: true });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "image/heic", taille: 800000 }), { lisible: false, raison: "format" });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "image/png", taille: 6 * 1024 * 1024 }), { lisible: false, raison: "taille" });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "application/pdf", taille: 300000, pages: 5 }), { lisible: false, raison: "pages" });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "application/pdf", taille: 300000, pages: null }), { lisible: true });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "application/pdf", taille: 2 * 1024 * 1024, pages: null }), { lisible: false, raison: "pages" });
  assert.deepEqual(lisibleAutomatiquement({ typeMime: "image/jpeg", taille: 800000, formats: ["application/pdf"] }), { lisible: false, raison: "format" }, "photo non lue par la lecture gratuite");
});
