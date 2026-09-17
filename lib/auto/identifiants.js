// Identifiants reçus dans une adresse (/auto/vehicules/<id>, ?vehicule=).
//
// La base attend un UUID : lui transmettre autre chose provoque une erreur 400
// de Supabase (« invalid input syntax for type uuid »). Une adresse mal formée
// est donc écartée avant toute requête.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estIdentifiant(valeur) {
  return typeof valeur === "string" && UUID.test(valeur);
}

// Un paramètre facultatif : l'identifiant s'il est bien formé, sinon null.
export function identifiantOuNul(valeur) {
  return estIdentifiant(valeur) ? valeur : null;
}

// Un identifiant neuf (UUID v4) pour un fichier déposé. crypto.randomUUID
// n'existe que sur une page sûre (https ou localhost) ; sur une adresse locale
// en http (téléphone sur le Wi-Fi), getRandomValues suffit.
export function nouvelIdentifiant(source = globalThis.crypto) {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  const o = source.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = Array.from(o, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
