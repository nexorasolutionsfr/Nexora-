// Échéances d'une voiture d'automobiliste : kilométrage connu, contrôle
// technique, entretien.
//
// Règle de conduite : aucune précision inventée. Une échéance ne se calcule
// qu'à partir de ce que la personne a renseigné ; sinon on dit ce qui manque.
// Chaque résultat porte sa source, pour que l'écran puisse l'expliquer.
//
// Les dates sont des chaînes « AAAA-MM-JJ », comme la base les renvoie, et
// se calculent en UTC pour qu'aucun fuseau ne décale un jour.

const JOUR_MS = 24 * 60 * 60 * 1000;

// Seule une révision remet à zéro l'échéance de révision : l'intervalle
// recopié du carnet est celui de la révision, et une vidange seule ne la
// remplace pas.
export const TYPES_ENTRETIEN = ["revision"];

// Contrôle technique d'une VOITURE PARTICULIÈRE (catégorie M1, 3,5 t au plus).
// Règles relues sur service-public.fr (F2878) le 16 septembre 2026 :
// - premier contrôle au cours des 6 mois avant le 4e anniversaire de la mise
//   en circulation (mise en circulation le 1er oct. 2022 : entre le 1er avril
//   et le 30 septembre 2026) ;
// - résultat favorable : valable 2 ans (contrôle du 14 mai 2025 : valable
//   jusqu'au 13 mai 2027) ;
// - défavorable pour défaillance majeure : valable 2 mois (14 mai 2026 :
//   jusqu'au 13 juillet 2026) ;
// - défavorable pour défaillance critique : validité limitée au jour même ;
// - dans les deux cas défavorables, contre-visite au plus tard 2 mois après
//   (13 juillet 2026) ;
// - contre-visite favorable : valable 2 ans à compter du contrôle défavorable
//   qui l'a motivée (5 juin 2026 : jusqu'au 4 juin 2028).
// La date inscrite sur le procès-verbal prime toujours sur ce calcul, et c'est
// elle qu'on demande dès que la règle ne suffit pas.
export const CT_PREMIER_ANS = 4;
export const CT_FENETRE_MOIS = 6;
export const CT_VALIDITE_FAVORABLE_MOIS = 24;
export const CT_DELAI_CONTRE_VISITE_MOIS = 2;
export const RESULTATS_DEFAVORABLES = ["defavorable_majeure", "defavorable_critique"];

// Seuil à partir duquel une échéance est signalée comme proche.
export const JOURS_ALERTE = 60;
export const KM_ALERTE = 1500;

function versDate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function versIso(date) {
  return date.toISOString().slice(0, 10);
}

// Ajoute des mois en restant dans le mois visé : 29 février + 1 an donne le
// 28 février, jamais le 1er mars.
export function ajouterMois(iso, mois) {
  const d = versDate(iso);
  if (!d) return null;
  const annee = d.getUTCFullYear();
  const moisCible = d.getUTCMonth() + mois;
  const dernierJour = new Date(Date.UTC(annee, moisCible + 1, 0)).getUTCDate();
  const jour = Math.min(d.getUTCDate(), dernierJour);
  return versIso(new Date(Date.UTC(annee, moisCible, jour)));
}

export function joursEntre(debutIso, finIso) {
  const debut = versDate(debutIso);
  const fin = versDate(finIso);
  if (!debut || !fin) return null;
  return Math.round((fin.getTime() - debut.getTime()) / JOUR_MS);
}

