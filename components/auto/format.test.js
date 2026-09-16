import assert from "node:assert/strict";
import test from "node:test";

import {
  cheminSuite,
  delaiLisible,
  formaterDate,
  formaterEuros,
  formaterKm,
  lireEntier,
  lireMontant,
  messageConnexion,
  messageErreurAuto,
} from "./format.js";

const F = " ";

test("formaterDate : date calendaire lisible, 1er compris", () => {
  assert.equal(formaterDate("2027-03-12"), "12 mars 2027");
  assert.equal(formaterDate("2026-10-01"), "1er oct. 2026");
  assert.equal(formaterDate("2026-09-16T22:30:00+00:00"), "16 sept. 2026");
  assert.equal(formaterDate(null), "");
});

test("formaterKm et formaterEuros : espaces fines, virgule décimale", () => {
  assert.equal(formaterKm(61400), `61${F}400${F}km`);
  assert.equal(formaterKm(950), `950${F}km`);
  assert.equal(formaterKm(null), "");
  assert.equal(formaterEuros(79), `79,00${F}€`);
  assert.equal(formaterEuros("1234.5"), `1${F}234,50${F}€`);
  assert.equal(formaterEuros(undefined), "");
});

test("delaiLisible : jours, puis mois au-delà de 60 jours", () => {
  assert.equal(delaiLisible(0), "aujourd'hui");
  assert.equal(delaiLisible(1), "demain");
  assert.equal(delaiLisible(34), "dans 34 jours");
  assert.equal(delaiLisible(177), "dans 6 mois");
  assert.equal(delaiLisible(-1), "en retard d'un jour");
  assert.equal(delaiLisible(-12), "en retard de 12 jours");
  assert.equal(delaiLisible(-400), "en retard de 13 mois");
});

test("lireEntier et lireMontant : ce que les gens tapent", () => {
  assert.equal(lireEntier("61 400"), 61400);
  assert.equal(lireEntier("61400 km"), 61400);
  assert.equal(lireEntier("61.400"), 61400);
  assert.equal(lireEntier("6x"), null);
  assert.equal(lireEntier(""), null);
  assert.equal(lireMontant("79,90"), 79.9);
  assert.equal(lireMontant("1 250 €"), 1250);
  assert.equal(lireMontant(""), null);
  assert.ok(Number.isNaN(lireMontant("douze")));
});

test("cheminSuite : jamais hors de Nexora Auto", () => {
  assert.equal(cheminSuite("/auto/vehicules/nouveau"), "/auto/vehicules/nouveau");
  assert.equal(cheminSuite("https://exemple.invalid"), "/auto");
  assert.equal(cheminSuite("//exemple.invalid"), "/auto");
  assert.equal(cheminSuite("/dashboard"), "/auto");
  assert.equal(cheminSuite(null), "/auto");
});

test("messageErreurAuto : les contraintes de la base deviennent des phrases", () => {
  assert.equal(
    messageErreurAuto({ code: "23505", message: 'duplicate key value violates unique constraint "auto_vehicules_plaque_par_proprietaire"' }),
    "Cette plaque est déjà enregistrée dans votre garage.",
  );
  assert.equal(
    messageErreurAuto({ code: "23514", message: "auto_historique : la date 2026-10-01 est dans le futur (auto_date_future)" }),
    "La date ne peut pas être dans le futur.",
  );
  assert.equal(
    messageErreurAuto({ code: "23505", message: 'duplicate key value violates unique constraint "auto_taches_service_une_ouverte"' }),
    "Cette prestation figure déjà dans vos prochaines actions pour cette voiture.",
  );
  assert.equal(
    messageErreurAuto({ code: "23514", message: "auto_taches : prestation suivie autrement qu'en tâche (auto_service_non_ajoutable)" }),
    "Cette prestation est déjà suivie automatiquement dans « À prévoir ».",
  );
  assert.match(
    messageErreurAuto({ code: "23514", message: "auto_facture : intervention ressemblante à trancher (auto_doublon_potentiel)" }),
    /rattacher la facture ou de créer une autre intervention/,
  );
  assert.equal(messageErreurAuto({ code: "23505", message: 'duplicate key value violates unique constraint "auto_documents_empreinte_unique"' }), "Cette facture est déjà dans le dossier de cette voiture.");
  assert.equal(messageErreurAuto({ code: "42501", message: "permission denied" }), "Votre session a expiré. Reconnectez-vous.");
  assert.match(messageErreurAuto({ message: "Failed to fetch" }), /n'a pas abouti/);
});

test("messageConnexion : codes Supabase courants", () => {
  assert.equal(messageConnexion({ code: "invalid_credentials", message: "Invalid login credentials" }), "Adresse e-mail ou mot de passe incorrect.");
  assert.equal(messageConnexion({ code: "email_not_confirmed" }), "Confirmez d'abord votre adresse : ouvrez le lien reçu par e-mail.");
  assert.equal(messageConnexion({ status: 429, message: "email rate limit exceeded" }), "Trop de demandes en peu de temps. Réessayez dans une heure.");
  assert.match(messageConnexion({ message: "boom" }), /n'a pas abouti/);
});


