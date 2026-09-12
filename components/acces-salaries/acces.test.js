// Accès salariés V1 — tests locaux du module client.
//
// Exécution : node --test components/acces-salaries/acces.test.js
//
// Ces tests portent sur les seules décisions prises côté client : la carte
// des vues par rôle, et la forme des arguments envoyés aux RPC. Ils ne
// testent PAS la sécurité — elle est appliquée en base et vérifiée par
// supabase/tests/acces_salaries_v1.sql. Un test qui prétendrait vérifier un
// refus ici ne vérifierait que du code d'affichage.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROLE_ACCUEIL,
  ROLE_DIRIGEANT,
  ROLE_MECANICIEN,
  estRoleConnu,
  peutFacturer,
  peutGererLesAcces,
  peutVoir,
  vuesAutorisees,
} from "./accesConstants.js";

import {
  ajouterNote,
  changerRoleMembre,
  chargerMonRole,
  inviterMembre,
  inviterMembreParEmail,
} from "./acces.js";

function supabaseFactice(reponses = {}) {
  const appels = [];
  return {
    appels,
    rpc(nom, args) {
      appels.push({ nom, args });
      const reponse = reponses[nom] ?? { data: null, error: null };
      return Promise.resolve(reponse);
    },
  };
}

test("le dirigeant n'est bridé sur aucune vue", () => {
  assert.equal(vuesAutorisees(ROLE_DIRIGEANT), null);
  assert.equal(peutVoir(ROLE_DIRIGEANT, "statistiques"), true);
  assert.equal(peutVoir(ROLE_DIRIGEANT, "une-vue-ajoutee-plus-tard"), true);
});

test("l'accueil voit l'opérationnel et les factures, jamais les réglages", () => {
  assert.equal(peutVoir(ROLE_ACCUEIL, "clients"), true);
  assert.equal(peutVoir(ROLE_ACCUEIL, "devis"), true);
  assert.equal(peutVoir(ROLE_ACCUEIL, "atelier"), true);
  // Décision produit du 12 septembre 2026 : le comptoir encaisse.
  assert.equal(peutVoir(ROLE_ACCUEIL, "factures"), true);
  // Ce qui reste au dirigeant, et qui ne doit pas suivre par inadvertance.
  assert.equal(peutVoir(ROLE_ACCUEIL, "historique"), false);
  assert.equal(peutVoir(ROLE_ACCUEIL, "statistiques"), false);
  assert.equal(peutVoir(ROLE_ACCUEIL, "parametres"), false);
  assert.equal(peutVoir(ROLE_ACCUEIL, "membres"), false);
});

test("le mécanicien n'a qu'une seule vue", () => {
  assert.deepEqual(vuesAutorisees(ROLE_MECANICIEN), ["atelier_mecanicien"]);
  assert.equal(peutVoir(ROLE_MECANICIEN, "clients"), false);
  assert.equal(peutVoir(ROLE_MECANICIEN, "factures"), false);
  assert.equal(peutVoir(ROLE_MECANICIEN, "atelier"), false);
});

test("un rôle absent ou inconnu ne donne accès à rien", () => {
  assert.deepEqual(vuesAutorisees(null), []);
  assert.deepEqual(vuesAutorisees("patron"), []);
  assert.equal(peutVoir(undefined, "accueil"), false);
  assert.equal(estRoleConnu("patron"), false);
  assert.equal(estRoleConnu(ROLE_MECANICIEN), true);
});

test("seul le dirigeant gère les accès ; la facturation est aussi au comptoir", () => {
  assert.equal(peutGererLesAcces(ROLE_DIRIGEANT), true);
  assert.equal(peutGererLesAcces(ROLE_ACCUEIL), false);
  assert.equal(peutGererLesAcces(ROLE_MECANICIEN), false);
  assert.equal(peutFacturer(ROLE_DIRIGEANT), true);
  assert.equal(peutFacturer(ROLE_ACCUEIL), true);
  assert.equal(peutFacturer(ROLE_MECANICIEN), false);
  assert.equal(peutFacturer(null), false);
});

