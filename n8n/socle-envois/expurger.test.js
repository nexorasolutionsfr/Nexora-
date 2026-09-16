const test = require("node:test");
const assert = require("node:assert/strict");
const { expurger } = require("./expurger.js");

test("retire l'adresse du destinataire d'un refus SMTP, garde le code", () => {
  const t = expurger("Can't send mail - all recipients were rejected: 550 5.1.1 <client.dupont@exemple.fr>: boîte inexistante");
  assert.match(t, /550 5\.1\.1/);
  assert.doesNotMatch(t, /dupont|exemple\.fr/);
});

test("retire un lien public à jeton", () => {
  const t = expurger("Échec sur https://nexora-garage.vercel.app/devis/9f2c1b7a5d3e4f60a1b2c3d4e5f6a7b8 après 20 s");
  assert.doesNotMatch(t, /vercel|9f2c1b7a/);
  assert.match(t, /<lien> après 20 s/);
});

test("retire clés, en-têtes d'autorisation et JWT", () => {
  const t = expurger('headers {"apikey":"sb_secret_abc123","Authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.sig"} xkeysib-0123456789abcdef');
  assert.doesNotMatch(t, /abc123|eyJhbGci|0123456789abcdef/);
});

test("garde les messages réseau utiles", () => {
  assert.equal(
    expurger("The connection cannot be established, this usually occurs due to an incorrect host (domain) value"),
    "The connection cannot be established, this usually occurs due to an incorrect host (domain) value",
  );
  assert.equal(expurger("getaddrinfo ENOTFOUND"), "getaddrinfo ENOTFOUND");
});

test("borne la longueur et accepte l'absence de texte", () => {
  assert.equal(expurger("x".repeat(1000)).length, 300);
  assert.equal(expurger(null), "");
  assert.equal(expurger({ toString: () => "objet" }), "objet");
});
