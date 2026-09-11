// Un véhicule saisi en même temps que son client, ou ajouté à sa fiche.
//
// Recette du 2026-09-11 : aucun écran ne permettait d'ajouter un véhicule à un
// client, sauf la fenêtre de rendez-vous. Pour faire un devis sur une voiture,
// il fallait inventer un rendez-vous. Le véhicule se saisit désormais avec le
// client, ou depuis sa fiche — toujours facultatif, jamais bloquant.

/**
 * Lit la saisie. Rend `null` si rien n'a été rempli : pas de véhicule vide
 * en base. Sinon, chaque champ vide devient `null`, l'immatriculation passe en
 * majuscules — c'est ainsi qu'elle figure sur la plaque et dans les recherches.
 */
export function vehiculeDepuisSaisie({ marque = "", modele = "", immatriculation = "" } = {}) {
  const m = String(marque ?? "").trim();
  const mo = String(modele ?? "").trim();
  const im = String(immatriculation ?? "").trim().toUpperCase();
  if (!m && !mo && !im) return null;
  return { marque: m || null, modele: mo || null, immatriculation: im || null };
}
