// Ce que le client voit d'une facture — une seule définition.
//
// La page publique (`app/facture/[token]`) et l'aperçu montré au garage
// passent par ce modèle, puis par le même composant (FactureVueClient) : ce
// que le garage relit avant d'envoyer est ce que le client ouvre. Même règle
// que pour le devis (devis-lignes/vueClient.js), même raison : un aperçu qui
// diffère de la page reçue fait valider autre chose que ce qui est envoyé.
//
// Deux sources, une forme :
//  - la page publique reçoit `lire_facture_par_jeton` (garage_nom, numero,
//    vehicule déjà formé, motif, montant_ttc, statut, lignes) ;
//  - le garage a sa facture chargée (vehicules.marque/modele, clients, lignes).

const arrondi = (n) => Math.round(Number(n || 0) * 100) / 100;

export function euros(valeur) {
  return `${arrondi(valeur).toFixed(2)} €`;
}

function lignesVues(lignes) {
  return (Array.isArray(lignes) ? lignes : []).map((l, i) => ({
    id: i,
    description: l.description || "",
    montant: arrondi((Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0)),
  }));
}

function vue({ garage, numero, vehicule, motif, montantTtc, statut, lignes }) {
  return {
    garage: garage || "Votre garage",
    numero: numero || "",
    vehicule: (vehicule || "").trim(),
    motif: motif || "",
    montantTtc: arrondi(montantTtc),
    payee: statut === "payee",
    lignes: lignesVues(lignes),
  };
}

// La page publique : ce que rend `lire_facture_par_jeton`.
export function vueDepuisLecturePublique(info) {
  if (!info) return null;
  return vue({
    garage: info.garage_nom,
    numero: info.numero,
    vehicule: info.vehicule,
    motif: info.motif,
    montantTtc: info.montant_ttc,
    statut: info.statut,
    lignes: info.lignes,
  });
}

// Le garage : sa facture telle que l'écran Factures la charge.
export function vueDepuisFactureGarage(f, nomGarage) {
  if (!f) return null;
  const v = f.vehicules || {};
  return vue({
    garage: nomGarage,
    numero: f.numero,
    vehicule: `${v.marque || ""} ${v.modele || ""}`,
    motif: f.motif,
    montantTtc: f.montant_ttc,
    statut: f.statut,
    lignes: f.lignes,
  });
}
