import assert from "node:assert/strict";
import test from "node:test";
import {
  ERREURS,
  MOTIFS_REFUS,
  cibleDEnvoi,
  estUnePanneReseau,
  suiteDeConfirmation,
} from "./prevenirClient.js";

// --- La cible : donnée, jamais devinée ------------------------------------

test("une cible complète est acceptée telle quelle", () => {
  const c = cibleDEnvoi({ rendezVousId: "abc", destinataire: "claire@example.com" });
  assert.deepEqual(c, { ok: true, rendezVousId: "abc", destinataire: "claire@example.com" });
});

test("les espaces autour de la cible sont retirés", () => {
  const c = cibleDEnvoi({ rendezVousId: "  abc  ", destinataire: " claire@example.com " });
  assert.equal(c.rendezVousId, "abc");
  assert.equal(c.destinataire, "claire@example.com");
});

// LE DÉFAUT DU 20 SEPTEMBRE, EN UN TEST
//
// L'ancien code lisait le rendez-vous dans un état React au moment du geste ;
// il valait `null` et la fonction sortait sans rien dire. Ici, une cible
// incomplète ne peut plus produire un silence : elle rend une phrase.
test("une cible sans rendez-vous est refusée AVEC une phrase, pas en silence", () => {
  const c = cibleDEnvoi({ rendezVousId: null, destinataire: "claire@example.com" });
  assert.equal(c.ok, false);
  assert.equal(c.erreur, ERREURS.cible);
});

test("une cible sans destinataire est refusée avec la même phrase", () => {
  assert.equal(cibleDEnvoi({ rendezVousId: "abc", destinataire: "" }).ok, false);
  assert.equal(cibleDEnvoi({ rendezVousId: "abc", destinataire: "   " }).ok, false);
});

test("rien du tout, une chaîne, undefined : toujours un refus lisible", () => {
  for (const entree of [undefined, null, "claire@example.com", {}, 42]) {
    const c = cibleDEnvoi(entree);
    assert.equal(c.ok, false, `entrée ${JSON.stringify(entree)}`);
    assert.equal(c.erreur, ERREURS.cible);
  }
});

// --- Panne de réseau contre refus du serveur -------------------------------

test("une erreur PostgREST porte un code : ce n'est pas une panne de réseau", () => {
  assert.equal(estUnePanneReseau({ code: "42501", message: "permission denied" }), false);
  assert.equal(estUnePanneReseau({ code: "PGRST301", message: "JWT expired" }), false);
});

test("une requête qui n'est jamais partie est reconnue comme panne de réseau", () => {
  for (const m of ["TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.",
                   "fetch failed", "Load failed", "The operation was aborted", "network timeout"]) {
    assert.equal(estUnePanneReseau({ message: m }), true, m);
  }
});

test("pas d'erreur du tout : pas de panne", () => {
  assert.equal(estUnePanneReseau(null), false);
  assert.equal(estUnePanneReseau(undefined), false);
});

// --- Ce que l'écran fait de la réponse -------------------------------------

test("succès : on ferme, on annonce « Message autorisé », on relit l'état", () => {
  const s = suiteDeConfirmation({ data: { ok: true, notification: "n1", deja_autorise: false } });
  assert.equal(s.fermer, true);
  assert.equal(s.toast, "Message autorisé");
  assert.equal(s.erreur, null);
  assert.equal(s.relireEtat, true);
});

test("déjà autorisé : on ferme, et on le dit sans prétendre que c'est neuf", () => {
  const s = suiteDeConfirmation({ data: { ok: true, deja_autorise: true } });
  assert.equal(s.fermer, true);
  assert.equal(s.toast, "Message déjà autorisé");
});

test("chaque refus de la base a sa phrase, et l'écran reste ouvert", () => {
  for (const raison of Object.keys(MOTIFS_REFUS)) {
    const s = suiteDeConfirmation({ data: { ok: false, raison } });
    assert.equal(s.fermer, false, raison);
    assert.equal(s.erreur, MOTIFS_REFUS[raison], raison);
    assert.equal(s.relireEtat, true, raison);
    assert.equal(s.toast, null, raison);
  }
});

test("un refus inconnu laisse réessayer plutôt que de bloquer l'écran", () => {
  const s = suiteDeConfirmation({ data: { ok: false, raison: "quelque_chose_de_neuf" } });
  assert.equal(s.erreur, ERREURS.refus);
  assert.equal(s.fermer, false);
});

test("panne de réseau : phrase de réseau, rien n'est parti, et on peut réessayer", () => {
  const s = suiteDeConfirmation({ error: { message: "TypeError: Failed to fetch" } });
  assert.equal(s.fermer, false);
  assert.equal(s.erreur, ERREURS.reseau);
  // On ne relit pas la base : la requête n'est jamais partie, l'état n'a pas bougé.
  assert.equal(s.relireEtat, false);
});

test("refus du serveur : on parle de droits, pas de réseau", () => {
  const s = suiteDeConfirmation({ error: { code: "42501", message: "permission denied" } });
  assert.equal(s.erreur, ERREURS.droits);
  assert.equal(s.fermer, false);
});

// UNE SORTIE MUETTE EST UN DÉFAUT
//
// Aucun chemin ne doit rendre la main sans fermer la fenêtre NI dire quelque
// chose : c'est exactement ce que faisait l'ancien code, et c'est ce qui
// laissait « Envoi autorisé… » à l'écran pour toujours.
test("aucune réponse possible ne laisse la fenêtre ouverte et muette", () => {
  const reponses = [
    { data: { ok: true } },
    { data: { ok: true, deja_autorise: true } },
    { data: { ok: false, raison: "vehicule_pas_pret" } },
    { data: { ok: false, raison: "inconnue" } },
    { error: { message: "Failed to fetch" } },
    { error: { code: "42501", message: "permission denied" } },
    { data: null },
    {},
  ];
  for (const r of reponses) {
    const s = suiteDeConfirmation(r);
    assert.ok(s.fermer || s.erreur, `muette pour ${JSON.stringify(r)}`);
  }
});

test("une réponse illisible ne se fait jamais passer pour un envoi réussi", () => {
  const s = suiteDeConfirmation({ data: null });
  assert.equal(s.fermer, false);
  assert.equal(s.toast, null);
  assert.equal(s.erreur, ERREURS.inattendu);
});
