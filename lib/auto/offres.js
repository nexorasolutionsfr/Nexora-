// Réservabilité d'un service : seule une OFFRE réelle la rend possible.
//
// Une fiche de service se consulte ; une offre (table auto_offres) existe
// seulement quand un partenaire a validé un service, un mode, une zone et, le
// cas échéant, les énergies concernées. Aujourd'hui aucune offre n'existe et
// la réservation en ligne n'est pas construite : `RESERVATION_ACTIVE` reste à
// faux, et l'écran dit sobrement « Réservation non disponible actuellement ».

export const RESERVATION_ACTIVE = false;

// offres : lignes auto_offres lisibles (actives et en cours de validité).
// Rend { reservable, raison, offres } avec raison parmi :
// "reservation_inactive", "aucune_offre", "zone_inconnue", "reservable".
export function disponibiliteReservation({ serviceCode, mode, vehicule, codePostal = null, offres = [], reservationActive = RESERVATION_ACTIVE, aujourdhui }) {
  const candidates = offres.filter(
    (o) =>
      o.actif &&
      o.service_code === serviceCode &&
      (!mode || o.mode === mode) &&
      (!o.energies?.length || (vehicule?.energie && o.energies.includes(vehicule.energie))) &&
      (!aujourdhui || ((!o.valable_du || o.valable_du <= aujourdhui) && (!o.valable_jusqu_au || o.valable_jusqu_au >= aujourdhui))),
  );
  if (candidates.length === 0) return { reservable: false, raison: "aucune_offre", offres: [] };
  if (!codePostal) return { reservable: false, raison: "zone_inconnue", offres: [] };
  const dansLaZone = candidates.filter((o) => o.codes_postaux?.includes(codePostal));
  if (dansLaZone.length === 0) return { reservable: false, raison: "aucune_offre", offres: [] };
  if (!reservationActive) return { reservable: false, raison: "reservation_inactive", offres: dansLaZone };
  return { reservable: true, raison: "reservable", offres: dansLaZone };
}

export const LIBELLE_NON_DISPONIBLE = "Réservation non disponible actuellement";
