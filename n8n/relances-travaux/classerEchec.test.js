const test = require("node:test");
const assert = require("node:assert/strict");
const { classerEchec } = require("./classerEchec.js");

const r = (e) => classerEchec(e).resultat;

test("aucune connexion : rien n'est parti, à reprendre", () => {
  assert.equal(r({ message: "connect ECONNREFUSED 127.0.0.1:2525", code: "ECONNREFUSED" }), "a_reprendre");
  assert.equal(r({ message: "getaddrinfo ENOTFOUND smtp.exemple.invalid" }), "a_reprendre");
});

test("authentification refusée : à reprendre", () => {
  assert.equal(r({ message: "Invalid login: 535 5.7.8 Authentication failed", code: "EAUTH" }), "a_reprendre");
});

test("refus au RCPT TO : 4xx à reprendre, 5xx bloqué", () => {
  assert.equal(r({ message: "Can't send mail - all recipients were rejected: 451 4.2.1 boîte indisponible" }), "a_reprendre");
  assert.equal(r({ message: "Can't send mail - all recipients were rejected: 550 5.1.1 boîte inexistante" }), "bloque");
  assert.equal(r({ message: "Mail command failed: 421 4.7.0 trop de connexions" }), "a_reprendre");
});

test("champs structurés prioritaires quand ils existent", () => {
  assert.equal(r({ message: "whatever", responseCode: 550, command: "RCPT TO" }), "bloque");
  assert.equal(r({ message: "whatever", responseCode: 452, command: "RCPT TO" }), "a_reprendre");
});

test("refus après le message : le serveur n'a pas pris le message", () => {
  assert.equal(r({ message: "Message failed: 451 4.3.0 réessayez" }), "a_reprendre");
  assert.equal(r({ message: "Message failed: 554 5.7.1 refusé" }), "bloque");
});

test("un nombre 4xx/5xx n'importe où dans le message ne classe rien", () => {
  assert.equal(r({ message: "Connection closed unexpectedly (devis de 550 € pour le 12 rue 451)" }), "incertain");
  assert.equal(r({ message: "Erreur interne 503 du proxy n8n" }), "incertain");
  assert.equal(r({ message: "Timeout 421 ms" }), "incertain");
});

test("coupure, délai, inconnu : incertain, jamais repris", () => {
  assert.equal(r({ message: "Connection closed unexpectedly", code: "ECONNECTION" }), "incertain");
  assert.equal(r({ message: "Timeout", code: "ETIMEDOUT" }), "incertain");
  assert.equal(r({}), "incertain");
  assert.equal(r("chaîne seule"), "incertain");
});

test("le motif garde un extrait borné du message", () => {
  const { motif } = classerEchec({ message: "Message failed: 554 " + "x".repeat(500) });
  assert.ok(motif.length < 300);
});
