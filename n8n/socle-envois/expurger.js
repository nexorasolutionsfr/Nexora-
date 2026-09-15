// Expurgation d'un texte d'erreur avant de le journaliser.
//
// Source unique : `construire.mjs` recopie cette fonction dans les nœuds Code
// du socle et du journaliseur ; `expurger.test.js` la vérifie.
//
// Le journal des incidents est lu par des humains et survit aux lignes de
// file : il ne doit contenir ni adresse e-mail, ni lien (un lien public porte
// un jeton), ni clé, ni en-tête d'autorisation. On garde ce qui aide à
// comprendre : le code SMTP, le code réseau, le nom de l'étape.

function expurger(texte, longueur) {
  const max = Number.isInteger(longueur) ? longueur : 300;
  let t = texte === null || texte === undefined ? "" : String(texte);
  t = t
    .replace(/\b(?:https?|wss?):\/\/\S+/gi, "<lien>")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, "<autorisation>")
    .replace(/\b(apikey|api_key|authorization|password|pass|token|jeton|secret)(["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, "$1$2<masqué>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){1,2}/g, "<jeton>")
    .replace(/\b(?:xkeysib|xsmtpsib|sk_live|sk_test|sb_secret)[-_][A-Za-z0-9_-]+/gi, "<clé>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<e-mail>")
    .replace(/\b[0-9a-f]{32,}\b/gi, "<empreinte>")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

if (typeof module !== "undefined") module.exports = { expurger };