test("chargerMonRole ne remonte qu'un rôle connu", async () => {
  const ok = supabaseFactice({ mon_role_garage: { data: "accueil", error: null } });
  assert.equal(await chargerMonRole(ok, "g-1"), "accueil");

  const bizarre = supabaseFactice({ mon_role_garage: { data: "root", error: null } });
  assert.equal(await chargerMonRole(bizarre, "g-1"), null);

  const sansGarage = supabaseFactice();
  assert.equal(await chargerMonRole(sansGarage, null), null);
  assert.equal(sansGarage.appels.length, 0, "aucun appel réseau sans garage");
});

test("inviterMembre refuse un rôle inconnu avant tout appel", async () => {
  const client = supabaseFactice();
  await assert.rejects(
    () => inviterMembre(client, { garageId: "g", userId: "u", role: "patron" }),
    /Rôle inconnu/
  );
  assert.equal(client.appels.length, 0);
});

test("inviterMembre exige une fiche mécanicien pour ce rôle", async () => {
  const client = supabaseFactice();
  await assert.rejects(
    () => inviterMembre(client, { garageId: "g", userId: "u", role: ROLE_MECANICIEN }),
    /fiche mécanicien/
  );
  assert.equal(client.appels.length, 0);
});

test("la fiche mécanicien n'est transmise que pour le rôle mécanicien", async () => {
  const client = supabaseFactice({ inviter_membre_garage: { data: "m-1", error: null } });
  await inviterMembre(client, {
    garageId: "g",
    userId: "u",
    role: ROLE_ACCUEIL,
    mecanicienId: "meca-1",
  });
  assert.equal(client.appels[0].args.p_mecanicien_id, null);

  await inviterMembre(client, {
    garageId: "g",
    userId: "u2",
    role: ROLE_MECANICIEN,
    mecanicienId: "meca-1",
  });
  assert.equal(client.appels[1].args.p_mecanicien_id, "meca-1");
});

test("changerRoleMembre efface la fiche mécanicien hors de ce rôle", async () => {
  const client = supabaseFactice({ changer_role_membre: { data: true, error: null } });
  await changerRoleMembre(client, { membreId: "m-1", role: ROLE_DIRIGEANT, mecanicienId: "meca-1" });
  assert.equal(client.appels[0].args.p_mecanicien_id, null);
});

test("une note vide n'atteint jamais la base", async () => {
  const client = supabaseFactice();
  await assert.rejects(
    () => ajouterNote(client, { ordreId: "or-1", note: "   " }),
    /note vide/
  );
  assert.equal(client.appels.length, 0);
});

test("une erreur de la base est remontée telle quelle", async () => {
  const client = supabaseFactice({
    mon_role_garage: { data: null, error: new Error("Accès refusé") },
  });
  await assert.rejects(() => chargerMonRole(client, "g-1"), /Accès refusé/);
});

test("inviterMembreParEmail applique les mêmes garde-fous, sans appel inutile", async () => {
  const client = supabaseFactice();
  await assert.rejects(
    () => inviterMembreParEmail(client, { garageId: "g", email: "a@b.fr", role: "patron" }),
    /Rôle inconnu/
  );
  await assert.rejects(
    () => inviterMembreParEmail(client, { garageId: "g", email: "a@b.fr", role: ROLE_MECANICIEN }),
    /fiche mécanicien/
  );
  await assert.rejects(
    () => inviterMembreParEmail(client, { garageId: "g", email: "   ", role: ROLE_ACCUEIL }),
    /Adresse e-mail manquante/
  );
  assert.equal(client.appels.length, 0, "aucun appel réseau tant qu'une règle locale échoue");
});

test("inviterMembreParEmail envoie l'adresse nettoyée et la fiche du bon rôle", async () => {
  const client = supabaseFactice({ inviter_membre_par_email: { data: "m-9", error: null } });
  await inviterMembreParEmail(client, {
    garageId: "g",
    email: "  chef@garage.fr  ",
    role: ROLE_ACCUEIL,
    mecanicienId: "meca-1",
  });
  assert.equal(client.appels[0].nom, "inviter_membre_par_email");
  assert.equal(client.appels[0].args.p_email, "chef@garage.fr");
  assert.equal(client.appels[0].args.p_mecanicien_id, null);

  await inviterMembreParEmail(client, {
    garageId: "g",
    email: "meca@garage.fr",
    role: ROLE_MECANICIEN,
    mecanicienId: "meca-1",
  });
  assert.equal(client.appels[1].args.p_mecanicien_id, "meca-1");
});
