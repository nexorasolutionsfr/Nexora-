// Ce que le client voit d'un devis — une seule définition.
//
// La page publique (`app/devis/[token]`) et l'aperçu montré au garage étaient
// deux dessins distincts. L'aperçu annonçait « exactement ce que le client
// verra » et n'avait ni les lignes ni la TVA (recette du 2026-09-11). Les deux
// passent désormais par ce modèle, puis par le même composant
// (DevisVueClient) : ce que le garage relit est ce que le client ouvre.
//
// Deux sources, une forme :
//  - la page publique reçoit `lire_devis_par_jeton` (garage_nom, vehicule,
//    prestation, montants, lignes avec montant_ttc) ;
//  - le garage a son devis chargé (vehicule déjà formé « marque modèle »,
//    prestations.nom, devis_lignes avec montant_ht et montant_tva).

import { calculerLigne, formatEuro } from "./calculs.js";

export const euros = formatEuro;

const TYPE_LABEL = { main_oeuvre: "Main d'œuvre", piece: "Pièce" };

const arrondi = (n) => Math.round(Number(n || 0) * 100) / 100;

function montantTtcLigne(l) {
  if (l.montant_ttc != null) return arrondi(l.montant_ttc);
  if (l.montant_ht != null && l.montant_tva != null) return arrondi(Number(l.montant_ht) + Number(l.montant_tva));
  return arrondi(calculerLigne(l).montant_ttc);
}

// La page publique reçoit ses lignes déjà ordonnées ; le garage les a avec
// leur position. On ne réordonne que si chaque ligne porte la sienne.
function ordonner(lignes) {
  const liste = Array.isArray(lignes) ? [...lignes] : [];
  if (liste.length > 0 && liste.every((l) => l.position != null)) {
    liste.sort((a, b) => Number(a.position) - Number(b.position));
  }
  return liste;
}

function vue({ garage, vehicule, prestation, montantHt, montantTtc, lignes }) {
  const ht = arrondi(montantHt);
  const ttc = arrondi(montantTtc);
  return {
    garage: garage || "Votre garage",
    vehicule: vehicule || "Véhicule",
    prestation: prestation || "—",
    lignes: ordonner(lignes).map((l) => ({
      id: l.id,
      libelle: l.libelle,
      type: TYPE_LABEL[l.type] || l.type,
      quantite: Number(l.quantite),
      prixUnitaireHt: arrondi(l.prix_unitaire_ht),
      tauxTva: Number(l.taux_tva),
      montantTtc: montantTtcLigne(l),
    })),
    montantHt: ht,
    montantTva: arrondi(ttc - ht),
    montantTtc: ttc,
  };
}

/** Depuis la réponse de `lire_devis_par_jeton`. */
export function vueDepuisPagePublique(info) {
  return vue({
    garage: info?.garage_nom,
    vehicule: info?.vehicule,
    prestation: info?.prestation,
    montantHt: info?.montant_ht,
    montantTtc: info?.montant_ttc,
    lignes: info?.lignes,
  });
}

/** Depuis un devis tel que le tableau de bord le charge. */
export function vueDepuisDevisGarage(devis, garageNom) {
  return vue({
    garage: garageNom,
    vehicule: devis?.vehicule,
    // Le nom brut : le libellé de repli « Prestation » est propre à la carte.
    prestation: devis?.prestations?.nom,
    montantHt: devis?.montant_ht,
    montantTtc: devis?.montant_ttc,
    lignes: devis?.devis_lignes,
  });
}
