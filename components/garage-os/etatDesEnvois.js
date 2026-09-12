// Ce que Nexora envoie au client, et ce qu'il n'envoie pas.
//
// POURQUOI CE MODULE
//
// L'accueil portait une seule pastille : « Email — actif » ou « Email —
// réponses manuelles », selon la colonne `garages.automatisation_active`.
// Trois problèmes, relevés le 12 septembre 2026 :
//
//  1. « actif » annonçait un envoi automatique qu'aucune automatisation
//     publiée ne fait — la colonne n'est lue par rien (voir
//     parametres/capacites.js). Un indicateur qui ne correspond à aucun
//     comportement réel est pire qu'une absence : le garage croit que Nexora
//     répond à sa place.
//  2. « réponses manuelles » ne disait pas de quoi il parlait — des demandes
//     entrantes ? des devis ? des factures ?
//  3. rien ne distinguait les quatre situations que le garage vit vraiment :
//     ce qu'il saisit lui-même, ce qu'il prépare et confirme, ce qui partirait
//     tout seul, et ce que le client lui renvoie.
//
// Ces quatre lignes remplacent la pastille. Elles ne décrivent que des
// comportements observés, jamais une intention. Si un envoi automatique est un
// jour branché, c'est `CAPACITES` qui bascule, et la ligne avec.

export const NATURE_MANUELLE = "manuelle";
export const NATURE_PREPAREE = "preparee";
export const NATURE_AUTOMATIQUE = "automatique";
export const NATURE_REPONSE = "reponse";

/**
 * Les lignes d'état des communications, dans l'ordre où elles se lisent.
 *
 * `automatiqueDisponible` vient de `CAPACITES` : tant qu'aucune automatisation
 * n'est branchée, on l'écrit en toutes lettres au lieu de laisser croire.
 * `canauxEnAttente` liste les canaux qu'un garage a choisis autrefois et que
 * rien ne dessert (SMS, WhatsApp) : ils restent nommés, pour ne pas laisser
 * croire qu'ils marchent.
 */
export function lignesEtatEnvois({ automatiqueDisponible = false, canauxEnAttente = [] } = {}) {
  const lignes = [
    {
      cle: "devis_factures",
      nature: NATURE_PREPAREE,
      titre: "Devis et factures",
      detail: "Vous relisez le message, puis vous confirmez l'envoi. Rien ne part avant.",
      ton: "pret",
    },
    {
      cle: "demandes",
      nature: NATURE_MANUELLE,
      titre: "Demandes et rappels",
      detail: "Vous y répondez vous-même, depuis le tableau de bord.",
      ton: "neutre",
    },
    {
      cle: "automatique",
      nature: NATURE_AUTOMATIQUE,
      titre: "Envois automatiques",
      detail: automatiqueDisponible
        ? "Certains messages partent seuls, sans relecture."
        : "Aucun. Nexora n'écrit jamais à un client sans que vous l'ayez demandé.",
      ton: automatiqueDisponible ? "attention" : "neutre",
    },
    {
      cle: "reponses",
      nature: NATURE_REPONSE,
      titre: "Réponses des clients",
      detail: "Elles arrivent par le lien du devis et remontent sur cet écran.",
      ton: "neutre",
    },
  ];

  for (const canal of canauxEnAttente) {
    lignes.push({
      cle: `canal_${canal}`,
      nature: NATURE_AUTOMATIQUE,
      titre: canal === "sms" ? "SMS" : canal === "whatsapp" ? "WhatsApp" : canal,
      detail: "Canal choisi autrefois, mais rien ne l'envoie aujourd'hui.",
      ton: "attention",
    });
  }

  return lignes;
}
