// La phrase qui résume la journée, en haut de l'accueil.
//
// CE QU'ELLE REMPLACE
//
// Quatre compteurs affichant « 0, 0, 0, 0 € », puis trois cartes annonçant
// « rien à traiter », « rien de préparé », « rien à risque ». Six cents pixels
// pour dire qu'il ne se passe rien, avant la première information réelle.
//
// Une phrase dit la même chose en une ligne, et surtout elle la HIÉRARCHISE :
// ce qui compte d'abord, ce qui compte ensuite. C'est ce qu'un associé
// annoncerait en arrivant le matin.
//
// LA RÈGLE ABSOLUE : RIEN N'EST ESTIMÉ
//
// Chaque fragment vient d'un compteur que Nexora sait déjà calculer, et qui
// est affiché ailleurs à l'identique. Une phrase de synthèse qui arrondit,
// devine ou extrapole devient invérifiable — et le jour où elle se trompe, le
// garage cesse de croire tout le reste de l'écran.
//
// Quand il n'y a rien de particulier à dire, on le dit simplement. On ne
// meuble jamais.

function pluriel(n, singulier, plurielMot) {
  return n === 1 ? singulier : plurielMot;
}

/** « 1 250 € », sans décimale : à l'échelle d'un coup d'œil, les centimes sont du bruit. */
function euros(montant) {
  return `${Math.round(montant).toLocaleString("fr-FR")} €`;
}

/**
 * @param {object} etat
 * @param {number} etat.rdvAujourdhui      rendez-vous du jour
 * @param {number} etat.vehiculesEngages   voitures actuellement à l'atelier
 * @param {number} etat.decisionsEnAttente ce qui attend une décision du garage
 * @param {number} etat.montantRisque      euros qui peuvent échapper faute de relance
 * @param {boolean} etat.ferme             le garage est fermé aujourd'hui
 * @returns {{texte: string, ton: "calme" | "attention"}}
 */
export function resumeJournee({
  rdvAujourdhui = 0,
  vehiculesEngages = 0,
  decisionsEnAttente = 0,
  montantRisque = 0,
  ferme = false,
} = {}) {
  const morceaux = [];

  // 1 — La journée.
  //
  // Un jour de fermeture, on ne dit RIEN du nombre de rendez-vous : ni « zéro »,
  // qui ferait passer une fermeture pour un creux d'activité, ni « fermé
  // aujourd'hui », que la pastille de l'en-tête affiche déjà juste au-dessus.
  // Deux fois la même information à trois centimètres d'écart, c'est une fois
  // de trop.
  if (ferme) {
    // rien : la pastille parle
  } else if (rdvAujourdhui === 0) {
    morceaux.push("Aucun rendez-vous aujourd'hui");
  } else {
    morceaux.push(`${rdvAujourdhui} ${pluriel(rdvAujourdhui, "voiture attendue", "voitures attendues")} aujourd'hui`);
  }

  // 2 — L'atelier. Une voiture encore présente un jour de fermeture est
  // précisément ce qu'on veut voir mentionné.
  if (vehiculesEngages > 0) {
    morceaux.push(`${vehiculesEngages} à l'atelier`);
  }

  const debut = morceaux.join(", ");

  // Une phrase qui commencerait par un tiret n'est pas une phrase. Quand il
  // n'y a rien à dire de la journée — garage fermé, atelier vide — on part
  // directement sur ce qui compte.
  const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // 3 — Ce qui bloque. Une seule chose à la fois : deux alertes dans la même
  // phrase, et aucune des deux n'est lue.
  const assembler = (suite) => (debut ? `${debut} — ${suite}` : majuscule(suite));

  if (decisionsEnAttente > 0) {
    return {
      texte: `${assembler(`${decisionsEnAttente} ${pluriel(decisionsEnAttente, "décision vous attend", "décisions vous attendent")}`)}.`,
      ton: "attention",
    };
  }

  if (montantRisque > 0) {
    return { texte: `${assembler(`${euros(montantRisque)} à relancer`)}.`, ton: "attention" };
  }

  return { texte: `${assembler("rien qui bloque")}.`, ton: "calme" };
}
