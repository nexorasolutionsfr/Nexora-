// Empreinte SHA-256 d'un fichier : reconnaître une facture déjà déposée avant
// de l'envoyer de nouveau (et avant toute lecture payante).

export async function empreinteSha256(donnees) {
  const tampon = donnees instanceof ArrayBuffer ? donnees : await donnees.arrayBuffer();
  const condensat = await globalThis.crypto.subtle.digest("SHA-256", tampon);
  return Array.from(new Uint8Array(condensat), (o) => o.toString(16).padStart(2, "0")).join("");
}
