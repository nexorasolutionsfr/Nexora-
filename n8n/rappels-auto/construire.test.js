import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { JOURNALISEUR_ID } from "../socle-envois/construire.mjs";
import { VARIANTES, construireRappels } from "./construire.mjs";

// Un nœud Code de n8n est le corps d'une fonction asynchrone : `return` y est
// permis. On le compile ainsi, sans l'exécuter.
function compiler(nom, code) {
  try {
    new vm.Script(`(async function () {\n${code}\n})`);
  } catch (e) {
    throw new Error(`nœud « ${nom} » : ${e.message}`);
  }
}

function variantes() {
  process.env.RECETTE_PROPRIETAIRES = "00000000-0000-4000-8000-000000000001";
  process.env.ESSAI_PROPRIETAIRE = "00000000-0000-4000-8000-000000000002";
  process.env.ESSAI_DESTINATAIRE = "Quelqu.Un@exemple.invalid";
  return Object.fromEntries(Object.entries(VARIANTES).map(([cle, f]) => [cle, construireRappels(f())]));
}

test("chaque nœud de code de chaque variante compile (défaut du 18 sept. 2026 : une apostrophe mal échappée)", () => {
  for (const [cle, w] of Object.entries(variantes())) {
    for (const n of w.nodes.filter((x) => x.type === "n8n-nodes-base.code")) compiler(`${cle} / ${n.name}`, n.parameters.jsCode);
  }
});

test("chaque liaison vise un nœud qui existe", () => {
  for (const [cle, w] of Object.entries(variantes())) {
    const noms = new Set(w.nodes.map((n) => n.name));
    for (const [de, c] of Object.entries(w.connections)) {
      assert.ok(noms.has(de), `${cle} : source inconnue ${de}`);
      for (const sortie of c.main) for (const l of sortie) assert.ok(noms.has(l.node), `${cle} : cible inconnue ${l.node}`);
    }
  }
});

test("Production : inactif, tous les quarts d'heure, journaliseur du socle, aucune trace de recette", () => {
  const w = variantes().production;
  assert.equal(w.active, false);
  assert.deepEqual(w.nodes.filter((n) => /Trigger$/.test(n.type)).map((n) => n.type), ["n8n-nodes-base.scheduleTrigger"]);
  assert.equal(w.settings.errorWorkflow, JOURNALISEUR_ID);
  const texte = JSON.stringify(w);
  assert.doesNotMatch(texte, /slawilafseganlbghgwx|\.invalid|RECETTE|Garde de l'essai/);
});

test("essai réel : à la main seulement, sans boucle, une adresse, un compte, base Test", () => {
  const w = variantes()["essai-reel"];
  assert.deepEqual(w.nodes.filter((n) => /Trigger$/.test(n.type)).map((n) => n.type), ["n8n-nodes-base.manualTrigger"]);
  const noms = w.nodes.map((n) => n.name);
  assert.ok(!noms.includes("Encore un ?"), "aucune boucle");
  const garde = w.nodes.find((n) => n.name === "Garde de l'essai");
  assert.match(garde.parameters.jsCode, /const AUTORISEE = "quelqu\.un@exemple\.invalid";/);
  assert.deepEqual(w.connections["Vérifier avant envoi"].main[0].map((l) => l.node), ["Garde de l'essai"]);
  const reserver = w.nodes.find((n) => n.name === "Réserver la file");
  assert.match(reserver.parameters.jsonBody, /"p_proprietaires": \["00000000-0000-4000-8000-000000000002"\]/);
  for (const n of w.nodes.filter((x) => x.parameters?.url)) assert.match(n.parameters.url, /^https:\/\/slawilafseganlbghgwx\.supabase\.co\//);
  assert.equal(w.nodes.find((n) => n.type === "n8n-nodes-base.emailSend").credentials.smtp.name, "SMTP Brevo — envois métier");
});

test("la garde de l'essai refuse toute autre adresse et toute deuxième tentative", async () => {
  const w = variantes()["essai-reel"];
  const code = w.nodes.find((n) => n.name === "Garde de l'essai").parameters.jsCode;
  const garde = (json) => vm.runInNewContext(`(async function () {\n${code}\n})()`, { $json: json, Number, String });
  const pret = { pret: true, motif_verification: null, tentatives: 1 };
  assert.equal((await garde({ ...pret, destinataire: "quelqu.un@exemple.invalid" }))[0].json.pret, true);
  assert.equal((await garde({ ...pret, destinataire: " Quelqu.Un@Exemple.invalid " }))[0].json.pret, true, "casse et espaces ignorés");
  const autre = (await garde({ ...pret, destinataire: "autre@exemple.invalid" }))[0].json;
  assert.equal(autre.pret, false);
  assert.match(autre.motif_verification, /destinataire non autorisé/);
  const reprise = (await garde({ ...pret, destinataire: "quelqu.un@exemple.invalid", tentatives: 2 }))[0].json;
  assert.equal(reprise.pret, false);
  assert.match(reprise.motif_verification, /une seule tentative/);
  // Déjà refusé avant la garde : le motif d'origine est gardé.
  const vide = (await garde({ pret: false, motif_verification: "message vide, rien n'est parti", destinataire: "quelqu.un@exemple.invalid", tentatives: 1 }))[0].json;
  assert.equal(vide.motif_verification, "message vide, rien n'est parti");
});

// La procédure d'activation importe production.json tel quel : il doit être la
// sortie exacte du constructeur, embarquement de lib/auto/rappels.js compris.
// Sinon : node n8n/rappels-auto/construire.mjs, puis relire la différence.
test("production.json est à jour avec le constructeur et le module embarqué", () => {
  const attendu = JSON.stringify(construireRappels(VARIANTES.production()), null, 2) + "\n";
  assert.equal(readFileSync(new URL("./production.json", import.meta.url), "utf8"), attendu);
});
