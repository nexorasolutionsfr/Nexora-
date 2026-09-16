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

// Contrôle technique d'une VOITURE PARTICULIÈRE standard : premier contrôle
// dans les 6 mois qui précèdent le 4e anniversaire de la première mise en
// circulation, puis tous les 2 ans ; contre-visite dans les 2 mois en cas de
// défaillance majeure ou critique. Source : service-public.fr (F2878).
// La date limite inscrite sur le procès-verbal prime toujours sur ce calcul,
// et c'est elle qu'on demande dès que la règle ne suffit pas.
export const CT_PREMIER_ANS = 4;
export const CT_PERIODICITE_ANS = 2;
export const CT_FENETRE_MOIS = 6;
export const CT_CONTRE_VISITE_MOIS = 2;

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

// Prochain contrôle technique.
//
// Retour :
// - { etat: "a_renseigner", manque: "mise_en_circulation" | "dernier_controle" | "date_proces_verbal" }
// - { etat: "contre_visite", date, dernierLe, joursRestants, niveau }
// - { etat: "calcule", date, source: "proces_verbal" | "dernier_controle" | "mise_en_circulation",
//     joursRestants, niveau: "ok" | "proche" | "depasse", dernierLe?, fenetreOuverteLe? }
export function prochainControleTechnique({ dateMiseEnCirculation, historique = [], aujourdhui }) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const controles = historique
    .filter((h) => h?.type === "controle_technique" && versDate(h?.realise_le))
    .sort((a, b) => (a.realise_le < b.realise_le ? 1 : a.realise_le > b.realise_le ? -1 : 0));
  const dernier = controles[0];

  if (dernier) {
    const dernierLe = dernier.realise_le.slice(0, 10);
    const avecDelai = (date) => {
      const joursRestants = joursEntre(jour, date);
      return { date, dernierLe, joursRestants, niveau: niveau(joursRestants) };
    };

    // 1. La date du procès-verbal fait foi.
    if (versDate(dernier.controle_valable_jusqu_au)) {
      return { etat: "calcule", source: "proces_verbal", ...avecDelai(dernier.controle_valable_jusqu_au.slice(0, 10)) };
    }
    // 2. Contre-visite demandée : jamais d'échéance à deux ans.
    if (dernier.resultat_controle === "contre_visite") {
      return { etat: "contre_visite", ...avecDelai(ajouterMois(dernierLe, CT_CONTRE_VISITE_MOIS)) };
    }
    // 3. Un contrôle qui suit de près une contre-visite : la règle simple ne
    //    dit pas d'où partent les deux ans. On demande le procès-verbal.
    const precedent = controles[1];
    if (precedent?.resultat_controle === "contre_visite" && dernierLe <= ajouterMois(precedent.realise_le.slice(0, 10), CT_CONTRE_VISITE_MOIS)) {
      return { etat: "a_renseigner", manque: "date_proces_verbal", dernierLe };
    }
    // 4. Sinon, estimation : deux ans après le dernier contrôle.
    return { etat: "calcule", source: "dernier_controle", ...avecDelai(ajouterMois(dernierLe, CT_PERIODICITE_ANS * 12)) };
  }

  if (!versDate(dateMiseEnCirculation)) {
    return { etat: "a_renseigner", manque: "mise_en_circulation" };
  }

  const premier = ajouterMois(dateMiseEnCirculation, CT_PREMIER_ANS * 12);
  if (jour > premier) {
    // La voiture a passé l'âge du premier contrôle : sans le dernier, on ne
    // sait pas quand tombe le prochain.
    return { etat: "a_renseigner", manque: "dernier_controle" };
  }
  const joursRestants = joursEntre(jour, premier);
  return {
    etat: "calcule",
    date: premier,
    source: "mise_en_circulation",
    fenetreOuverteLe: ajouterMois(premier, -CT_FENETRE_MOIS),
    joursRestants,
    niveau: niveau(joursRestants),
  };
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
