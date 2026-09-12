// Renvoi de l'e-mail de confirmation — les décisions, sans l'affichage.
//
// POURQUOI CE MODULE EXISTE
//
// L'écran « Vérifiez vos e-mails » était un cul-de-sac : si le message
// n'arrivait pas, le garagiste n'avait aucun moyen d'en redemander un. Or il
// n'arrive pas toujours du premier coup — le service d'e-mail de Supabase a
// un quota horaire, et une adresse mal tapée ne prévient personne.
//
// Le renvoi doit rester rare. Un bouton qu'on peut marteler enverrait dix
// messages, épuiserait le quota du projet, et ferait échouer l'inscription
// du garage suivant. D'où le délai : le bouton se rouvre au bout d'une
// minute, et le décompte est visible pour qu'on comprenne qu'on n'est pas
// bloqué, seulement en attente.
//
// Ces fonctions sont pures et testées ici même ; l'écran ne fait que les
// appeler. Elles ne disent jamais si une adresse possède déjà un compte :
// c'est le rôle de Supabase de ne pas le révéler, ce n'est pas à nous de le
// déduire d'un code d'erreur.

import { RAPPEL_DERNIER_MESSAGE } from "./lienConfirmation.js";

export const DELAI_RENVOI_SECONDES = 60;

// Combien de secondes reste-t-il avant que le bouton se rouvre.
// Jamais négatif : au-delà de l'échéance, c'est zéro, donc « disponible ».
export function secondesAvantRenvoi(prochainRenvoiA, maintenant = Date.now()) {
  if (!prochainRenvoiA) return 0;
  const restant = Math.ceil((prochainRenvoiA - maintenant) / 1000);
  return restant > 0 ? restant : 0;
}

// Le libellé du bouton. Pendant l'attente, il dit l'attente — un bouton grisé
// sans explication est le défaut qu'on vient de corriger sur l'onboarding.
export function libelleRenvoi({ enCours = false, secondesRestantes = 0 } = {}) {
  if (enCours) return "Envoi…";
  if (secondesRestantes > 0) return `Renvoyer l'e-mail (${secondesRestantes} s)`;
  return "Renvoyer l'e-mail";
}

// Le message affiché après une tentative de renvoi.
//
// `erreur` est l'objet rendu par supabase.auth.resend(), ou rien en cas de
// succès. On distingue le seul cas qui a une conduite à tenir différente —
// le quota d'envoi — de tout le reste, volontairement neutre : un message
// d'échec précis renseignerait sur l'existence du compte.
export function messageRenvoi(erreur, email = "") {
  // Le fournisseur a accepté la demande : c'est tout ce qu'on sait. On ne dit
  // ni « envoyé », ni « reçu », ni « délivré » — et on prévient que chaque
  // renvoi rend les liens précédents inutilisables.
  if (!erreur) {
    const destinataire = email ? ` pour ${email}` : "";
    return {
      ton: "succes",
      texte: `Un nouvel e-mail a été demandé${destinataire}. ${RAPPEL_DERNIER_MESSAGE} Il peut mettre une minute à arriver.`,
    };
  }

  const code = erreur.code || "";
  const brut = erreur.message || "";

  if (code === "over_email_send_rate_limit" || erreur.status === 429 || /rate limit/i.test(brut)) {
    return {
      ton: "erreur",
      texte:
        "Trop de demandes en peu de temps : aucun nouvel e-mail ne peut être demandé tout de suite. " +
        "Réessayez dans une heure. Le dernier message reçu reste valable.",
    };
  }

  return {
    ton: "erreur",
    texte:
      "Le renvoi n'a pas abouti. Réessayez dans quelques minutes. " +
      "Si vous avez déjà activé votre espace, revenez à la connexion.",
  };
}
