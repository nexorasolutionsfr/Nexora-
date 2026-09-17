// Ce qu'il manque au suivi d'entretien d'une voiture, dit en une fois.
//
// Deux écrans posaient la même question autrement, et se contredisaient :
// le formulaire d'intervalle annonçait « il manque une seule chose », la fiche
// du service listait en plus la dernière révision (constat du 18 sept. 2026).
// Les deux lisent maintenant `manquesRevision`, qui compte tout.
//
// Module pur, testé (entretien.test.js). Aucun intervalle constructeur, aucune
// valeur « courante » : Nexora ne devine pas ce que dit un carnet.

import { manquesRevision } from "./echeances.js";

// Chaque manque porte son libellé, la raison pour laquelle Nexora ne le devine
// pas, et le geste qui le comble. `action` est le code lu par la fiche véhicule
// (?action=…), pas une adresse : ce module ne connaît pas les écrans.
export const MANQUES = {
  derniere_intervention: {
    libelle: "La date de votre dernière révision",
    pourquoi: "C'est le point de départ du calcul. Une vidange seule ne compte pas comme une révision.",
    action: "revision",
    geste: "Enregistrer ma dernière révision",
  },
  intervalle: {
    libelle: "Tous les combien elle doit être révisée",
    pourquoi: "C'est écrit sur le carnet d'entretien, et souvent repris sur la facture de la dernière révision. Les intervalles dépendent de la motorisation : une valeur approchée ferait une échéance fausse.",
    action: "intervalle",
    geste: "Renseigner l'intervalle",
  },
  kilometrage_revision: {
    libelle: "Le kilométrage de votre dernière révision",
    pourquoi: "Votre intervalle est au compteur : sans ce point de départ, l'échéance ne se situe pas.",
    action: "revision",
    geste: "Enregistrer une révision avec son compteur",
  },
};

// [{ cle, libelle, pourquoi, action, geste }] — vide quand rien ne manque.
export function manquesEntretien(vehicule) {
  if (!vehicule) return [];
  return manquesRevision({
    intervalleKm: vehicule.intervalle_entretien_km,
    intervalleMois: vehicule.intervalle_entretien_mois,
    historique: vehicule.historique ?? [],
  }).map((cle) => ({ cle, ...MANQUES[cle] }));
}

// « Il manque une seule chose » ne s'écrit que s'il n'en manque qu'une.
export function phraseManques(manques = []) {
  if (manques.length === 0) return null;
  if (manques.length === 1) return "Il manque une seule chose pour calculer votre prochaine révision :";
  const nombres = { 2: "deux", 3: "trois" };
  return `Il manque ${nombres[manques.length] ?? manques.length} choses pour calculer votre prochaine révision :`;
}

// Une facture de révision porte souvent la date, le kilométrage ET l'intervalle
// préconisé : quand plusieurs choses manquent, c'est le geste le plus court.
export function factureDAbord(manques = []) {
  return manques.length > 1;
}

// ---------------------------------------------------------------------------
// Ce que « Entretenir ma voiture » doit dire de CETTE voiture
// ---------------------------------------------------------------------------
//
// L'entrée menait à cinq prestations à choisir soi-même : un classement, pas
// une aide. Elle commence désormais par l'état réel du dossier.
//
// Rend { cas, titre, texte, manques, element } :
// - "a_preciser" : le suivi ne se calcule pas encore, et on dit quoi faire ;
// - "echeance"   : une révision est dépassée ou approche ;
// - "suivi"      : elle est calculée et lointaine ;
// - "sans_voiture" : aucune voiture choisie.
export function etatEntretien({ vehicule = null, elements = [] } = {}) {
  if (!vehicule) return { cas: "sans_voiture", manques: [], element: null };

  const manques = manquesEntretien(vehicule);
  const element = elements.find((el) => el.genre === "revision" && el.vehicule?.id === vehicule.id) ?? null;

  if (manques.length > 0) {
    return {
      cas: "a_preciser",
      titre: "Votre suivi d'entretien reste à préciser.",
      texte: "Retrouvez votre dernière intervention, ou ajoutez son justificatif : Nexora calculera la suite.",
      manques,
      element,
    };
  }

  if (element?.niveau === "depasse" || element?.niveau === "proche") {
    return { cas: "echeance", titre: element.titre, texte: element.quand, manques, element };
  }

  return { cas: "suivi", titre: "Votre suivi d'entretien est à jour.", texte: element?.quand ?? null, manques, element };
}
