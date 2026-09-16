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
