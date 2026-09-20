// « À prévoir » : ce que Nexora tire de ce qui est déjà enregistré.
//
// Rien n'est à recréer par la personne : le contrôle technique et la révision
// se calculent à partir du dossier de chaque voiture active ; les tâches
// personnelles s'y ajoutent, facultatives. Chaque élément répond à trois
// questions — quoi faire, pour quand, sur quelles informations — et propose
// les gestes utiles. Une voiture archivée ne produit plus rien.
//
// Rappels sobres :
// - « Me le rappeler plus tard » masque le rappel, jamais l'échéance : sa date
//   et son urgence restent affichées.
// - Un contrôle technique qui n'est plus valable est « critique » : il ne se
//   reporte pas et reste en tête des prochaines actions.
// - Le kilométrage n'est demandé que s'il sert à une échéance, et une
//   échéance au compteur n'est jamais calculée sur des kilométrages qui se
//   contredisent.
//
// Pur et testé (aPrevoir.test.js) : la fiche véhicule et l'écran « À prévoir »
// affichent les mêmes phrases.

import { KM_ALERTE, JOURS_ALERTE, aujourdhuiIso, joursEntre, prochainControleTechnique, prochainEntretien } from "../../lib/auto/echeances.js";
import { manquesEntretien } from "../../lib/auto/entretien.js";
import { estimerKilometrage } from "../../lib/auto/kilometrage.js";
import { delaiLisible, formaterDate, formaterKm } from "./format.js";

export const HORIZONS_JOURS = [30, 60, 90];
export const HORIZON_PAR_DEFAUT = 60;

export const FONDEMENTS = {
  officiel: "Date du procès-verbal",
  calcul: "Calcul selon la règle",
  intervalle: "Selon l'intervalle renseigné",
  estimation: "Estimation",
  tache: "Votre tâche",
  manquant: "À compléter",
};

// D'où vient l'information, dit en toutes lettres. « Date officielle » laissait
// croire que Nexora avait vérifié le document : elle n'a vérifié personne. Une
// date saisie par la personne et une date lue sur un justificatif ne se
// présentent donc pas de la même façon (constat de Baptiste, 18 sept. 2026).
//
// La provenance ne qualifie que la date du procès-verbal : c'est ELLE qui a été
// renseignée ou lue. Une date calculée ne l'a été par personne — seul le
// contrôle dont elle part l'a été, et l'explication le nomme. « Calcul selon
// la règle, renseignée par vous » confondait les deux (constat du 18 sept.
// 2026, en préparant le rappel par e-mail, qui doit garder la distinction
// entre date déclarée, lue et calculée).
export function libelleFondement(element) {
  const base = FONDEMENTS[element?.fondement] ?? FONDEMENTS.calcul;
  if (element?.fondement !== "officiel") return base;
  if (element?.provenance === "proprietaire") return `${base}, renseignée par vous`;
  if (element?.provenance === "prestation") return `${base}, lue sur votre document`;
  return base;
}

const RANG = { depasse: 3, proche: 2, ok: 1, neutre: 0 };
const plusUrgent = (...niveaux) => niveaux.filter(Boolean).sort((a, b) => RANG[b] - RANG[a])[0] ?? "neutre";

function identite(vehicule) {
  return { id: vehicule.id, nom: `${vehicule.marque} ${vehicule.modele}`, immatriculation: vehicule.immatriculation ?? null };
}

const action = (code, libelle) => ({ code, libelle });

// ---------------------------------------------------------------------------
// Contrôle technique
// ---------------------------------------------------------------------------

