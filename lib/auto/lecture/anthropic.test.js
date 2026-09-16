import assert from "node:assert/strict";
import test from "node:test";

import { ErreurLecture, creerFournisseurAnthropic } from "./anthropic.js";

const contenu = { typeMime: "application/pdf", base64: "JVBERi0=" };
const reponse = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

function fournisseur(repondre) {
  const appels = [];
  const f = creerFournisseurAnthropic({
    cle: "cle-de-test",
    modele: "claude-haiku-4-5-20251001",
    fetch: async (url, options) => {
      appels.push({ url, options, corps: JSON.parse(options.body) });
      return repondre(url, options);
    },
  });
  return { f, appels };
}

test("Anthropic : lecture forcée par l'outil, usage rendu, clé dans l'en-tête seulement", async () => {
  const { f, appels } = fournisseur(() =>
    reponse(200, { stop_reason: "tool_use", usage: { input_tokens: 5200, output_tokens: 410 }, content: [{ type: "tool_use", name: "proposer_facture", input: { est_facture_vehicule: true } }] }),
  );
  const r = await f.lire(contenu);
  assert.deepEqual(r.brut, { est_facture_vehicule: true });
  assert.deepEqual(r.usage, { input_tokens: 5200, output_tokens: 410 });
  const { url, options, corps } = appels[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(options.headers["x-api-key"], "cle-de-test");
  assert.equal(corps.model, "claude-haiku-4-5-20251001");
  assert.deepEqual(corps.tool_choice, { type: "tool", name: "proposer_facture" });
  assert.equal(corps.messages[0].content[0].type, "document");
  assert.equal(corps.temperature, 0);
  assert.ok(!JSON.stringify(corps).includes("cle-de-test"));
});

test("Anthropic : photo envoyée comme image ; comptage des jetons sans max_tokens", async () => {
  const { f, appels } = fournisseur(() => reponse(200, { input_tokens: 2100 }));
  assert.deepEqual(await f.compterJetons({ typeMime: "image/jpeg", base64: "AAAA" }), { jetonsEntree: 2100 });
  assert.equal(appels[0].url, "https://api.anthropic.com/v1/messages/count_tokens");
  assert.equal(appels[0].corps.messages[0].content[0].type, "image");
  assert.equal(appels[0].corps.max_tokens, undefined);
});

test("Anthropic : chaque échec dit s'il a pu être facturé", async () => {
  const cas = [
    [() => reponse(429, {}), "trop_de_demandes", "non_facturee"],
    [() => reponse(529, {}), "fournisseur_surcharge", "non_facturee"],
    [() => reponse(500, {}), "refus_fournisseur", "inconnue"],
    [() => reponse(200, { stop_reason: "max_tokens", usage: { input_tokens: 9000, output_tokens: 1500 }, content: [] }), "reponse_tronquee", "facturee"],
    [() => reponse(200, { stop_reason: "end_turn", usage: { input_tokens: 9000, output_tokens: 20 }, content: [{ type: "text", text: "?" }] }), "reponse_sans_proposition", "facturee"],
    [() => { throw new Error("coupure"); }, "delai_depasse", "inconnue"],
  ];
  for (const [repondre, code, facturation] of cas) {
    const { f } = fournisseur(repondre);
    await assert.rejects(f.lire(contenu), (e) => e instanceof ErreurLecture && e.code === code && e.facturation === facturation, code);
  }
});