export function aujourdhuiIso(maintenant = new Date()) {
  const y = maintenant.getFullYear();
  const m = String(maintenant.getMonth() + 1).padStart(2, "0");
  const j = String(maintenant.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

function plusRecent(a, b) {
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return (a.kilometrage ?? -1) >= (b.kilometrage ?? -1) ? a : b;
}

// Le kilométrage le plus récent parmi les relevés et les interventions qui en
// portent un. Le plus récent par date ; à date égale, le plus élevé.
export function dernierKilometrage({ releves = [], historique = [] } = {}) {
  const candidats = [
    ...releves
      .filter((r) => Number.isFinite(r?.kilometrage) && versDate(r?.releve_le))
      .map((r) => ({ kilometrage: r.kilometrage, date: r.releve_le.slice(0, 10), origine: "releve" })),
    ...historique
      .filter((h) => Number.isFinite(h?.kilometrage) && versDate(h?.realise_le))
      .map((h) => ({ kilometrage: h.kilometrage, date: h.realise_le.slice(0, 10), origine: "intervention" })),
  ];
  if (candidats.length === 0) return null;
  return candidats.reduce(plusRecent);
}

function derniereIntervention(historique, types) {
  const retenues = historique.filter((h) => types.includes(h?.type) && versDate(h?.realise_le));
  if (retenues.length === 0) return null;
  return retenues.reduce((a, b) => {
    const da = a.realise_le.slice(0, 10);
    const db = b.realise_le.slice(0, 10);
    if (da !== db) return da > db ? a : b;
    return (a.kilometrage ?? -1) >= (b.kilometrage ?? -1) ? a : b;
  });
}

function niveau(joursRestants) {
  if (joursRestants < 0) return "depasse";
  if (joursRestants <= JOURS_ALERTE) return "proche";
  return "ok";
}

// Dernier jour d'une durée qui court à partir d'une date : la veille du même
// quantième, n mois plus tard (14 mai 2025 + 24 mois : 13 mai 2027). Si ce
// quantième n'existe pas (29 février, 31), la durée finit le dernier jour du
// mois atteint.
export function dateLimiteValidite(iso, mois) {
  const atteint = ajouterMois(iso, mois);
  if (!atteint) return null;
  if (atteint.slice(8, 10) !== iso.slice(8, 10)) return atteint;
  return ajouterJours(atteint, -1);
}

export function ajouterJours(iso, jours) {
  const d = versDate(iso);
  if (!d) return null;
  return versIso(new Date(d.getTime() + jours * JOUR_MS));
}

const defavorable = (controle) => RESULTATS_DEFAVORABLES.includes(controle?.resultat_controle);
const estContreVisite = (controle) => controle?.nature_controle === "contre_visite";

// Prochain contrôle technique.
//
// Retour, toujours avec `fondement` quand une date est donnée :
// "officiel" (procès-verbal) ou "calcul" (règle ci-dessus) :
// - { etat: "a_renseigner", manque: "mise_en_circulation" | "dernier_controle" | "date_proces_verbal" }
// - { etat: "contre_visite", resultat, date (limite de la contre-visite), valableJusquAu,
//     dernierLe, initialLe, joursRestants, niveau, fondement }
// - { etat: "calcule", source: "proces_verbal" | "dernier_controle" | "contre_visite_favorable" | "mise_en_circulation",
//     date, joursRestants, niveau, fondement, dernierLe?, initialLe?, fenetreOuverteLe? }
export function prochainControleTechnique({ dateMiseEnCirculation, historique = [], aujourdhui }) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const controles = historique
    .filter((h) => h?.type === "controle_technique" && versDate(h?.realise_le))
    .map((h) => ({ ...h, realise_le: h.realise_le.slice(0, 10) }))
    .sort((a, b) => (a.realise_le < b.realise_le ? 1 : a.realise_le > b.realise_le ? -1 : 0));
  const dernier = controles[0];
  const delai = (date) => {
    const joursRestants = joursEntre(jour, date);
    return { date, joursRestants, niveau: niveau(joursRestants) };
  };
  const officielle = (controle) => (versDate(controle?.controle_valable_jusqu_au) ? controle.controle_valable_jusqu_au.slice(0, 10) : null);

  // Le contrôle périodique défavorable qui a motivé une contre-visite passée
  // à `date` : le plus récent avant elle, dont le délai de 2 mois court encore.
  const initialAvant = (date) =>
    controles.find(
      (c) => c.realise_le < date && !estContreVisite(c) && defavorable(c) && date <= dateLimiteValidite(c.realise_le, CT_DELAI_CONTRE_VISITE_MOIS),
    );

  if (dernier) {
    const dernierLe = dernier.realise_le;

    // 1. Résultat défavorable : une contre-visite est à faire.
    if (defavorable(dernier)) {
      const initial = estContreVisite(dernier) ? initialAvant(dernierLe) : dernier;
      if (!initial) return { etat: "a_renseigner", manque: "date_proces_verbal", dernierLe };
      const limite = dateLimiteValidite(initial.realise_le, CT_DELAI_CONTRE_VISITE_MOIS);
      const valableJusquAu =
        officielle(dernier) ?? (dernier.resultat_controle === "defavorable_critique" ? dernierLe : dateLimiteValidite(dernierLe, CT_DELAI_CONTRE_VISITE_MOIS));
      return {
        etat: "contre_visite",
        resultat: dernier.resultat_controle,
        valableJusquAu,
        dernierLe,
        initialLe: initial.realise_le,
        fondement: officielle(dernier) ? "officiel" : "calcul",
        ...delai(limite),
      };
    }

    // 2. La date du procès-verbal fait foi.
    if (officielle(dernier)) {
      return { etat: "calcule", source: "proces_verbal", fondement: "officiel", dernierLe, ...delai(officielle(dernier)) };
    }

    // 3. Contre-visite favorable : 2 ans à compter du contrôle initial.
    if (estContreVisite(dernier)) {
      const initial = initialAvant(dernierLe);
      if (!initial) return { etat: "a_renseigner", manque: "date_proces_verbal", dernierLe };
      return {
        etat: "calcule",
        source: "contre_visite_favorable",
        fondement: "calcul",
        dernierLe,
        initialLe: initial.realise_le,
        ...delai(dateLimiteValidite(initial.realise_le, CT_VALIDITE_FAVORABLE_MOIS)),
      };
    }

    // 4. Un contrôle « périodique » qui tombe dans le délai de contre-visite
    //    d'un contrôle défavorable est peut-être la contre-visite : on ne
    //    devine pas, on demande la date du procès-verbal.
    if (initialAvant(dernierLe)) {
      return { etat: "a_renseigner", manque: "date_proces_verbal", dernierLe };
    }

    // 5. Contrôle favorable (ou résultat non précisé) : 2 ans.
    return {
      etat: "calcule",
      source: "dernier_controle",
      fondement: "calcul",
      dernierLe,
      ...delai(dateLimiteValidite(dernierLe, CT_VALIDITE_FAVORABLE_MOIS)),
    };
  }

  if (!versDate(dateMiseEnCirculation)) {
    return { etat: "a_renseigner", manque: "mise_en_circulation" };
  }

  const miseEnCirculation = dateMiseEnCirculation.slice(0, 10);
  const premier = dateLimiteValidite(miseEnCirculation, CT_PREMIER_ANS * 12);
  if (jour > premier) {
    // La voiture a passé l'âge du premier contrôle : sans le dernier, on ne
    // sait pas quand tombe le prochain.
    return { etat: "a_renseigner", manque: "dernier_controle" };
  }
  return {
    etat: "calcule",
    source: "mise_en_circulation",
    fondement: "calcul",
    fenetreOuverteLe: ajouterMois(miseEnCirculation, CT_PREMIER_ANS * 12 - CT_FENETRE_MOIS),
    ...delai(premier),
  };
}

// Tout ce qui manque pour calculer la prochaine révision — pas seulement la
// première chose rencontrée.
//
// Le formulaire annonçait « il manque une seule chose » alors que la fiche du
// service, elle, listait aussi la dernière révision : on renseignait « la
// dernière chose » et une nouvelle demande apparaissait derrière (constat du
// 18 sept. 2026). Les manques se comptent donc en une fois, ici, et les deux
// écrans lisent la même liste.
//
// Codes rendus, dans l'ordre où on les demande :
// - "derniere_intervention" : aucune révision enregistrée (le point de départ) ;
// - "intervalle"            : tous les combien elle revient ;
// - "kilometrage_revision"  : intervalle au compteur seul, et dernière révision
//                             enregistrée sans kilométrage.
export function manquesRevision({ intervalleKm, intervalleMois, historique = [] } = {}) {
  const km = Number.isFinite(intervalleKm) && intervalleKm > 0 ? intervalleKm : null;
  const mois = Number.isFinite(intervalleMois) && intervalleMois > 0 ? intervalleMois : null;
  const dernier = derniereIntervention(historique, TYPES_ENTRETIEN);

  const manques = [];
  if (!dernier) manques.push("derniere_intervention");
  if (!km && !mois) manques.push("intervalle");
  // Ce troisième manque ne se constate que si l'intervalle est connu ET au
  // compteur seul : tant qu'on ignore l'intervalle, on ignore si le
  // kilométrage de la dernière révision servira.
  if (dernier && km && !mois && !Number.isFinite(dernier.kilometrage)) manques.push("kilometrage_revision");
  return manques;
}

// Prochaine révision, d'après l'intervalle recopié du carnet.
//
// Retour :
// - { etat: "intervalle_a_renseigner" }
// - { etat: "dernier_entretien_a_renseigner" }   — aucune révision passée
// - { etat: "calcule", depuis: { date, kilometrage, type },
//     parKm?: { limite, restants, niveau }, parDate?: { limite, joursRestants, niveau },
//     niveau }   — niveau global : le plus urgent des deux.
export function prochainEntretien({ intervalleKm, intervalleMois, historique = [], releves = [], aujourdhui }) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const km = Number.isFinite(intervalleKm) && intervalleKm > 0 ? intervalleKm : null;
  const mois = Number.isFinite(intervalleMois) && intervalleMois > 0 ? intervalleMois : null;
  if (!km && !mois) return { etat: "intervalle_a_renseigner" };

  const dernier = derniereIntervention(historique, TYPES_ENTRETIEN);
  if (!dernier) return { etat: "dernier_entretien_a_renseigner" };

  // La source est toujours l'intervalle renseigné par la personne : l'écran
  // doit le dire, ce n'est pas une préconisation du constructeur.
  const resultat = {
    etat: "calcule",
    source: "intervalle_renseigne",
    intervalle: { km, mois },
    depuis: { date: dernier.realise_le.slice(0, 10), kilometrage: dernier.kilometrage ?? null, type: dernier.type },
  };
  const urgences = [];

  if (mois) {
    const limite = ajouterMois(dernier.realise_le.slice(0, 10), mois);
    const joursRestants = joursEntre(jour, limite);
    resultat.parDate = { limite, joursRestants, niveau: niveau(joursRestants) };
    urgences.push(resultat.parDate.niveau);
  }

  const actuel = dernierKilometrage({ releves, historique });
  if (km && Number.isFinite(dernier.kilometrage)) {
    const limite = dernier.kilometrage + km;
    const parKm = { limite, restants: null, niveau: null };
    // Un compteur relevé AVANT l'entretien ne dit rien de ce qui reste.
    if (actuel && actuel.date >= resultat.depuis.date) {
      parKm.restants = limite - actuel.kilometrage;
      parKm.niveau = parKm.restants < 0 ? "depasse" : parKm.restants <= KM_ALERTE ? "proche" : "ok";
      urgences.push(parKm.niveau);
    }
    resultat.parKm = parKm;
  }

  resultat.niveau = urgences.includes("depasse") ? "depasse" : urgences.includes("proche") ? "proche" : urgences.length ? "ok" : null;
  return resultat;
}
