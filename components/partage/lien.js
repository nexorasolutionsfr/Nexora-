// Envoyer un lien à un client, en un geste.
//
// CE QU'ON CORRIGE
//
// Le bouton « Copier le lien » affichait « Lien copié — partagez-le
// manuellement avec le client ». Nexora demandait au garage de faire le
// travail lui-même : ouvrir sa messagerie, retrouver le client, coller,
// rédiger, envoyer. Six gestes pour une chose que le logiciel est censé
// alléger.
//
// POURQUOI DES LIENS `sms:` ET `wa.me` PLUTÔT QU'UN ENVOI SERVEUR
//
// Un envoi côté serveur suppose une clé (Resend, Twilio), un coût par message,
// une adresse d'expéditeur vérifiée et un consentement traçable. Rien de tout
// cela n'est en place, et le garagiste, lui, a déjà son téléphone en main avec
// son numéro, ses conversations et sa signature.
//
// Ces liens ouvrent SON application, avec le message déjà écrit et le bon
// destinataire. Il lui reste à appuyer sur envoyer — ce qui est aussi la
// bonne place pour un humain : c'est son client, son ton, sa responsabilité.
// Rien ne part sans lui.

/** Un numéro français utilisable dans un lien `sms:` ou `wa.me`. */
export function normaliserTelephone(brut) {
  if (typeof brut !== "string") return null;
  const chiffres = brut.replace(/[^\d+]/g, "");
  if (chiffres === "") return null;
  if (chiffres.startsWith("+")) return chiffres;
  // 06 12 34 56 78 → +33612345678. Sans indicatif, WhatsApp refuse le numéro.
  if (/^0\d{9}$/.test(chiffres)) return `+33${chiffres.slice(1)}`;
  return chiffres;
}

/** Le format WhatsApp : chiffres seuls, indicatif compris, sans le « + ». */
export function numeroWhatsApp(brut) {
  const normalise = normaliserTelephone(brut);
  if (!normalise) return null;
  const chiffres = normalise.replace(/\D/g, "");
  return chiffres.length >= 10 ? chiffres : null;
}

/**
 * Le message envoyé au client. Court, signé du garage, sans jargon.
 *
 * On ne dit pas « inspection » : c'est le mot du logiciel. Un client comprend
 * « le point sur votre véhicule ». Et on annonce ce qu'on attend de lui, sinon
 * il ouvre le lien sans savoir qu'une décision est demandée.
 */
export function messagePartage({ type, garage, vehicule, decisionAttendue = false, url }) {
  const objets = {
    controle: "Le point sur votre véhicule",
    devis: "Votre devis",
    facture: "Votre facture",
    atelier: "Le suivi de votre véhicule",
  };
  const intros = {
    controle: "nous avons fait le point sur votre véhicule",
    devis: "voici votre devis",
    facture: "voici votre facture",
    atelier: "voici le suivi de votre véhicule",
  };
  const objet = objets[type] || "Votre véhicule";
  const intro = intros[type] || "voici les informations sur votre véhicule";
  const precision = vehicule ? ` (${vehicule})` : "";
  const suite = decisionAttendue
    ? "Vous pouvez consulter le détail et nous donner votre accord ici :"
    : "Vous pouvez le consulter ici :";
  const signature = garage ? `\n\n${garage}` : "";
  return {
    objet: vehicule ? `${objet} — ${vehicule}` : objet,
    corps: `Bonjour,\n\n${intro}${precision}. ${suite}\n${url}${signature}`,
  };
}

/** `sms:` — le corps passe par `?&body=`, la forme que iOS et Android acceptent tous deux. */
export function lienSms(telephone, corps) {
  const numero = normaliserTelephone(telephone);
  if (!numero) return null;
  return `sms:${numero}?&body=${encodeURIComponent(corps)}`;
}

export function lienWhatsApp(telephone, corps) {
  const numero = numeroWhatsApp(telephone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(corps)}`;
}

export function lienMail(email, objet, corps) {
  if (typeof email !== "string" || !email.includes("@")) return null;
  return `mailto:${email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}
