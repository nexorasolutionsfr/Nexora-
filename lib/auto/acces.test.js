import assert from "node:assert/strict";
import test from "node:test";

import { DUREE_MIN_INSCRIPTION_MS, decisionAcces, descriptionEnvironnement, fermetureImposee, traiterInscription } from "./acces.js";

const TEST = "https://slawilafseganlbghgwx.supabase.co";
const PROD = "https://omphppsmhmyllapdqevn.supabase.co";

test("accès : le mode de la base, fermé s'il est illisible ou inconnu", () => {
  assert.deepEqual(decisionAcces({ env: { NEXT_PUBLIC_SUPABASE_URL: TEST }, modeBase: "beta" }), { mode: "beta", raison: null });
  assert.deepEqual(decisionAcces({ env: {}, modeBase: "ouvert" }), { mode: "ouvert", raison: null });
  assert.deepEqual(decisionAcces({ env: {}, modeBase: null, erreurBase: true }), { mode: "ferme", raison: "indisponible" });
  assert.deepEqual(decisionAcces({ env: {}, modeBase: "grand-ouvert" }), { mode: "ferme", raison: "indisponible" });
});

test("accès : interrupteur d'urgence et prévisualisation reliée à la Production, toujours fermés", () => {
  assert.deepEqual(decisionAcces({ env: { AUTO_ACCES: "ferme" }, modeBase: "ouvert" }), { mode: "ferme", raison: "forcee" });
  assert.deepEqual(fermetureImposee({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: PROD }), { mode: "ferme", raison: "previsualisation_production" });
  assert.equal(fermetureImposee({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: TEST }), null);
  assert.equal(fermetureImposee({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD }), null, "la Production elle-même suit le mode de sa base");
  // AUTO_ACCES n'ouvre jamais : seule la valeur « ferme » est prise en compte.
  assert.deepEqual(decisionAcces({ env: { AUTO_ACCES: "ouvert" }, modeBase: "ferme" }), { mode: "ferme", raison: null });
});

function dependances({ invites = [], erreurInscription = null } = {}) {
  const traces = { consultations: [], inscriptions: [], journal: [] };
  return {
    traces,
    estInvite: async (adresse) => (traces.consultations.push(adresse), invites.includes(adresse)),
    inscrire: async (adresse) => (traces.inscriptions.push(adresse), { error: erreurInscription }),
    journal: { error: (...args) => traces.journal.push(args.join(" ")) },
  };
}

test("inscription en bêta : même réponse pour une adresse invitée ou non ; seule l'invitée est inscrite", async () => {
  const d = dependances({ invites: ["invitee@example.invalid"] });
  const invitee = await traiterInscription({ mode: "beta", email: "  Invitee@Example.invalid ", motDePasse: "motdepasse-long", ...d });
  const inconnue = await traiterInscription({ mode: "beta", email: "inconnue@example.invalid", motDePasse: "motdepasse-long", ...d });
  assert.deepEqual(invitee, inconnue);
  assert.deepEqual(invitee, { statut: 200, corps: { etat: "demande_recue" } });
  assert.deepEqual(d.traces.inscriptions, ["invitee@example.invalid"]);
});

test("inscription : erreurs de saisie dites avant toute consultation ; fermé ; ouvert sans liste", async () => {
  const d = dependances({ invites: ["invitee@example.invalid"] });
  assert.deepEqual(await traiterInscription({ mode: "beta", email: "pas-une-adresse", motDePasse: "motdepasse-long", ...d }), { statut: 400, corps: { etat: "invalide", champ: "email" } });
  assert.deepEqual(await traiterInscription({ mode: "beta", email: "invitee@example.invalid", motDePasse: "court", ...d }), { statut: 400, corps: { etat: "invalide", champ: "mot_de_passe" } });
  assert.deepEqual(await traiterInscription({ mode: "ferme", email: "invitee@example.invalid", motDePasse: "motdepasse-long", ...d }), { statut: 403, corps: { etat: "ferme" } });
  assert.deepEqual(d.traces.consultations, [], "rien n'est consulté pour une saisie invalide ou un accès fermé");
  await traiterInscription({ mode: "ouvert", email: "quelconque@example.invalid", motDePasse: "motdepasse-long", ...d });
  assert.deepEqual(d.traces.inscriptions, ["quelconque@example.invalid"]);
  assert.deepEqual(d.traces.consultations, []);
});

test("inscription : un refus de Supabase reste muet pour la personne, et le journal ne contient pas l'adresse", async () => {
  const d = dependances({ invites: ["invitee@example.invalid"], erreurInscription: { code: "over_email_send_rate_limit" } });
  const r = await traiterInscription({ mode: "beta", email: "invitee@example.invalid", motDePasse: "motdepasse-long", ...d });
  assert.equal(r.corps.etat, "demande_recue");
  assert.equal(d.traces.journal.length, 1);
  assert.doesNotMatch(d.traces.journal[0], /invitee/);
  assert.ok(DUREE_MIN_INSCRIPTION_MS >= 1000);
});

test("description de l'environnement : ce qu'il faut pour contrôler une prévisualisation, et rien de plus", () => {
  const preview = descriptionEnvironnement({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: PROD, VERCEL_REGION: "iad1", VERCEL_GIT_COMMIT_REF: "auto/beta-privee", SUPABASE_SERVICE_ROLE_KEY: "secret" });
  assert.deepEqual(preview, { environnement: "preview", base: "production", projetSupabase: "omphppsmhmyllapdqevn", regionFonction: "iad1", branche: "auto/beta-privee" });
  assert.equal(JSON.stringify(preview).includes("secret"), false);
  assert.equal(descriptionEnvironnement({ NEXT_PUBLIC_SUPABASE_URL: TEST }).base, "test");
  assert.equal(descriptionEnvironnement({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }).base, "autre");
  assert.deepEqual(descriptionEnvironnement({}), { environnement: "local", base: "inconnue", projetSupabase: null, regionFonction: null, branche: null });
});
