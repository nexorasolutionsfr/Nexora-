// Serveur SMTP de RECETTE, contrôlé — ne relaie rien, ne contacte rien.
//
// Sert à exécuter la VRAIE variante du workflow des relances (nœud
// « Envoyer la relance (email) », nodemailer) contre un serveur dont on pilote
// la réponse, sans qu'aucun message puisse atteindre un destinataire réel :
//   - écoute sur 127.0.0.1 seulement ;
//   - accepte uniquement des destinataires @nexora-recette.invalid ;
//   - garde le message dans un journal local, ne le transmet à personne.
//
// L'issue est pilotée par le début de l'adresse du destinataire :
//   accepte.…     → 250 après le message                       (accepté)
//   temporaire.…  → 451 au RCPT TO, avant le message            (refus temporaire)
//   definitif.…   → 550 au RCPT TO, avant le message            (refus définitif)
//   unefois.…     → 451 au premier RCPT TO, 250 aux suivants          (reprise)
//   lent.…        → message reçu, 250 après LENT_MS                   (coupure pendant l'attente)
//   coupure.…     → message reçu en entier, puis connexion coupée SANS réponse
//                   (le fournisseur a pu l'accepter : issue incertaine)
//   autre @….invalid → 250 ; hors .invalid → 550 (relais refusé)
//
// Usage : PORT=2525 JOURNAL=/chemin/journal.jsonl node scripts/recette/smtp-controle.mjs
import { appendFileSync } from "node:fs";
import net from "node:net";

const PORT = Number(process.env.PORT || 2525);
const HOTE = process.env.HOTE || "127.0.0.1";
const JOURNAL = process.env.JOURNAL || "smtp-controle.jsonl";
// lent.… → message reçu, 250 seulement après LENT_MS (sert à couper n8n pendant l'attente)
const LENT_MS = Number(process.env.LENT_MS || 15000);
// unefois.… → 451 au premier RCPT TO pour cette adresse, accepté ensuite (reprise réelle)
const dejaRefuses = new Set();
const noter = (o) => appendFileSync(JOURNAL, JSON.stringify({ quand: new Date().toISOString(), ...o }) + "\n");

const serveur = net.createServer((s) => {
  let tampon = "";
  let mode = "commande";
  let loginEtape = 0;
  let de = null;
  let pour = [];
  let corps = "";
  const dire = (l) => { if (!s.destroyed) s.write(l + "\r\n"); };
  const entete = (nom) => (corps.match(new RegExp(`^${nom}:\\s*(.*(?:\\r\\n[ \\t].*)*)`, "im")) || [])[1]?.replace(/\r\n[ \t]/g, " ") || null;

  dire("220 smtp-controle.recette ESMTP recette Nexora (aucun relais)");
  s.on("error", () => {});
  s.on("data", (bloc) => {
    tampon += bloc.toString("utf8");
    while (true) {
      if (mode === "donnees") {
        const fin = tampon.indexOf("\r\n.\r\n");
        if (fin < 0) return;
        corps = tampon.slice(0, fin);
        tampon = tampon.slice(fin + 5);
        mode = "commande";
        const dest = pour[0] || "";
        const trace = { de, pour, from: entete("From"), replyTo: entete("Reply-To"), sujet: entete("Subject"), octets: corps.length };
        if (dest.startsWith("coupure.")) {
          noter({ ...trace, issue: "message reçu puis connexion coupée sans réponse" });
          s.destroy();
          return;
        }
        if (dest.startsWith("lent.")) {
          noter({ ...trace, issue: `message reçu, réponse retardée de ${LENT_MS} ms` });
          setTimeout(() => {
            if (s.destroyed) { noter({ ...trace, issue: "client parti avant la réponse (issue incertaine)" }); return; }
            noter({ ...trace, issue: "accepté (250) après délai, non relayé" });
            dire("250 2.0.0 accepté par le serveur de recette après délai (non relayé)");
          }, LENT_MS);
          continue;
        }
        noter({ ...trace, issue: "accepté (250), non relayé" });
        dire("250 2.0.0 accepté par le serveur de recette (non relayé)");
        continue;
      }
      const i = tampon.indexOf("\r\n");
      if (i < 0) return;
      const ligne = tampon.slice(0, i);
      tampon = tampon.slice(i + 2);
      if (loginEtape === 1) { loginEtape = 2; dire("334 UGFzc3dvcmQ6"); continue; }
      if (loginEtape === 2) { loginEtape = 0; dire("235 2.7.0 authentification de recette acceptée"); continue; }
      const cmd = ligne.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") { dire("250-smtp-controle.recette"); dire("250-AUTH PLAIN LOGIN"); dire("250-8BITMIME"); dire("250 SIZE 10485760"); }
      else if (cmd === "HELO") dire("250 smtp-controle.recette");
      else if (cmd === "AUTH") {
        if (/^AUTH LOGIN/i.test(ligne)) { loginEtape = 1; dire("334 VXNlcm5hbWU6"); }
        else dire("235 2.7.0 authentification de recette acceptée");
      }
      else if (cmd === "MAIL") { de = (ligne.match(/<([^>]*)>/) || [])[1] || ""; pour = []; dire("250 2.1.0 ok"); }
      else if (cmd === "RCPT") {
        const a = ((ligne.match(/<([^>]*)>/) || [])[1] || "").toLowerCase();
        if (!a.endsWith("@nexora-recette.invalid")) { noter({ de, pour: [a], issue: "550 relais refusé (hors recette)" }); dire("550 5.7.1 relais refusé : destinataire hors recette"); }
        else if (a.startsWith("temporaire.")) { noter({ de, pour: [a], issue: "451 au RCPT TO" }); dire("451 4.2.1 boîte temporairement indisponible, réessayez plus tard"); }
        else if (a.startsWith("definitif.")) { noter({ de, pour: [a], issue: "550 au RCPT TO" }); dire("550 5.1.1 boîte inexistante"); }
        else if (a.startsWith("unefois.") && !dejaRefuses.has(a)) { dejaRefuses.add(a); noter({ de, pour: [a], issue: "451 au RCPT TO (première fois seulement)" }); dire("451 4.2.1 boîte temporairement indisponible, réessayez plus tard"); }
        else { pour.push(a); dire("250 2.1.5 ok"); }
      }
      else if (cmd === "DATA") {
        if (!pour.length) dire("554 5.5.1 aucun destinataire valide");
        else { mode = "donnees"; dire("354 terminez par <CRLF>.<CRLF>"); }
      }
      else if (cmd === "RSET") { de = null; pour = []; dire("250 2.0.0 ok"); }
      else if (cmd === "NOOP") dire("250 2.0.0 ok");
      else if (cmd === "QUIT") { dire("221 2.0.0 au revoir"); s.end(); return; }
      else dire("502 5.5.2 commande inconnue");
    }
  });
});

serveur.listen(PORT, HOTE, () => console.log(`smtp-controle en écoute sur ${HOTE}:${PORT} — journal ${JOURNAL}`));
