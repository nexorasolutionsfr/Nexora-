// Lien de confirmation périmé — tests des décisions.
//
// Exécution : node --test components/connexion/lienConfirmation.test.js
//
// Les quatre situations demandées le 12 septembre 2026 : lien périmé sans
// session, lien périmé avec session valide, et — dans renvoiConfirmation —
// renvoi accepté, renvoi refusé ou limité. Plus la règle qui protège la
// connexion : un fragment qui porte une session n'est jamais retiré.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MESSAGE_LIEN_PERIME,
  RAPPEL_DERNIER_MESSAGE,
  adresseSansErreurAuth,
  decisionFragment,
  erreurAuthDansFragment,
  estLienPerime,
  fragmentPorteUneSession,
  messageLienEchoue,
} from "./lienConfirmation.js";
import { messageRenvoi } from "./renvoiConfirmation.js";

const FRAGMENT_PERIME =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
const FRAGMENT_SESSION =
  "#access_token=eyJabc&expires_in=3600&refresh_token=xyz&token_type=bearer&type=signup";

test("le fragment d'erreur est lu tel que Supabase l'écrit", () => {
  const e = erreurAuthDansFragment(FRAGMENT_PERIME);
  assert.equal(e.error, "access_denied");
  assert.equal(e.code, "otp_expired");
  assert.match(e.description, /expired/);
  assert.equal(estLienPerime(e), true);
});

test("un fragment vide, une ancre ou une session ne sont pas des erreurs", () => {
  assert.equal(erreurAuthDansFragment(""), null);
  assert.equal(erreurAuthDansFragment("#"), null);
  assert.equal(erreurAuthDansFragment("#factures"), null);
  assert.equal(erreurAuthDansFragment(FRAGMENT_SESSION), null);
  assert.equal(erreurAuthDansFragment(undefined), null);
  assert.equal(fragmentPorteUneSession(FRAGMENT_SESSION), true);
  assert.equal(fragmentPorteUneSession(FRAGMENT_PERIME), false);
});

test("lien périmé sans session : on explique et on propose un nouvel e-mail", () => {
  assert.equal(decisionFragment({ fragment: FRAGMENT_PERIME, session: null }), "expliquer");
  const message = messageLienEchoue(erreurAuthDansFragment(FRAGMENT_PERIME));
  assert.equal(message, MESSAGE_LIEN_PERIME);
  assert.match(message, /n'est plus valable/);
  assert.match(message, /nouvel e-mail de confirmation/);
});

test("lien périmé avec session valide : on retire l'erreur de l'adresse, sans rien dire", () => {
  const session = { user: { id: "u1" } };
  assert.equal(decisionFragment({ fragment: FRAGMENT_PERIME, session }), "nettoyer");
  assert.equal(
    adresseSansErreurAuth(`http://localhost:3111/dashboard${FRAGMENT_PERIME}`),
    "http://localhost:3111/dashboard"
  );
});

test("un fragment de session n'est jamais retiré : c'est lui qui connecte", () => {
  const href = `http://localhost:3111/dashboard${FRAGMENT_SESSION}`;
  assert.equal(adresseSansErreurAuth(href), href);
  assert.equal(decisionFragment({ fragment: FRAGMENT_SESSION, session: null }), "rien");
});

test("sans fragment d'erreur, rien à faire, et l'adresse reste intacte", () => {
  assert.equal(decisionFragment({ fragment: "", session: null }), "rien");
  assert.equal(decisionFragment({ fragment: "#factures", session: { user: {} } }), "rien");
  assert.equal(adresseSansErreurAuth("http://localhost:3111/dashboard#factures"), "http://localhost:3111/dashboard#factures");
  assert.equal(adresseSansErreurAuth("http://localhost:3111/dashboard"), "http://localhost:3111/dashboard");
});

test("une autre erreur de lien reste expliquée, avec le renvoi proposé", () => {
  const e = erreurAuthDansFragment("#error=server_error&error_code=unexpected_failure&error_description=Oups");
  assert.equal(estLienPerime(e), false);
  assert.equal(decisionFragment({ fragment: "#error=server_error&error_code=unexpected_failure", session: null }), "expliquer");
  assert.match(messageLienEchoue(e), /nouvel e-mail de confirmation/);
});

// Renvoi accepté par l'API : on dit qu'un e-mail a été demandé, jamais qu'il
// est arrivé. Et on prévient que seul le dernier message compte.
test("renvoi accepté : « demandé », le rappel du dernier message, jamais « reçu » ni « délivré »", () => {
  const m = messageRenvoi(null, "contact@garage-exemple.fr");
  assert.equal(m.ton, "succes");
  assert.match(m.texte, /a été demandé/);
  assert.match(m.texte, /contact@garage-exemple\.fr/);
  assert.ok(m.texte.includes(RAPPEL_DERNIER_MESSAGE));
  assert.doesNotMatch(m.texte, /e-mail reçu|délivré|envoyé/i);
});

test("renvoi limité par le quota : on dit d'attendre, sans promettre d'envoi", () => {
  const m = messageRenvoi({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, "a@b.fr");
  assert.equal(m.ton, "erreur");
  assert.match(m.texte, /heure/);
  assert.doesNotMatch(m.texte, /a été demandé|délivré/i);
});

test("renvoi refusé pour une autre raison : neutre, sans rien dire du compte", () => {
  const m = messageRenvoi({ status: 422, message: "User already confirmed" }, "a@b.fr");
  assert.equal(m.ton, "erreur");
  assert.doesNotMatch(m.texte, /déjà (inscrit|enregistré|confirmé)|existe/i);
  assert.doesNotMatch(m.texte, /a été demandé/);
});
