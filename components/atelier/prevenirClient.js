// Prévenir le client : les décisions, sans React et sans réseau.
//
// POURQUOI CE FICHIER
//
// Le 20 septembre, « Envoyer le message » ne partait jamais. La cible de
// l'envoi était récupérée par EFFET DE BORD d'une fonction de mise à jour
// d'état React :
//
//     let appt = null;
//     setPrevenir((p) => { appt = p?.appt || null; return …; });
//     if (!appt) return;                      // ← on sortait toujours ici
//
// React n'exécute pas cette fonction au moment de l'appel : elle court à la
// phase de rendu suivante. Mesuré dans le navigateur, en développement comme
// en build de production : `appt` valait `null` 3 ms après l'appel, la
// fonction de mise à jour ne courait qu'à +4 ms — après le retour. Aucune RPC
// n'était émise, et l'état « en cours » posé par cette même fonction restait
// à l'écran pour toujours.
//
// LA RÈGLE QUI EN SORT
//
// Une donnée nécessaire à un envoi ne se lit jamais dans un état React au
// moment du geste. Elle est DONNÉE par l'appelant — ici, la fenêtre d'aperçu
// passe explicitement le rendez-vous et le destinataire qu'elle a sous les
// yeux. C'est aussi ce que la base attend : `autoriser_envoi_atelier` refuse
// l'envoi si le destinataire transmis n'est plus celui du client.
//
// CE QUE CE MODULE NE FAIT PAS
//
// Il n'appelle rien, ne décide d'aucun droit et ne change aucun statut.
// `autoriser_envoi_atelier` reste le seul chemin vers un envoi, et c'est la
// base qui vérifie le rôle, l'étape de la voiture et le destinataire.

/** Les refus que la base peut renvoyer, traduits une fois pour toutes. */
export const MOTIFS_REFUS = {
  destinataire_absent: "Ce client n'a pas d'adresse e-mail enregistrée.",
  destinataire_different: "L'adresse du client a changé depuis l'aperçu. Rouvrez le message pour la relire.",
  vehicule_pas_pret: "Cette voiture n'est plus notée prête. Aucun message n'a été envoyé.",
  deja_envoye: "Le client a déjà été prévenu pour cette voiture.",
};

export const ERREURS = {
  cible: "Le message à envoyer n'a pas pu être identifié. Fermez cette fenêtre, rouvrez le message, puis confirmez.",
  reseau: "La connexion a échoué. Rien n'a été envoyé — réessayez.",
  droits: "Envoi refusé. Vérifiez vos droits, puis réessayez.",
  refus: "Envoi refusé.",
  inattendu: "Réponse inattendue du serveur. Rien n'a été envoyé — réessayez.",
};

/**
 * La cible d'un envoi, déterminée explicitement.
 *
 * On ne « retrouve » pas le rendez-vous : celui qui confirme doit dire lequel,
 * et à quelle adresse. Une cible incomplète n'est pas une erreur silencieuse :
 * elle rend la main avec une phrase que le garage peut suivre.
 */
export function cibleDEnvoi(entree) {
  const rendezVousId = typeof entree?.rendezVousId === "string" ? entree.rendezVousId.trim() : "";
  const destinataire = typeof entree?.destinataire === "string" ? entree.destinataire.trim() : "";
  if (!rendezVousId || !destinataire) return { ok: false, erreur: ERREURS.cible };
  return { ok: true, rendezVousId, destinataire };
}

/**
 * Une panne de réseau n'est pas un refus du serveur.
 *
 * Une erreur venue de PostgREST porte toujours un `code` (celui de Postgres,
 * ou celui de PostgREST). Une requête qui n'est jamais partie n'en a pas : il
 * ne reste qu'un message de `fetch`. La distinction compte, parce que les deux
 * phrases à afficher ne disent pas la même chose — « vérifiez vos droits »
 * enverrait le garage chercher un problème qui n'existe pas.
 */
export function estUnePanneReseau(error) {
  if (!error) return false;
  if (error.code) return false;
  const m = String(error.message || "").toLowerCase();
  return m.includes("fetch") || m.includes("network") || m.includes("réseau")
    || m.includes("load failed") || m.includes("timeout") || m.includes("aborted");
}

/**
 * Ce que l'écran doit faire d'une réponse : fermer, ou rester ouvert avec une
 * phrase. Dans tous les cas l'appelant remet le bouton en état — un refus,
 * quel qu'il soit, ne doit jamais laisser la fenêtre inutilisable.
 *
 * `relireEtat` vaut vrai dès que la base a pu changer d'avis sur cette
 * notification : après un succès comme après un refus, l'état affiché doit
 * repartir de la base, jamais d'une supposition.
 */
export function suiteDeConfirmation({ error = null, data = null } = {}) {
  if (error) {
    const reseau = estUnePanneReseau(error);
    return {
      fermer: false,
      erreur: reseau ? ERREURS.reseau : ERREURS.droits,
      toast: null,
      relireEtat: false,
    };
  }
  if (data && data.ok === false) {
    return {
      fermer: false,
      erreur: MOTIFS_REFUS[data.raison] || ERREURS.refus,
      toast: null,
      relireEtat: true,
    };
  }
  if (data && data.ok === true) {
    return {
      fermer: true,
      erreur: null,
      toast: data.deja_autorise ? "Message déjà autorisé" : "Message autorisé",
      relireEtat: true,
    };
  }
  // Ni erreur ni réponse lisible : on ne ferme pas, on ne prétend pas que
  // c'est parti, et on laisse réessayer.
  return { fermer: false, erreur: ERREURS.inattendu, toast: null, relireEtat: true };
}
