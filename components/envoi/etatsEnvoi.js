// Ce que l'écran doit dire d'un envoi, selon son état réel en base.
//
// POURQUOI CE MODULE
//
// La file est verrouillée : l'application ne peut pas la lire directement,
// elle demande son état à `etat_envoi_devis` ou `etat_envoi_facture`. Restait
// à traduire cet état en une phrase juste. Deux pièges à éviter, et ce sont les deux qu'on voyait
// ailleurs dans le produit :
//
//  - dire « Envoyé » dès la mise en file. Le message n'est pas parti ; il est
//    en attente. Et même parti, « envoyé » ne veut pas dire « lu ».
//  - proposer « Réessayer » sur un envoi dont on ignore l'issue. Le
//    fournisseur a peut-être accepté : renvoyer, c'est écrire deux fois au
//    client. Un envoi incertain se vérifie, il ne se rejoue pas.
//
// Depuis le 12 septembre 2026, la facture suit exactement le même parcours
// que le devis : même composant, mêmes états, mêmes phrases — seuls le nom du
// document et les fonctions de base changent. Ils sont nommés ici, une fois.

export const ETATS = {
  aucune: {
    titre: "Pas encore envoyé",
    detail: "Rien n'est parti. Relisez le message, puis confirmez l'envoi.",
    ton: "neutre",
    peutValider: true,
    peutReessayer: false,
  },
  a_valider: {
    titre: "Pas encore envoyé",
    detail: "Rien n'est parti. Relisez le message, puis confirmez l'envoi.",
    ton: "neutre",
    peutValider: true,
    peutReessayer: false,
  },
  en_attente_envoi: {
    titre: "En attente d'envoi",
    // Aucun délai annoncé, même implicite : le traitement dépend encore d'une
    // machine qui peut être éteinte. « quelques minutes » comme « au prochain
    // passage » sont des engagements que rien ne tient.
    detail: "L'envoi est programmé. Cet écran affichera « Envoyé » quand le message sera parti.",
    ton: "attente",
    peutValider: false,
    peutReessayer: false,
  },
  envoi_en_cours: {
    titre: "Envoi à vérifier",
    detail:
      "Le traitement a commencé sans confirmer la fin. Le message est peut-être parti : " +
      "on ne le renvoie pas à l'aveugle. Vérifiez avec le client avant toute nouvelle tentative.",
    ton: "attention",
    peutValider: false,
    peutReessayer: false,
  },
  envoye: {
    titre: "Envoyé",
    detail: "Le message est parti. Cela ne dit pas que le client l'a ouvert.",
    ton: "succes",
    peutValider: false,
    peutReessayer: false,
  },
  bloque: {
    titre: "Bloqué",
    detail: "Rien n'est parti.",
    ton: "erreur",
    peutValider: true,
    peutReessayer: false,
  },
};

// Les deux documents qu'on envoie au client, et ce qui les distingue. Les
// fonctions de base portent le contrôle des droits ; l'écran ne fait que les
// appeler avec l'identifiant du document.
export const DOCUMENTS = {
  devis: {
    nom: "devis",
    article: "Le devis",
    pronom: "Il",
    accord: "",
    rpcEtat: "etat_envoi_devis",
    rpcApercu: "apercu_message_devis",
    rpcAutoriser: "autoriser_envoi_devis",
    idParam: "p_devis_id",
    lienAjoute: "Le lien du devis est ajouté au moment de l'envoi ; il apparaît ici en pointillés.",
  },
  facture: {
    nom: "facture",
    article: "La facture",
    pronom: "Elle",
    accord: "e",
    rpcEtat: "etat_envoi_facture",
    rpcApercu: "apercu_message_facture",
    rpcAutoriser: "autoriser_envoi_facture",
    idParam: "p_facture_id",
    lienAjoute: "Le lien de la facture est ajouté au moment de l'envoi ; il apparaît ici en pointillés.",
  },
};

export function document(cle) {
  return DOCUMENTS[cle] || DOCUMENTS.devis;
}

// Les motifs techniques deviennent des phrases qu'un garagiste peut suivre.
function motifs(doc) {
  return [
    // Le paiement d'abord : c'est le seul motif dont la conduite à tenir n'est
    // pas « revalidez », mais « relisez, ce message n'a peut-être plus lieu
    // d'être ». Il est posé par `marquer_facture_payee` (20260916000200).
    [/marquée payée avant l.envoi/i,
     "Cette facture a été marquée payée : le message préparé annonçait une facture à régler. Relisez-le avant de l'envoyer quand même."],
    // Posé par `notifier_devis_maj` (20260917000100) quand la réponse arrive
    // avant que le message « un devis vous attend » ne soit parti.
    [/réponse avant l.envoi/i,
     "Ce devis a reçu sa réponse avant que le message ne parte : il proposait un devis déjà traité. Rien n'a été envoyé."],
    // L'ordre compte : le motif du changement mentionne aussi « destinataire ».
    [/a changé depuis la validation/i,
     `${doc.article} ou l'adresse du client a changé depuis votre validation. Revalidez pour envoyer la version à jour.`],
    [/adresse e-mail du client absente|destinataire absent/i,
     "Ce client n'a pas d'adresse e-mail. Complétez sa fiche, puis validez à nouveau."],
    [/refus du fournisseur|rate limit|quota/i,
     "Le service d'envoi a refusé le message. Il sera repris automatiquement."],
  ];
}

export function messageBlocage(motif, cle = "devis") {
  if (!motif) return "Rien n'est parti. Validez à nouveau pour réessayer.";
  for (const [motif_regex, phrase] of motifs(document(cle))) {
    if (motif_regex.test(motif)) return phrase;
  }
  // On ne recopie jamais le motif brut : il peut contenir un détail interne.
  return "L'envoi n'a pas pu se faire. Validez à nouveau, ou contactez-nous si cela se reproduit.";
}

