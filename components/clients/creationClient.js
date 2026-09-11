// Lire ce qu'une création de client a réellement produit.
//
// Revue du 12 septembre 2026 : quand le client était enregistré mais pas sa
// voiture, la fenêtre de devis continuait sans voiture et le message
// d'avertissement était aussitôt remplacé par « Devis créé ». Le garage
// croyait avoir saisi une voiture qui n'existait pas.
//
// Ces fonctions n'écrivent rien : elles disent ce qui s'est passé, pour que
// l'écran s'arrête au bon moment et retrouve le client déjà créé au lieu d'en
// créer un second.

/**
 * @param client le client rendu par la création (ou null en cas d'échec)
 * @param vehiculeDemande la voiture saisie, ou null si aucune
 */
export function lectureCreationClient(client, vehiculeDemande = null) {
  if (!client || !client.id) {
    return { ok: false, clientId: null, vehiculeId: null, vehiculeEnEchec: false };
  }
  const vehicules = Array.isArray(client.vehicules)
    ? client.vehicules
    : client.vehicules
      ? [client.vehicules]
      : [];
  const vehiculeId = vehicules[0]?.id || null;
  return {
    ok: true,
    clientId: client.id,
    vehiculeId,
    vehiculeEnEchec: Boolean(vehiculeDemande) && !vehiculeId,
  };
}

export const MESSAGE_VEHICULE_ECHEC =
  "Client enregistré, mais pas sa voiture. Réessayez l'enregistrement de la voiture, ou continuez sans elle.";

/**
 * Le message qui suit la création d'un devis. Une ligne de catalogue qui n'a
 * pas pu être posée est dite, et le texte reste actionnable : le garage sait
 * quoi retaper. Le libellé n'est jamais perdu en silence dans la console.
 */
export function messageDevisCree({ ligneEchouee = null } = {}) {
  if (ligneEchouee) {
    return {
      texte: `Devis créé, mais la ligne « ${ligneEchouee} » n'a pas pu être ajoutée : ajoutez-la à la main.`,
      ton: "error",
    };
  }
  return { texte: "Devis créé. Rien n'est envoyé au client.", ton: "success" };
}
