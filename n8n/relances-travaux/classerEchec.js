// Classement d'un échec d'envoi SMTP (nœud « Envoyer la relance (email) »).
//
// Source unique : `construire.mjs` recopie cette fonction dans le nœud Code
// « Classer l'échec » ; `classerEchec.test.js` la vérifie.
//
// RÈGLE : on ne déduit la nature d'un échec QUE de ce qu'on sait situer dans
// l'échange SMTP. Un nombre à trois chiffres trouvé n'importe où dans un
// message (« 550 € », un numéro de rue, un identifiant) ne veut rien dire.
//
//   - Aucune connexion établie (refus, nom introuvable)      → a_reprendre
//   - Authentification refusée                                → a_reprendre
//   - Réponse du serveur à MAIL FROM, RCPT TO ou à la
//     commande DATA, AVANT la transmission du message :
//       4xx → a_reprendre            5xx → bloque
//   - Réponse du serveur APRÈS la transmission du message
//     (« Message failed ») : le serveur dit explicitement
//     qu'il n'a pas pris le message :
//       4xx → a_reprendre            5xx → bloque
//   - Tout le reste — connexion coupée, délai dépassé, erreur
//     inconnue — peut survenir après que le fournisseur a
//     accepté le message                                      → incertain
//
// `incertain` n'est jamais clos ni repris : la relance reste `envoi_en_cours`
// et l'écran dit « envoi à vérifier ».

function classerEchec(erreur) {
  const e = erreur && typeof erreur === "object" ? erreur : { message: erreur };
  const message = String(e.message || e.description || "").trim();
  const code = String(e.code || "").toUpperCase();
  const commande = String(e.command || "").toUpperCase();
  const reponse = Number.isInteger(e.responseCode) ? e.responseCode : null;
  const extrait = message.slice(0, 200);
  const issue = (resultat, motif) => ({ resultat, motif: `${motif}${extrait ? " : " + extrait : ""}` });

  // 1. Pas de connexion : rien n'a pu partir.
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EDNS"].includes(code)
      || /^(?:connect ECONNREFUSED|getaddrinfo (?:ENOTFOUND|EAI_AGAIN))\b/.test(message)) {
    return issue("a_reprendre", "connexion au fournisseur impossible, rien n'est parti");
  }
  // 2. Authentification refusée : rien n'a pu partir.
  if (code === "EAUTH" || /^(?:Invalid login|Authentication (?:failed|not supported))\b/i.test(message)) {
    return issue("a_reprendre", "authentification refusée par le fournisseur, rien n'est parti");
  }

  // 3. Réponse SMTP située dans l'échange : champs structurés d'abord…
  let etape = null;
  let classe = null;
  if (reponse !== null && reponse >= 400 && reponse < 600) {
    classe = Math.floor(reponse / 100);
    if (["MAIL FROM", "RCPT TO", "DATA"].includes(commande)) etape = "avant";
    else if (commande === "DATA END" || commande === ".") etape = "apres";
  }
  // … sinon les formulations exactes de nodemailer, ancrées en début de message.
  if (etape === null) {
    const avant = message.match(/^(?:Can't send mail - all recipients were rejected|Mail command failed|Recipient command failed|Data command failed):\s*([45])\d\d\b/);
    const apres = message.match(/^Message failed:\s*([45])\d\d\b/);
    if (avant) { etape = "avant"; classe = Number(avant[1]); }
    else if (apres) { etape = "apres"; classe = Number(apres[1]); }
  }
  if (etape === "avant") {
    return classe === 5
      ? issue("bloque", "refus définitif du fournisseur avant le message")
      : issue("a_reprendre", "refus temporaire du fournisseur avant le message");
  }
  if (etape === "apres") {
    return classe === 5
      ? issue("bloque", "refus définitif du fournisseur après le message")
      : issue("a_reprendre", "refus temporaire du fournisseur après le message, non accepté");
  }

  // 4. Tout le reste : le message a pu être accepté. On ne rejoue pas.
  return issue("incertain", "issue inconnue, le message a pu être accepté");
}

if (typeof module !== "undefined") module.exports = { classerEchec };
