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

// La preuve d'une ligne : le constat copié à la reprise et les chemins de ses
// photos. Côté public, `lire_devis_par_jeton` la fournit (photos figées dès
// que le devis est décidé). Côté garage, l'aperçu n'a que le texte : les
// photos sont signées pour le client par la route /api/devis/preuves.
function preuveDe(l) {
  if (l.preuve) {
    return { constat: l.preuve.constat || null, photos: Array.isArray(l.preuve.photos) ? l.preuve.photos : [] };
  }
  if (l.inspection_point_id) return { constat: l.note_constat || null, photos: [] };
  return null;
}

// UN CONSTAT SE MONTRE UNE FOIS
// Les lignes ajoutées « pour chiffrer un constat » (main-d'œuvre, pièce d'un
// modèle) portent les mêmes photos que la ligne du constat, sans son texte. Le
// client lisait trois fois « Constat du garage », deux fois vide, avec la même
// photo (recette du 15 septembre 2026). La preuve reste sur la première ligne
// qui la montre ; une ligne suivante la garde si elle a son propre texte ou une
// photo encore jamais montrée.
function sansPreuveRepetee(lignes) {
  const dejaMontrees = new Set();
  return lignes.map((l) => {
    const p = l.preuve;
    if (!p || p.constat || p.photos.length === 0) {
      (p?.photos || []).forEach((id) => dejaMontrees.add(id));
      return l;
    }
    const nouvelles = p.photos.filter((id) => !dejaMontrees.has(id));
    p.photos.forEach((id) => dejaMontrees.add(id));
    return nouvelles.length === 0 ? { ...l, preuve: null } : l;
  });
}

function vue({ garage, vehicule, prestation, montantHt, montantTtc, lignes }) {
  const ht = arrondi(montantHt);
  const ttc = arrondi(montantTtc);
  return {
    garage: garage || "Votre garage",
    vehicule: vehicule || "Véhicule",
    // Pas de prestation : rien. Un « — » seul sous le véhicule ne disait rien au
    // client (devis préparé depuis un constat, recette du 15 septembre 2026).
    prestation: prestation || null,
    lignes: sansPreuveRepetee(ordonner(lignes).map((l) => ({
      id: l.id,
      libelle: l.libelle,
      type: TYPE_LABEL[l.type] || l.type,
      quantite: Number(l.quantite),
      prixUnitaireHt: arrondi(l.prix_unitaire_ht),
      tauxTva: Number(l.taux_tva),
      montantTtc: montantTtcLigne(l),
      preuve: preuveDe(l),
    }))),
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
