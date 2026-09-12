// La mise en route d'un garage : ce qu'il lui reste à faire, et où le faire.
//
// LE PROBLÈME
//
// Un garage qui vient de s'inscrire arrive sur un tableau de bord vide, avec
// treize onglets dans le menu de gauche et aucune idée de par où commencer.
// Le catalogue de prestations est posé, l'essai court — mais rien ne lui dit
// que ses horaires ne sont pas renseignés, que son agenda proposera donc des
// créneaux faux, et qu'il a une base clients à reprendre.
//
// TROIS RÈGLES QUE CE MODULE S'IMPOSE
//
// 1. **L'état est DÉDUIT des données, jamais stocké.** Pas de colonne
//    « onboarding_termine » à tenir à jour, qui finirait par mentir. Si le
//    garage a trois mécaniciens, l'étape est faite ; s'il les supprime tous,
//    elle redevient à faire. La liste dit toujours la vérité.
//
// 2. **Ce qui est passé est passé, et ça ne se stocke pas en base non plus.**
//    Un garage qui n'a pas de mécanicien parce qu'il travaille seul ne doit
//    pas voir cette ligne indéfiniment. Le fait de passer une étape est une
//    préférence d'affichage, pas une donnée métier : elle vit dans le
//    navigateur.
//
// 3. **La liste disparaît quand elle n'a plus rien à dire.** Une liste de
//    mise en route qui reste affichée six mois devient du décor. Tout fait ou
//    tout passé, elle s'efface — et on rappelle une fois où retrouver ces
//    réglages.

import { peutVoir } from "../acces-salaries/accesConstants.js";

/** Le garage a-t-il renseigné au moins une plage d'ouverture ? */
export function horairesRenseignes(garageData) {
  const horaires = garageData?.horaires;
  if (!horaires || typeof horaires !== "object") return false;
  return Object.values(horaires).some(
    (plages) =>
      Array.isArray(plages) &&
      plages.some((p) => Array.isArray(p) && p[0] && p[1] && p[0] < p[1]),
  );
}

/**
 * Les étapes de mise en route, dans l'ordre où elles servent au garage.
 *
 * L'ordre n'est pas décoratif. Recette du 2026-09-11 : la première ligne
 * guidée menait à la reprise d'un fichier CSV, et rien ne proposait de créer
 * un client à la main ni un devis — un garage sans fichier restait sans
 * première action utile. D'où, en tête, le premier client (avec sa voiture)
 * puis le premier devis : c'est ce qui prouve l'outil en une minute. Les
 * horaires suivent — sans eux l'agenda propose des créneaux un jour de
 * fermeture —, puis l'équipe, puis le premier rendez-vous.
 *
 * `creation` indique la fenêtre à ouvrir en arrivant : l'étape emmène
 * directement au geste, pas à un écran où il faudrait le chercher.
 */
export function etapesMiseEnRoute({ garageData, mecaniciens = [], clients = [], rendezVous = [], devis = [], role = null }) {
  // Revue du 12 septembre 2026 : la liste proposait « horaires » et « équipe »
  // — donc les Paramètres — à un compte accueil qui n'y a pas droit. Une étape
  // qui mène à un refus n'a rien à faire dans une mise en route. On filtre par
  // les droits existants, sans en élargir aucun.
  return [
    {
      cle: "clients",
      titre: "Votre premier client et sa voiture",
      pourquoi: "Nom, téléphone, e-mail et immatriculation : une minute.",
      action: "Ajouter",
      vue: "clients",
      creation: "client",
      fait: clients.length > 0,
    },
    {
      cle: "premier_devis",
      titre: "Votre premier devis",
      pourquoi: "Main-d'œuvre et pièces : les totaux se calculent seuls.",
      action: "Créer",
      vue: "devis",
      creation: "devis",
      fait: devis.length > 0,
    },
    {
      cle: "horaires",
      titre: "Vos horaires d'ouverture",
      pourquoi: "Sinon l'agenda propose des créneaux les jours de fermeture.",
      action: "Renseigner",
      vue: "parametres",
      onglet: "garage",
      fait: horairesRenseignes(garageData),
    },
    {
      cle: "mecaniciens",
      titre: "Votre équipe",
      pourquoi: "Pour affecter les véhicules et voir qui fait quoi.",
      action: "Ajouter",
      vue: "parametres",
      onglet: "garage",
      fait: mecaniciens.length > 0,
    },
    {
      cle: "premier_rdv",
      titre: "Votre premier rendez-vous",
      pourquoi: "Le tableau de bord s'anime dès qu'une voiture est attendue.",
      action: "Ouvrir l'agenda",
      vue: "agenda",
      fait: rendezVous.length > 0,
    },
  ].filter((etape) => !role || peutVoir(role, etape.vue));
}

/**
 * L'état de la liste, une fois les étapes passées prises en compte.
 *
 * `visible` est faux dès qu'il ne reste rien à proposer : c'est ce qui fait
 * que la liste s'efface d'elle-même au lieu de devenir du décor.
 */
export function etatMiseEnRoute(donnees, passees = []) {
  const etapes = etapesMiseEnRoute(donnees);
  const ignorees = new Set(passees);
  const restantes = etapes.filter((e) => !e.fait && !ignorees.has(e.cle));
  const faites = etapes.filter((e) => e.fait).length;
  return {
    etapes,
    restantes,
    faites,
    total: etapes.length,
    visible: restantes.length > 0,
  };
}
