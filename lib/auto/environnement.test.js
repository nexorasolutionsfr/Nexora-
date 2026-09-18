import assert from "node:assert/strict";
import test from "node:test";

import { PROJET_PRODUCTION, PROJET_TEST, analyserCle, libelleProjet, projetDepuisAdresse, verdictProjet } from "./environnement.js";

// Une clé factice au format des clés historiques : en-tête.charge.signature.
const jeton = (charge) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(charge)).toString("base64url")}.signature-factice`;
const PUBLIQUE_TEST = jeton({ iss: "supabase", ref: PROJET_TEST, role: "anon" });
const SERVICE_TEST = jeton({ iss: "supabase", ref: PROJET_TEST, role: "service_role" });
const PUBLIQUE_PROD = jeton({ iss: "supabase", ref: PROJET_PRODUCTION, role: "anon" });

test("projet : lu dans l'adresse, rien d'autre", () => {
  assert.equal(projetDepuisAdresse(`https://${PROJET_TEST}.supabase.co`), PROJET_TEST);
  assert.equal(projetDepuisAdresse(`https://${PROJET_TEST}.supabase.co/`), PROJET_TEST);
  assert.equal(projetDepuisAdresse(`https://${PROJET_TEST}.supabase.co.exemple.fr`), null, "un domaine qui imite n'est pas le projet");
  assert.equal(projetDepuisAdresse(undefined), null);
  assert.equal(libelleProjet(PROJET_TEST), "Test");
  assert.equal(libelleProjet(PROJET_PRODUCTION), "Production");
});

test("clé : projet et rôle, jamais la clé elle-même", () => {
  assert.deepEqual(analyserCle(PUBLIQUE_TEST), { format: "jwt", projet: PROJET_TEST, role: "anon" });
  assert.deepEqual(analyserCle(SERVICE_TEST), { format: "jwt", projet: PROJET_TEST, role: "service_role" });
  assert.deepEqual(analyserCle("sb_publishable_abc"), { format: "nouvelle", projet: null, role: "anon" });
  assert.deepEqual(analyserCle("sb_secret_abc"), { format: "nouvelle", projet: null, role: "service_role" });
  assert.deepEqual(analyserCle("desactive"), { format: "illisible", projet: null, role: null });
  assert.deepEqual(analyserCle("a.%%%.c"), { format: "illisible", projet: null, role: null });
  assert.deepEqual(analyserCle(""), { format: "absente", projet: null, role: null });
  assert.ok(!JSON.stringify(analyserCle(SERVICE_TEST)).includes("signature-factice"));
});

const bon = () => ({
  navigateur: { projetAdresse: PROJET_TEST, clePublique: { ...analyserCle(PUBLIQUE_TEST), acceptee: true, statut: 200 } },
  serveur: {
    projetAdresse: PROJET_TEST,
    projetAdresseService: PROJET_TEST,
    projetAdresseExecution: PROJET_TEST,
    clePublique: { ...analyserCle(PUBLIQUE_TEST), acceptee: true, statut: 200 },
    cleService: { ...analyserCle(SERVICE_TEST), acceptee: true, statut: 200 },
    projetQuiARepondu: PROJET_TEST,
  },
});

test("verdict : Test confirmé seulement si navigateur et serveur visent Test avec des clés acceptées", () => {
  assert.deepEqual(verdictProjet(bon()), { confirme: true, ecarts: [] });

  const cas = [
    ["navigateur sur la Production", (e) => { e.navigateur.projetAdresse = PROJET_PRODUCTION; }],
    ["clé publique de Production dans le navigateur", (e) => { e.navigateur.clePublique = { ...analyserCle(PUBLIQUE_PROD), acceptee: false, statut: 401 }; }],
    ["clé du navigateur refusée", (e) => { e.navigateur.clePublique.acceptee = false; }],
    ["serveur construit sur la Production", (e) => { e.serveur.projetAdresse = PROJET_PRODUCTION; }],
    ["client de service sur la Production", (e) => { e.serveur.projetAdresseService = PROJET_PRODUCTION; }],
    ["variables d'exécution sur la Production", (e) => { e.serveur.projetAdresseExecution = PROJET_PRODUCTION; }],
    ["clé de service factice", (e) => { e.serveur.cleService = { ...analyserCle("desactive"), acceptee: false, statut: 401 }; }],
    ["clé publique à la place de la clé de service", (e) => { e.serveur.cleService = { ...analyserCle(PUBLIQUE_TEST), acceptee: true, statut: 200 }; }],
    ["réponse d'un autre projet", (e) => { e.serveur.projetQuiARepondu = PROJET_PRODUCTION; }],
    ["réponses incohérentes", (e) => { e.serveur.projetQuiARepondu = "incohérent"; }],
    ["serveur muet", (e) => { e.serveur = null; }],
  ];
  for (const [nom, alterer] of cas) {
    const e = bon();
    alterer(e);
    const v = verdictProjet(e);
    assert.equal(v.confirme, false, nom);
    assert.ok(v.ecarts.length > 0, nom);
  }
});

test("verdict : une nouvelle clé ne porte pas le projet — la réponse du projet en décide", () => {
  const e = bon();
  e.navigateur.clePublique = { ...analyserCle("sb_publishable_abc"), acceptee: true, statut: 200 };
  assert.equal(verdictProjet(e).confirme, true);
  e.navigateur.clePublique.acceptee = false;
  assert.equal(verdictProjet(e).confirme, false);
});
