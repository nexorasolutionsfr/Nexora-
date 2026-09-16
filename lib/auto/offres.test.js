import assert from "node:assert/strict";
import test from "node:test";

import { LIBELLE_NON_DISPONIBLE, RESERVATION_ACTIVE, disponibiliteReservation } from "./offres.js";

const clio = { id: "v", energie: "essence" };
const offre = {
  actif: true,
  service_code: "freinage",
  mode: "chez_un_professionnel",
  codes_postaux: ["75011"],
  energies: null,
  valable_du: "2026-09-01",
  valable_jusqu_au: null,
};
const base = { serviceCode: "freinage", vehicule: clio, aujourdhui: "2026-09-16" };

test("Aujourd'hui : réservation inactive, aucune offre, libellé sobre", () => {
  assert.equal(RESERVATION_ACTIVE, false);
  assert.equal(LIBELLE_NON_DISPONIBLE, "Réservation non disponible actuellement");
  assert.deepEqual(disponibiliteReservation({ ...base }), { reservable: false, raison: "aucune_offre", offres: [] });
});

test("Une fiche n'est jamais réservable sans offre réelle correspondante", () => {
  const cas = [
    { ...offre, actif: false },
    { ...offre, service_code: "batterie" },
    { ...offre, valable_jusqu_au: "2026-09-15" },
    { ...offre, valable_du: "2026-10-01" },
    { ...offre, energies: ["electrique"] },
  ];
  for (const o of cas) {
    const d = disponibiliteReservation({ ...base, codePostal: "75011", offres: [o], reservationActive: true });
    assert.equal(d.reservable, false);
    assert.equal(d.raison, "aucune_offre");
  }
  const autreMode = disponibiliteReservation({ ...base, mode: "a_domicile", codePostal: "75011", offres: [offre], reservationActive: true });
  assert.equal(autreMode.reservable, false);
  const energieInconnue = disponibiliteReservation({ ...base, vehicule: { id: "v", energie: null }, codePostal: "75011", offres: [{ ...offre, energies: ["essence"] }], reservationActive: true });
  assert.equal(energieInconnue.reservable, false, "une énergie inconnue n'est pas présumée compatible");
});

test("Avec une offre : la zone doit être connue, puis la réservation construite", () => {
  assert.equal(disponibiliteReservation({ ...base, offres: [offre], reservationActive: true }).raison, "zone_inconnue");
  assert.equal(disponibiliteReservation({ ...base, codePostal: "69001", offres: [offre], reservationActive: true }).raison, "aucune_offre");
  assert.equal(disponibiliteReservation({ ...base, codePostal: "75011", offres: [offre] }).raison, "reservation_inactive");
  const ok = disponibiliteReservation({ ...base, mode: "chez_un_professionnel", codePostal: "75011", offres: [offre], reservationActive: true });
  assert.equal(ok.reservable, true);
  assert.equal(ok.offres.length, 1);
});
