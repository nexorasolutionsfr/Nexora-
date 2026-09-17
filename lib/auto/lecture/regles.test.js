import assert from "node:assert/strict";
import test from "node:test";

import { normaliserProposition } from "./proposition.js";
import { datesDansLigne, lireTexteFacture, montantsDansLigne, typeParMots } from "./regles.js";

const lire = (texte) => normaliserProposition(lireTexteFacture([texte]), { aujourdhui: "2026-09-17" });

test("Règles : facture courante, champs lus et opérations regroupées", () => {
  const p = lire(`Atelier Durand Automobiles
7 place du Marché 00020 Bourg-Exemple
Facture n° 4410 du 08/07/2026
Véhicule Ford Fiesta immatriculation DK-915-RT kilométrage : 73 250 km
Plaquettes avant 1 52,00 € 52,00 €
Main-d'œuvre freins avant 1 60,00 € 60,00 €
Essuie-glace 1 18,00 € 18,00 €
Total HT 130,00 €
TVA 20 % 26,00 €
Total TTC 156,00 €`);
  assert.equal(p.estFacture, true);
  assert.deepEqual(p.champs.dateFacture, { valeur: "2026-07-08", certitude: "lue" });
  assert.equal(p.champs.dateIntervention.certitude, "absente");
  assert.deepEqual(p.champs.montantTtc, { valeur: 156, certitude: "lue" });
  assert.deepEqual(p.champs.kilometrage, { valeur: 73250, certitude: "lue" });
  assert.deepEqual(p.champs.immatriculation, { valeur: "DK915RT", certitude: "lue" });
  assert.deepEqual(p.champs.professionnel, { valeur: "Atelier Durand Automobiles", certitude: "incertaine" });
  assert.deepEqual(
    p.operations.map((o) => [o.type, o.libelle, o.certitude]),
    [
      ["freinage", "Plaquettes avant, Main-d'œuvre freins avant", "lue"],
      ["autre", "Essuie-glace", "incertaine"],
    ],
  );
});

test("Règles : kilométrages de garantie, de prochain entretien ou d'assistance jamais pris", () => {
  const p = lire(`Facture 12 — Date : 01/02/2026
Prochain entretien à 90 000 km
Garantie 2 ans ou 50 000 km
Assistance 0 km incluse
Net à payer 80,00 €`);
  assert.equal(p.champs.kilometrage.certitude, "absente");
  const q = lire(`Facture 13 — Date : 01/02/2026\nKm : 41 700\nRévision conseillée dans 15 000 km\nNet à payer 80,00 €`);
  assert.deepEqual(q.champs.kilometrage, { valeur: 41700, certitude: "lue" });
});

test("Règles : dates d'échéance, de mise en circulation ou de validité écartées ; date d'intervention distincte", () => {
  const p = lire(`Facture F-9
Date d'échéance : 15/03/2026
Mise en circulation le 03/04/2015
Date de l'intervention : 27/02/2026
Date de facture : 02/03/2026
Total TTC 99,00 €`);
  assert.deepEqual(p.champs.dateFacture, { valeur: "2026-03-02", certitude: "lue" });
  assert.deepEqual(p.champs.dateIntervention, { valeur: "2026-02-27", certitude: "lue" });
  assert.deepEqual(datesDansLigne("Le 3 février 2026 à Nantes").map((d) => d.iso), ["2026-02-03"]);
  assert.deepEqual(datesDansLigne("le 31/02/2026").map((d) => d.iso), [], "date impossible");
});

test("Règles : total TTC sur la ligne suivante ; incohérence HT + TVA signalée ; total seul incertain", () => {
  assert.deepEqual(lire(`Facture A1 Date : 05/05/2026\nTotal TTC\n1 530,40 €`).champs.montantTtc, { valeur: 1530.4, certitude: "lue" });
  assert.deepEqual(lire(`Facture A2 Date : 05/05/2026\nTotal HT 100,00\nTVA 20,00\nTotal TTC 150,00`).champs.montantTtc, { valeur: 150, certitude: "incertaine" });
  assert.deepEqual(lire(`Ticket de caisse 05/05/2026\nTOTAL 42,50 EUR\nPaiement CB`).champs.montantTtc, { valeur: 42.5, certitude: "incertaine" });
  assert.deepEqual(montantsDansLigne("Échéance 12.06.2026 montant 1 204,80 € et 18 €").map((m) => m.valeur), [1204.8, 18]);
});

test("Règles : devis et attestation ne sont pas des factures", () => {
  assert.equal(lire(`DEVIS n° 77\nValable 30 jours\nTotal TTC 300,00 €`).estFacture, false);
  assert.equal(lire(`Attestation d'assurance\nVéhicule AB-123-CD\nPériode du 01/01/2026 au 31/12/2026`).estFacture, false);
  assert.equal(lire(`Station lavage\n04/04/2026\nTOTAL 12,00 EUR\nMerci de votre visite`).estFacture, true);
});

test("Règles : une vidange reste une vidange ; types par mots-clés", () => {
  const p = lire(`Facture 5 Date : 10/01/2026\nForfait vidange 5W30 1 89,00 €\nTotal TTC 89,00 €`);
  assert.deepEqual(p.operations.map((o) => o.type), ["vidange"]);
  assert.equal(typeParMots("Révision constructeur 30 000 km"), "revision");
  assert.equal(typeParMots("Remplacement courroie de distribution"), "distribution");
  assert.equal(typeParMots("Recharge clim"), "climatisation");
  assert.equal(typeParMots("Frais de dossier"), "autre");
  const ct = lire(`Facture 6 Date : 11/01/2026\nVéhicule : Kia Picanto\nContrôle technique périodique véhicule léger 1 65,00 €\nTotal TTC 78,00 €`);
  assert.deepEqual(ct.operations.map((o) => o.type), ["controle_technique"], "« véhicule » dans un libellé n'exclut pas l'opération");
});

test("Règles : texte vide ou sans information : rien d'inventé", () => {
  const p = lire("");
  assert.equal(p.estFacture, false);
  for (const champ of Object.values(p.champs)) assert.equal(champ.certitude, "absente");
  assert.deepEqual(p.operations, []);
});
