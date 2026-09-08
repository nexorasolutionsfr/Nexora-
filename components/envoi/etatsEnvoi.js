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
    titre: "Pas encore préparé",
    detail: "Aucun envoi n'a été demandé pour ce devis.",
    ton: "neutre",
    peutValider: true,
    peutReessayer: false,
  },
  a_valider: {
    titre: "À valider",
    detail: "Le devis est prêt. Rien ne partira tant que vous ne l'aurez pas validé.",
    ton: "neutre",
    peutValider: true,
    peutReessayer: false,
  },
  en_attente_envoi: {
    titre: "En attente d'envoi",
    detail: "L'envoi est programmé. Le message part dans les minutes qui viennent.",
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
