// Ce que l'écran doit dire d'un envoi, selon son état réel en base.
//
// POURQUOI CE MODULE
//
// La file est verrouillée : l'application ne peut pas la lire directement,
// elle demande son état à `etat_envoi_devis`. Restait à traduire cet état en
// une phrase juste. Deux pièges à éviter, et ce sont les deux qu'on voyait
// ailleurs dans le produit :
//
//  - dire « Envoyé » dès la mise en file. Le message n'est pas parti ; il est
//    en attente. Et même parti, « envoyé » ne veut pas dire « lu ».
//  - proposer « Réessayer » sur un envoi dont on ignore l'issue. Le
//    fournisseur a peut-être accepté : renvoyer, c'est écrire deux fois au
//    client. Un envoi incertain se vérifie, il ne se rejoue pas.

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

// Les motifs techniques deviennent des phrases qu'un garagiste peut suivre.
const MOTIFS = [
  // L'ordre compte : le motif du changement mentionne aussi « destinataire ».
  [/a changé depuis la validation/i,
   "Le devis ou l'adresse du client a changé depuis votre validation. Revalidez pour envoyer la version à jour."],
  [/adresse e-mail du client absente|destinataire absent/i,
   "Ce client n'a pas d'adresse e-mail. Complétez sa fiche, puis validez à nouveau."],
  [/refus du fournisseur|rate limit|quota/i,
   "Le service d'envoi a refusé le message. Il sera repris automatiquement."],
];

export function messageBlocage(motif) {
  if (!motif) return "Rien n'est parti. Validez à nouveau pour réessayer.";
  for (const [motif_regex, phrase] of MOTIFS) {
    if (motif_regex.test(motif)) return phrase;
  }
  // On ne recopie jamais le motif brut : il peut contenir un détail interne.
  return "L'envoi n'a pas pu se faire. Validez à nouveau, ou contactez-nous si cela se reproduit.";
}

export function lireEtat(reponse) {
  const brut = reponse && reponse.ok ? reponse.etat : null;
  const etat = ETATS[brut] || ETATS.aucune;
  return {
    ...etat,
    cle: brut || "aucune",
    detail: brut === "bloque" ? messageBlocage(reponse && reponse.motif) : etat.detail,
    destinataire: (reponse && reponse.destinataire) || null,
  };
}

// Ce que dit l'écran juste après la confirmation. La ligne vient d'être mise
// en file : rien n'est encore parti, et aucun délai n'est promis — le
// traitement dépend d'une machine qui peut être arrêtée.
export function messageApresValidation(dejaAutorise) {
  return dejaAutorise
    ? "Cet envoi était déjà programmé : rien n'a été ajouté."
    : "Envoi programmé. La carte passera à « Envoyé » quand le message sera parti.";
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
  reponseAutre: "Le client vous a répondu par téléphone ou au comptoir ?",
  marquerAccepte: "Il a accepté",
  marquerRefuse: "Il a refusé",
};

// Les refus renvoyés par `autoriser_envoi_devis`, en français.
export function messageRefusValidation(raison) {
  switch (raison) {
    case "destinataire_absent":
      return "Ce client n'a pas d'adresse e-mail. Complétez sa fiche pour pouvoir lui écrire.";
    case "destinataire_different":
      return "L'adresse du client a changé depuis l'affichage. Rouvrez l'aperçu pour vérifier, puis validez.";
    case "aucune_notification_en_attente":
      return "Ce devis n'a pas d'envoi en attente. Il a peut-être déjà été envoyé.";
    default:
      return "La validation n'a pas abouti. Réessayez dans un instant.";
  }
}