export function lireEtat(reponse, cle = "devis") {
  const brut = reponse && reponse.ok ? reponse.etat : null;
  const etat = ETATS[brut] || ETATS.aucune;
  return {
    ...etat,
    cle: brut || "aucune",
    detail: brut === "bloque" ? messageBlocage(reponse && reponse.motif, cle) : etat.detail,
    destinataire: (reponse && reponse.destinataire) || null,
  };
}

// Ce que dit l'écran juste après la confirmation. La ligne vient d'être mise
// en file : rien n'est encore parti, et aucun délai n'est promis — le
// traitement dépend d'une machine qui peut être arrêtée.
export function messageApresValidation(dejaAutorise) {
  return dejaAutorise
    ? "Cet envoi était déjà programmé : rien n'a été ajouté."
    : "Envoi programmé. Cet écran affichera « Envoyé » quand le message sera parti.";
}

// Les gestes de la carte devis, nommés une fois pour toutes.
//
// En recette, trois gestes se ressemblaient : produire un lien, écrire au
// client, noter sa réponse. Un garagiste ne doit pas pouvoir croire qu'il a
// envoyé en copiant un lien, ni qu'il a accepté pour le client en envoyant.
// Seuls les deux libellés d'envoi parlent d'envoyer.
export const GESTES_DEVIS = {
  ouvrirEnvoi: "Envoyer au client par e-mail…",
  confirmerEnvoi: "Oui, envoyer ce message",
  apercu: "Voir ce que verra le client",
  lien: "Obtenir un lien à transmettre vous-même",
  lienAide: "Ce lien n'envoie rien : copiez-le pour le transmettre vous-même (SMS, WhatsApp…).",
  lienCopie: "Lien copié",
  // Revue du 12 septembre 2026 : « Il a accepté » ne disait pas qu'on
  // enregistrait une réponse obtenue ailleurs — et le clic armait en plus un
  // e-mail « Votre devis a été confirmé » que personne n'avait relu (corrigé
  // en base par 20260917000100). Le libellé dit maintenant le geste : une
  // saisie, pas une réponse du client.
  reponseAutre: "Le client vous a répondu par téléphone ou au comptoir ?",
  marquerAccepte: "Enregistrer une acceptation reçue autrement",
  marquerRefuse: "Enregistrer un refus reçu autrement",
};

// Les gestes de la facture : les mêmes mots, pour les mêmes gestes. Une
// facture n'attend pas de réponse : pas de « Il a accepté ».
export const GESTES_FACTURE = {
  ouvrirEnvoi: GESTES_DEVIS.ouvrirEnvoi,
  confirmerEnvoi: GESTES_DEVIS.confirmerEnvoi,
  apercu: GESTES_DEVIS.apercu,
  lien: GESTES_DEVIS.lien,
  lienAide: GESTES_DEVIS.lienAide,
  lienCopie: GESTES_DEVIS.lienCopie,
};

export function gestes(cle) {
  return cle === "facture" ? GESTES_FACTURE : GESTES_DEVIS;
}

// Les refus renvoyés par `autoriser_envoi_*`, en français.
export function messageRefusValidation(raison, cle = "devis") {
  const doc = document(cle);
  switch (raison) {
    case "destinataire_absent":
      return "Ce client n'a pas d'adresse e-mail. Complétez sa fiche pour pouvoir lui écrire.";
    case "destinataire_different":
      return "L'adresse du client a changé depuis l'affichage. Rouvrez l'aperçu pour vérifier, puis validez.";
    case "aucune_notification_en_attente":
      return `${doc.article} n'a pas d'envoi en attente. ${doc.pronom} a peut-être déjà été envoyé${doc.accord}.`;
    default:
      return "La validation n'a pas abouti. Réessayez dans un instant.";
  }
}

// Ce que dit l'écran juste après « Générer la facture » : le document existe,
// rien n'est parti, et c'est au garage de décider.
export const MESSAGE_FACTURE_GENEREE = "Facture générée. Rien n'est envoyé au client : relisez-la, puis décidez de l'envoi.";

// Ce que dit l'écran après « Marquer payée ».
//
// Règle du 12 septembre 2026 : encaisser n'écrit à personne. La phrase le dit
// en toutes lettres, parce que le contraire était vrai la veille — un
// « Confirmation de paiement » partait tout seul. Deux suites possibles, et
// seulement si elles ont eu lieu :
//
//  - un envoi était programmé : il annonçait une facture à régler, il a été
//    mis de côté dans la même transaction. On le dit, sinon le garage
//    découvrirait plus tard un envoi « Bloqué » sans savoir pourquoi ;
//  - un envoi était en cours : on ne sait pas s'il est parti, on ne le rejoue
//    pas, et c'est au garage de vérifier auprès du client.
export function messageFacturePayee(resultat) {
  if (resultat?.deja_payee) {
    return "Cette facture était déjà marquée payée. Aucun message n'a été envoyé.";
  }
  const phrases = ["Facture marquée payée. Aucun message n'a été envoyé."];
  if (Number(resultat?.envois_mis_de_cote) > 0) {
    phrases.push("L'envoi qui était programmé a été mis de côté : il annonçait une facture à régler.");
  }
  if (resultat?.envoi_incertain) {
    phrases.push("Un envoi était en cours au moment du paiement : vérifiez avec le client ce qu'il a reçu avant de lui écrire à nouveau.");
  }
  return phrases.join(" ");
}
