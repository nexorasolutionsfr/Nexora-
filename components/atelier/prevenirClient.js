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
  // UNE RÉPONSE PERDUE NE PROUVE RIEN
  // Si la réponse n'arrive pas, la requête a pu aboutir quand même : le
  // serveur peut avoir enregistré l'autorisation. Annoncer « rien n'a été
  // envoyé » serait une affirmation gratuite, et la pire : elle pousse à
  // recommencer un geste peut-être déjà fait.
  doute: "Impossible de confirmer l'autorisation. Vérifiez l'état avant de réessayer.",
  doutePasArmee: "La connexion a échoué et l'autorisation n'a pas été enregistrée. Vous pouvez réessayer.",
  droits: "Envoi refusé. Vérifiez vos droits, puis réessayez.",
  refus: "Envoi refusé.",
  inattendu: "Réponse inattendue du serveur. L'autorisation n'a pas été confirmée — vérifiez l'état avant de réessayer.",
};

/**
 * Les états dans lesquels l'autorisation a BIEN été enregistrée.
 *
 * Ce sont les clés rendues par `etat_envoi_atelier`. `aucune` et `a_valider`
 * disent le contraire ; tout le reste — y compris `null` — est un inconnu, et
 * un inconnu ne se range d'aucun côté.
 */
const ETATS_AUTORISES = new Set(["en_attente_envoi", "envoi_en_cours", "envoye"]);
const ETATS_NON_AUTORISES = new Set(["aucune", "a_valider"]);

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
    // Une panne de réseau laisse un DOUTE, pas un échec. On relit donc l'état
    // — c'est lui, et lui seul, qui tranchera (voir `leverLeDoute`).
    if (estUnePanneReseau(error)) {
      return { fermer: false, erreur: ERREURS.doute, toast: null, relireEtat: true, doute: true };
    }
    // Un refus du serveur, lui, est une réponse : elle est arrivée, et elle dit non.
    return { fermer: false, erreur: ERREURS.droits, toast: null, relireEtat: false, doute: false };
  }
  if (data && data.ok === false) {
    return {
      fermer: false,
      erreur: MOTIFS_REFUS[data.raison] || ERREURS.refus,
      toast: null,
      relireEtat: true,
      doute: false,
    };
  }
  if (data && data.ok === true) {
    return {
      fermer: true,
      erreur: null,
      toast: data.deja_autorise ? "Message déjà autorisé" : "Message autorisé",
      relireEtat: true,
      doute: false,
    };
  }
  // Ni erreur ni réponse lisible : on ne ferme pas, on ne prétend rien, et on
  // relit l'état comme pour une réponse perdue.
  return { fermer: false, erreur: ERREURS.inattendu, toast: null, relireEtat: true, doute: true };
}

/**
 * Lever le doute après une réponse perdue — avec l'état relu, jamais autrement.
 *
 * @param etat  la réponse de `etat_envoi_atelier`, ou `null` si elle n'est pas
 *              venue non plus.
 *
 * Trois issues, et aucune ne réautorise quoi que ce soit : ce module ne décide
 * d'aucun envoi. Si l'autorisation est là, on le dit et on ferme ; si elle n'y
 * est pas, on le dit aussi ; et si l'état reste inconnu, on garde le doute
 * plutôt que d'en inventer la résolution.
 */
export function leverLeDoute(etat) {
  const cle = etat && etat.ok !== false ? etat.etat ?? null : null;
  if (ETATS_AUTORISES.has(cle)) {
    // La requête avait bien abouti. Le message n'est pas « envoyé » pour
    // autant : il est autorisé, et il partira au traitement suivant.
    return { fermer: true, erreur: null, toast: "Message autorisé", resolu: true };
  }
  if (ETATS_NON_AUTORISES.has(cle)) {
    return { fermer: false, erreur: ERREURS.doutePasArmee, toast: null, resolu: true };
  }
  return { fermer: false, erreur: ERREURS.doute, toast: null, resolu: false };
}