export function elementControle(vehicule, { aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const ct = prochainControleTechnique({ dateMiseEnCirculation: vehicule.date_mise_en_circulation, historique: vehicule.historique ?? [], aujourdhui: jour });
  const base = { genre: "controle_technique", serviceCode: "controle_technique", vehicule: identite(vehicule) };

  if (ct.etat === "a_renseigner") {
    const manques = {
      mise_en_circulation: {
        explication: "Indiquez la date de première mise en circulation (case B de la carte grise) pour le calculer.",
        actions: [action("mise_en_circulation", "Renseigner la mise en circulation")],
      },
      dernier_controle: {
        explication: "La voiture a plus de 4 ans : indiquez la date de son dernier contrôle.",
        actions: [action("controle", "Ajouter le dernier contrôle")],
      },
      date_proces_verbal: {
        explication: `La date du prochain contrôle ne peut pas être déduite du contrôle du ${formaterDate(ct.dernierLe)} : indiquez celle du procès-verbal.`,
        actions: [action("proces_verbal", "Indiquer la date du procès-verbal")],
      },
    };
    return {
      ...base,
      ...manques[ct.manque],
      cle: `controle_technique:${vehicule.id}:a_completer:${ct.manque}`,
      etat: "a_completer",
      titre: "Contrôle technique",
      quand: "Pas encore calculé",
      delai: null,
      niveau: "neutre",
      fondement: "manquant",
      tri: Number.POSITIVE_INFINITY,
    };
  }

  // Plus de contrôle valable : défaillance critique (validité limitée au jour
  // du contrôle), ou date de validité dépassée. Règles relues sur
  // service-public.gouv.fr (F2878, page vérifiée le 1er janvier 2026) le
  // 17 septembre 2026 : circuler sans contrôle valide expose à une amende et
  // à l'immobilisation de la voiture.
  const plusValable = (ct.etat === "contre_visite" && ct.valableJusquAu && ct.valableJusquAu < jour) || ct.niveau === "depasse";
  const critique = plusValable
    ? { critique: true, alerte: "Le contrôle technique n'est plus valable : circuler sans contrôle valide expose à une amende et à l'immobilisation de la voiture." }
    : {};

  if (ct.etat === "contre_visite") {
    const origine = ct.dernierLe !== ct.initialLe
      ? `Contre-visite défavorable du ${formaterDate(ct.dernierLe)} : le délai court depuis le contrôle du ${formaterDate(ct.initialLe)}.`
      : ct.resultat === "defavorable_critique"
        ? `Défaillance critique au contrôle du ${formaterDate(ct.dernierLe)} : sa validité était limitée à ce jour-là.`
        : `Défaillance majeure au contrôle du ${formaterDate(ct.dernierLe)} : contrôle valable jusqu'au ${formaterDate(ct.valableJusquAu)}.`;
    return {
      ...base,
      cle: `contre_visite:${vehicule.id}:${ct.date}`,
      etat: "a_faire",
      titre: "Contre-visite du contrôle technique",
      date: ct.date,
      joursRestants: ct.joursRestants,
      quand: `Au plus tard le ${formaterDate(ct.date)}`,
      delai: delaiLisible(ct.joursRestants),
      niveau: ct.niveau,
      fondement: ct.fondement,
      explication: `${origine} Contre-visite dans les 2 mois suivant le contrôle.`,
      actions: [action("contre_visite", "Enregistrer la contre-visite")],
      tri: ct.joursRestants,
      ...critique,
    };
  }

  // D'où vient la ligne d'historique qui a servi de base : saisie, ou lue sur
  // un document déposé. `source` vaut 'proprietaire' ou 'prestation'.
  const provenance = ct.dernierLe
    ? (vehicule.historique ?? []).find((h) => h?.type === "controle_technique" && h?.realise_le?.slice(0, 10) === ct.dernierLe)?.source ?? null
    : null;

  const explications = {
    proces_verbal: `Date inscrite sur le procès-verbal du contrôle du ${formaterDate(ct.dernierLe)}.`,
    dernier_controle: `Validité de 2 ans du contrôle du ${formaterDate(ct.dernierLe)}, règle d'une voiture particulière. La date du procès-verbal fait foi.`,
    contre_visite_favorable: `Contre-visite favorable du ${formaterDate(ct.dernierLe)} : 2 ans à compter du contrôle initial du ${formaterDate(ct.initialLe)}. La date du procès-verbal fait foi.`,
    mise_en_circulation: `Premier contrôle d'une voiture particulière : dans les 6 mois avant les 4 ans de sa mise en circulation (${formaterDate(vehicule.date_mise_en_circulation)}).`,
  };
  const actions = {
    proces_verbal: [action("controle", "Enregistrer un contrôle")],
    dernier_controle: [action("proces_verbal", "Indiquer la date du procès-verbal"), action("controle", "Enregistrer un contrôle")],
    contre_visite_favorable: [action("proces_verbal", "Indiquer la date du procès-verbal"), action("controle", "Enregistrer un contrôle")],
    mise_en_circulation: [action("controle", "Enregistrer le contrôle")],
  };
  return {
    ...base,
    cle: `controle_technique:${vehicule.id}:${ct.date}`,
    etat: "a_faire",
    titre: "Contrôle technique",
    date: ct.date,
    joursRestants: ct.joursRestants,
    quand: ct.source === "mise_en_circulation" ? `Entre le ${formaterDate(ct.fenetreOuverteLe)} et le ${formaterDate(ct.date)}` : `Avant le ${formaterDate(ct.date)}`,
    delai: delaiLisible(ct.joursRestants),
    niveau: ct.niveau,
    fondement: ct.fondement,
    provenance,
    explication: explications[ct.source],
    actions: actions[ct.source],
    tri: ct.joursRestants,
    ...critique,
  };
}

// ---------------------------------------------------------------------------
// Révision
// ---------------------------------------------------------------------------

export function elementRevision(vehicule, { aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const historique = vehicule.historique ?? [];
  const releves = vehicule.releves ?? [];
  const e = prochainEntretien({
    intervalleKm: vehicule.intervalle_entretien_km,
    intervalleMois: vehicule.intervalle_entretien_mois,
    historique,
    releves,
    aujourdhui: jour,
  });
  const base = { genre: "revision", serviceCode: "revision", vehicule: identite(vehicule), titre: "Révision" };

  if (e.etat !== "calcule") {
    // On dit ce qui manque ; c'est le formulaire qui accompagne. « Recopiez
    // l'intervalle de votre carnet » était un ordre adressé à quelqu'un qui
    // ne sait pas encore où chercher.
    //
    // Et on dit TOUT ce qui manque : annoncer l'intervalle seul, puis réclamer
    // la dernière révision une fois l'intervalle saisi, faisait deux impasses
    // au lieu d'une demande (constat du 18 sept. 2026).
    const manques = manquesEntretien(vehicule);
    const aCompleter =
      manques.length > 1
        ? {
            explication: "Nexora ne sait pas encore quand la prochaine révision arrive : il lui manque la date de la dernière, et l'intervalle du carnet.",
            actions: [action("intervalle", "Compléter le suivi d'entretien")],
          }
        : e.etat === "intervalle_a_renseigner"
          ? { explication: "Nexora ne connaît pas encore l'intervalle de révision de cette voiture.", actions: [action("intervalle", "Renseigner l'intervalle")] }
          : { explication: "Enregistrez votre dernière révision, avec son kilométrage. Une vidange seule ne compte pas comme une révision.", actions: [action("revision", "Enregistrer une révision")] };
    return {
      ...base,
      ...aCompleter,
      cle: `revision:${vehicule.id}:a_completer:${e.etat}`,
      etat: "a_completer",
      // Combien il en manque : « Une information manque » se lisait au-dessus
      // d'une liste de deux.
      nbManques: Math.max(manques.length, 1),
      quand: "Pas encore calculé",
      delai: null,
      niveau: "neutre",
      fondement: "manquant",
      tri: Number.POSITIVE_INFINITY,
    };
  }

  // Intervalle en kilomètres seulement, et révision enregistrée sans compteur :
  // rien ne permet de situer l'échéance. On le dit, sans rien supposer.
  if (!e.parKm && !e.parDate) {
    return {
      ...base,
      cle: `revision:${vehicule.id}:a_completer:kilometrage_revision`,
      etat: "a_completer",
      quand: "Pas encore calculé",
      delai: null,
      niveau: "neutre",
      fondement: "manquant",
      explication: `Votre dernière révision (le ${formaterDate(e.depuis.date)}) a été enregistrée sans kilométrage : enregistrez la prochaine avec son compteur pour suivre l'échéance.`,
      actions: [action("revision", "Enregistrer une révision")],
      tri: Number.POSITIVE_INFINITY,
    };
  }

  const km = estimerKilometrage({ releves, historique, aujourdhui: jour });
  const intervalle = [e.intervalle.km ? formaterKm(e.intervalle.km) : null, e.intervalle.mois ? `${e.intervalle.mois} mois` : null].filter(Boolean).join(" ou ");
  const derniere = `dernière révision le ${formaterDate(e.depuis.date)}${e.depuis.kilometrage != null ? ` à ${formaterKm(e.depuis.kilometrage)}` : ""}`;

  let fondement = "intervalle";
  let kmTexte = null;
  let kmDetail = "";
  let niveauKm = null;
  let joursKm = Number.POSITIVE_INFINITY;
  let actualiser = false;

  if (e.parKm && km.aVerifier) {
    // Aucune échéance au compteur sur des kilométrages qui se contredisent :
    // l'urgence ne se fonde que sur la date, s'il y en a une.
    const [premiere] = km.incoherences;
    kmDetail = ` Deux kilométrages se contredisent (${formaterKm(premiere.avant.kilometrage)} le ${formaterDate(premiere.avant.date)}, puis ${formaterKm(premiere.apres.kilometrage)} le ${formaterDate(premiere.apres.date)}) : corrigez celui qui est faux pour suivre l'échéance au compteur.`;
  } else if (e.parKm) {
    if (e.parKm.restants == null) {
      kmTexte = `vers ${formaterKm(e.parKm.limite)}`;
      kmDetail = " Actualisez le kilométrage pour savoir ce qu'il reste.";
      actualiser = true;
    } else if (km.estimation && km.dernier.date >= e.depuis.date) {
      const restants = e.parKm.limite - km.estimation.kilometrage;
      fondement = "estimation";
      niveauKm = restants < 0 ? "depasse" : restants <= KM_ALERTE ? "proche" : "ok";
      kmTexte = restants < 0 ? `en retard d'environ ${formaterKm(-restants)}` : `dans environ ${formaterKm(restants)}`;
      kmDetail = ` Kilométrage estimé à ${formaterKm(km.estimation.kilometrage)} d'après votre rythme ; dernier compteur relevé : ${formaterKm(km.dernier.kilometrage)} le ${formaterDate(km.dernier.date)}.`;
      joursKm = km.parJour ? Math.floor(restants / km.parJour) : joursKm;
      actualiser = km.ancien;
    } else {
      const restants = e.parKm.restants;
      niveauKm = e.parKm.niveau;
      kmTexte = restants < 0 ? `en retard de ${formaterKm(-restants)}` : `dans environ ${formaterKm(restants)}`;
      kmDetail = ` Dernier kilométrage enregistré : ${formaterKm(km.dernier?.kilometrage ?? 0)} le ${formaterDate(km.dernier?.date)}.`;
      if (km.parJour) joursKm = Math.floor(restants / km.parJour);
      else if (niveauKm !== "ok") joursKm = restants < 0 ? -1 : 0;
      actualiser = Boolean(km.ancien);
    }
  }

  const dateTexte = e.parDate ? `avant le ${formaterDate(e.parDate.limite)}` : null;
  const quand = [kmTexte, dateTexte].filter(Boolean).join(" ou ");
  const niveau = plusUrgent(niveauKm, e.parDate?.niveau);
  const tri = Math.min(joursKm, e.parDate ? e.parDate.joursRestants : Number.POSITIVE_INFINITY);
  const actions = [
    km.aVerifier && e.parKm ? action("verifier_kilometrage", "Vérifier les kilométrages") : action("releve", "Mettre à jour le kilométrage"),
    action("revision", "Enregistrer une révision"),
  ];
  if (!e.parKm) actions.shift();

  // Seule l'échéance au compteur à vérifier : rien à dater, à compléter.
  if (e.parKm && km.aVerifier && !e.parDate) {
    return {
      ...base,
      cle: `revision:${vehicule.id}:a_completer:kilometrage_a_verifier`,
      etat: "a_completer",
      quand: "Kilométrage à vérifier",
      delai: null,
      niveau: "neutre",
      fondement: "intervalle",
      explication: `Tous les ${intervalle} ; ${derniere}.${kmDetail}`,
      actions,
      demandeActualisation: false,
      tri: Number.POSITIVE_INFINITY,
    };
  }

  return {
    ...base,
    cle: `revision:${vehicule.id}:${e.depuis.date}`,
    etat: "a_faire",
    date: e.parDate?.limite ?? null,
    joursRestants: Number.isFinite(tri) ? tri : null,
    quand: quand.charAt(0).toUpperCase() + quand.slice(1),
    delai: e.parDate && tri === e.parDate.joursRestants ? delaiLisible(e.parDate.joursRestants) : null,
    niveau,
    fondement,
    explication: `Tous les ${intervalle} ; ${derniere}.${kmDetail}`,
    actions,
    demandeActualisation: actualiser,
    tri,
  };
}

// ---------------------------------------------------------------------------
// Tâches personnelles
// ---------------------------------------------------------------------------

export function elementTache(tache, vehicule, { aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const jours = tache.echeance ? joursEntre(jour, tache.echeance) : null;
  const niveau = jours == null ? "neutre" : jours < 0 ? "depasse" : jours <= JOURS_ALERTE ? "proche" : "ok";
  return {
    genre: "tache",
    cle: `tache:${tache.id}`,
    tacheId: tache.id,
    serviceCode: tache.service_code ?? null,
    vehicule: identite(vehicule),
    etat: tache.statut === "terminee" ? "terminee" : "a_faire",
    titre: tache.titre,
    date: tache.echeance ?? null,
    joursRestants: jours,
    quand: tache.echeance ? `Pour le ${formaterDate(tache.echeance)}` : "Sans date",
    delai: jours == null ? null : delaiLisible(jours),
    niveau,
    fondement: "tache",
    explication: tache.note || "",
    actions: [action("terminer", "C'est fait"), action("reporter", "Reporter")],
    termineeLe: tache.terminee_le ?? null,
    tri: jours ?? Number.POSITIVE_INFINITY,
  };
}

// Une pastille courte pour un élément, avec le sujet quand l'écran ne le
// porte pas déjà (« CT dans 7 mois », « Révision : dans environ 600 km »).
export function pastilleElement(element, { avecSujet = true } = {}) {
  const sujet =
    element.genre === "controle_technique" ? (element.cle.startsWith("contre_visite") ? "Contre-visite" : "CT") : element.genre === "revision" ? "Révision" : element.titre;
  const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);
  if (element.etat === "a_completer") return { ton: "neutre", texte: avecSujet ? `${sujet} à compléter` : "À compléter" };
  if (element.delai) return { ton: element.niveau, texte: avecSujet ? `${sujet} ${element.delai}` : majuscule(element.delai) };
  if (!avecSujet) {
    // L'écran affiche déjà la phrase complète juste en dessous : la pastille
    // ne dit que l'urgence.
    return { ton: element.niveau, texte: { depasse: "En retard", proche: "Bientôt", ok: "À venir", neutre: "À actualiser" }[element.niveau] };
  }
  const court = element.quand.split(" ou ")[0];
  return { ton: element.niveau, texte: `${sujet} : ${court.charAt(0).toLowerCase()}${court.slice(1)}` };
}

// ---------------------------------------------------------------------------
// L'ensemble
// ---------------------------------------------------------------------------

// vehicules : avec `releves` et `historique` ; taches : lignes auto_taches ;
// reports : lignes auto_rappels_reports ({ cle, reporte_jusqu_au }).
export function construireAPrevoir({ vehicules = [], taches = [], reports = [], horizonJours = HORIZON_PAR_DEFAUT, aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const actives = vehicules.filter((v) => !v.archive_le);
  const parId = new Map(actives.map((v) => [v.id, v]));
  const reportes = new Map(reports.filter((r) => r.reporte_jusqu_au > jour).map((r) => [r.cle, r.reporte_jusqu_au]));

  const elements = [
    ...actives.flatMap((v) => [elementControle(v, { aujourdhui: jour }), elementRevision(v, { aujourdhui: jour })]),
    ...taches.filter((t) => t.statut !== "terminee" && parId.has(t.vehicule_id)).map((t) => elementTache(t, parId.get(t.vehicule_id), { aujourdhui: jour })),
  ].map((el) => (reportes.has(el.cle) && !el.critique ? { ...el, reporteJusquau: reportes.get(el.cle) } : el));

  const parUrgence = (a, b) => a.tri - b.tri || RANG[b.niveau] - RANG[a.niveau] || a.vehicule.nom.localeCompare(b.vehicule.nom);
  const groupes = { enRetard: [], bientot: [], plusTard: [], sansDate: [], aCompleter: [] };
  for (const el of elements) {
    if (el.etat === "a_completer") groupes.aCompleter.push(el);
    else if (el.niveau === "depasse") groupes.enRetard.push(el);
    else if (el.niveau === "proche" || el.tri <= horizonJours) groupes.bientot.push(el);
    else if (el.genre === "tache" && !el.date) groupes.sansDate.push(el);
    else groupes.plusTard.push(el);
  }
  for (const liste of Object.values(groupes)) liste.sort(parUrgence);

  const terminees = taches
    .filter((t) => t.statut === "terminee" && parId.has(t.vehicule_id))
    .map((t) => elementTache(t, parId.get(t.vehicule_id), { aujourdhui: jour }))
    .sort((a, b) => (a.termineeLe < b.termineeLe ? 1 : -1));

  // Le rappel dans l'app : trois actions au plus, jamais celles reportées ;
  // une échéance critique passe en premier.
  const prochaines = [...groupes.enRetard, ...groupes.bientot]
    .filter((el) => !el.reporteJusquau)
    .sort((a, b) => Number(Boolean(b.critique)) - Number(Boolean(a.critique)))
    .slice(0, 3);

  return { elements, groupes, terminees, prochaines };
}

// ---------------------------------------------------------------------------
// Envois externes (préparés, non branchés)
// ---------------------------------------------------------------------------

// Paliers d'un rappel envoyé hors de l'app : 30 jours, 7 jours, retard. Un
// palier ne part qu'une fois par échéance et par canal (`dejaEnvoyes` :
// lignes auto_rappels_envois) ; une échéance reportée, à compléter ou sans
// date n'envoie rien.
export function palierRappel(joursRestants) {
  if (!Number.isFinite(joursRestants)) return null;
  if (joursRestants < 0) return "retard";
  if (joursRestants <= 7) return "j7";
  if (joursRestants <= 30) return "j30";
  return null;
}

export function rappelsADeclencher(elements, { canal, dejaEnvoyes = [] } = {}) {
  const envoyes = new Set(dejaEnvoyes.filter((e) => e.canal === canal).map((e) => `${e.cle}|${e.palier}`));
  return elements
    .filter((el) => el.etat === "a_faire" && !el.reporteJusquau && Number.isFinite(el.joursRestants))
    .map((el) => ({ cle: el.cle, palier: palierRappel(el.joursRestants), canal }))
    .filter((r) => r.palier && !envoyes.has(`${r.cle}|${r.palier}`));
}
