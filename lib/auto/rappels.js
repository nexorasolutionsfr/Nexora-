// Rappel du contrôle technique : ce qui se décide avant tout envoi.
//
// Un seul endroit décide QUAND et QUOI rappeler, pour l'écran comme pour
// l'envoi : l'échéance vient de elementControle() (components/auto/aPrevoir.js),
// la même qui s'affiche dans la fiche. Le workflow n8n embarque ce module tel
// quel (n8n/rappels-auto/embarquer.mjs) : aucune règle n'est recopiée.
//
// Ce que la base fait, et pas ce module (20260922001200) : convertir « 9 h à
// Paris » en instant, garantir l'unicité, refuser d'envoyer sur un dossier
// qui a changé depuis la programmation.
//
// Pur et testé (rappels.test.js). Aucun envoi ici.

import { ajouterJours } from "./echeances.js";
import { afficherImmatriculation } from "./immatriculation.js";
import { elementControle, libelleFondement } from "../../components/auto/aPrevoir.js";
import { formaterDate } from "../../components/auto/format.js";

// Les moments proposés. Trois, pas plus : assez pour prendre rendez-vous,
// pas assez pour devoir réfléchir. Le libellé dit le calcul, au jour près
// (échéance moins N jours) : « deux semaines » aurait promis 14 jours pour 15
// calculés — écart relevé le 18 sept. 2026. La date exacte s'affiche à côté.
export const MOMENTS_RAPPEL = [
  { jours: 60, libelle: "60 jours avant" },
  { jours: 30, libelle: "30 jours avant" },
  { jours: 15, libelle: "15 jours avant" },
];
export const DELAI_PAR_DEFAUT = 30;
export const HEURE_RAPPEL = "9 h";

// La date du jour À PARIS, quel que soit le fuseau de la machine : un
// navigateur à l'étranger, un serveur n8n réglé sur UTC.
export function jourParis(maintenant = new Date()) {
  const parties = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(maintenant);
  const valeur = (type) => parties.find((p) => p.type === type)?.value;
  return `${valeur("year")}-${valeur("month")}-${valeur("day")}`;
}

// L'heure qu'il est à Paris pour un instant donné (0 à 23). En français,
// l'heure seule se formate « 09 h » : on lit la partie « heure », pas le texte.
export function heureParis(instant) {
  const parties = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(instant));
  return Number(parties.find((p) => p.type === "hour")?.value);
}

// « le 19 mai 2028 à 9 h » : depuis un jour (le rappel n'est pas encore
// programmé) ou depuis l'instant enregistré en base, lu à l'heure de Paris.
export function libelleMoment({ jour = null, instant = null } = {}) {
  if (instant) return `le ${formaterDate(jourParis(new Date(instant)))} à ${heureParis(instant)} h`;
  if (jour) return `le ${formaterDate(jour)} à ${HEURE_RAPPEL}`;
  return "";
}

// Le prochain « 9 h à Paris » après `maintenant` : aujourd'hui s'il n'est pas
// encore 9 h, sinon demain. Même règle que auto_rappel_neuf_heures() en base,
// qui programme ainsi un rappel dont le jour idéal est déjà passé.
export function prochainJourNeufHeures(maintenant = new Date()) {
  const jour = jourParis(maintenant);
  return heureParis(maintenant) < 9 ? jour : ajouterJours(jour, 1);
}

// Un rappel a-t-il un sens pour cette échéance ? Rend { possible, raison }.
// Première version : le contrôle technique périodique ou le premier contrôle,
// dès qu'une date est calculable — déclarée, lue sur un document ou calculée
// selon la règle ; la phrase du message dit laquelle.
export function rappelPossible(element) {
  if (!element) return { possible: false, raison: "aucune échéance" };
  if (element.etat === "a_completer" || !element.date) return { possible: false, raison: "date du prochain contrôle inconnue" };
  if (String(element.cle).startsWith("contre_visite:")) return { possible: false, raison: "contre-visite à faire : pas de rappel dans cette première version" };
  if (element.critique) return { possible: false, raison: "contrôle technique plus valable" };
  return { possible: true, raison: null };
}

// Le jour du rappel, pour un délai donné.
export function jourRappel(echeance, delaiJours) {
  return ajouterJours(echeance, -delaiJours);
}

// Les moments encore possibles : ceux dont le jour est APRÈS aujourd'hui.
// Proposer « 30 jours avant » quand l'échéance est dans vingt jours ferait
// partir un message aussitôt activé, qui ne rappellerait rien.
export function momentsPossibles(echeance, { aujourdhui } = {}) {
  const jour = aujourdhui ?? jourParis();
  return MOMENTS_RAPPEL.map((m) => ({ ...m, jour: jourRappel(echeance, m.jours) })).filter((m) => m.jour > jour);
}

// Ce que la personne lit en activant : la date calculée, le calcul, l'adresse.
// « Rappel activé : un e-mail le 20 sept. 2026 à 9 h, 15 jours avant
// l'échéance du 5 oct. 2026. Destinataire : … »
export function texteActivation({ echeance, delaiJours, adresse }) {
  const jour = jourRappel(echeance, delaiJours);
  return `Rappel activé : un e-mail ${libelleMoment({ jour })}, ${delaiJours} jours avant l'échéance du ${formaterDate(echeance)}. Destinataire : ${adresse}.`;
}

export function momentParDefaut(possibles) {
  return possibles.find((m) => m.jours === DELAI_PAR_DEFAUT) ?? possibles[possibles.length - 1] ?? null;
}

// D'où vient la date, dit comme l'écran le dit. Une date calculée porte sa
// règle : elle n'a pas la valeur d'un procès-verbal, et le message le dit.
export function origineDate(element) {
  const base = libelleFondement(element);
  const phrase = `${base.charAt(0).toUpperCase()}${base.slice(1)}.`;
  return element.fondement === "calcul" && element.explication ? `${phrase} ${element.explication}` : phrase;
}

const minusculeInitiale = (texte) => (texte ? texte.charAt(0).toLowerCase() + texte.slice(1) : texte);

export function lienEcheance(urlBase, vehiculeId) {
  const racine = String(urlBase || "").replace(/\/+$/, "");
  return `${racine}/auto/vehicules/${vehiculeId}?action=echeance_ct`;
}

// Le message. Court, en texte brut : il nomme la voiture, dit la date et son
// origine, ramène à l'échéance, et dit comment arrêter. Aucun document, aucun
// montant, aucune autre donnée du dossier.
export function composerRappel({ vehicule, element, urlBase }) {
  const nom = `${vehicule.marque} ${vehicule.modele}`.trim();
  const plaque = afficherImmatriculation(vehicule.immatriculation);
  const quand = minusculeInitiale(element.quand);
  const objet = `Contrôle technique de votre ${nom} : ${quand}`;
  const texte = [
    "Bonjour,",
    "",
    `Le contrôle technique de votre ${nom}${plaque ? ` (${plaque})` : ""} est à faire ${quand}.`,
    "",
    `D'où vient cette date : ${minusculeInitiale(origineDate(element))}`,
    "",
    "Voir l'échéance dans Nexora Auto :",
    lienEcheance(urlBase, vehicule.id),
    "",
    "Une fois le contrôle fait, enregistrez-le au même endroit : Nexora calculera le suivant.",
    "",
    "Vous recevez ce message parce que vous avez demandé ce rappel pour cette voiture. Pour le modifier ou l'arrêter : même lien, rubrique « Rappel par e-mail ».",
    "",
    "Nexora Auto",
  ].join("\n");
  return { objet, texte };
}

// Ce que le panneau « Rappel par e-mail » doit dire, d'après ce que rend
// auto_etat_rappel et l'échéance affichée. Rend { cas, … } :
//   masque              : ni rappel possible, ni rappel actif — rien à montrer ;
//   proposable          : rappel possible, pas activé ;
//   programme           : activé ; `moment` dit quand (l'instant en base s'il
//                         vaut pour CETTE échéance, sinon le calcul du
//                         programmateur, qui passera dans le quart d'heure) ;
//   en_cours            : remis au fournisseur, issue pas encore connue ;
//   envoye              : parti pour cette échéance ;
//   adresse_a_confirmer : l'adresse du compte a changé depuis l'activation ;
//   echec               : n'a pas pu partir (refus, trois tentatives) ;
//   sans_envoi          : activé, mais aucune échéance à rappeler (`raison`).
export function etatRappel({ lu, element, aujourdhui, maintenant = new Date() } = {}) {
  const jour = aujourdhui ?? jourParis(maintenant);
  const possible = rappelPossible(element);
  const abonnement = lu?.abonnement;
  if (!abonnement || !abonnement.actif) return { cas: possible.possible ? "proposable" : "masque" };

  const base = { adresse: abonnement.adresse_consentie, adresseCompte: lu.adresse_compte ?? null, delaiJours: abonnement.delai_jours };
  const prochain = lu.prochain;
  // Seule l'adresse CHANGÉE depuis l'activation se règle par une confirmation ;
  // une adresse inutilisable est un échec (motif exact depuis 20260922001400).
  if (prochain?.statut === "bloque") return { ...base, cas: /^adresse du compte changée/.test(prochain.motif ?? "") ? "adresse_a_confirmer" : "echec" };
  if (prochain?.statut === "envoi_en_cours") return { ...base, cas: "en_cours" };
  if (!possible.possible) return { ...base, cas: "sans_envoi", raison: possible.raison };
  if (prochain?.statut === "prevu" && prochain.echeance === element.date) return { ...base, cas: "programme", moment: libelleMoment({ instant: prochain.prevu_le }) };

  const envoye = lu.dernier_envoye;
  if (envoye && envoye.echeance === element.date) return { ...base, cas: "envoye", moment: libelleMoment({ instant: envoye.envoye_le }) };

  const jourPrevu = jourRappel(element.date, abonnement.delai_jours);
  if (jourPrevu > jour) return { ...base, cas: "programme", moment: libelleMoment({ jour: jourPrevu }) };

  // Le jour idéal est passé (date corrigée, programmateur arrêté) : la base
  // rattrape au prochain 9 h — sauf si ce 9 h tombe le jour de l'échéance ou
  // après, où elle ne programme plus rien. L'écran ne doit pas le promettre
  // (constat du 18 sept. 2026 : il annonçait « le prochain matin à 9 h »).
  const rattrapage = prochainJourNeufHeures(maintenant);
  if (rattrapage >= element.date) return { ...base, cas: "sans_envoi", raison: "échéance trop proche pour un rappel utile" };
  return { ...base, cas: "programme", moment: libelleMoment({ jour: rattrapage }) };
}

// Un dossier lu par auto_rappels_a_planifier → le rappel qui doit exister,
// ou { aucun: true } pour annuler ce qui était programmé.
export function planifierRappel(dossier, { aujourdhui } = {}) {
  const jour = aujourdhui ?? jourParis();
  const vehicule = { ...dossier.vehicule, historique: dossier.historique ?? [] };
  const element = elementControle(vehicule, { aujourdhui: jour });
  const { possible, raison } = rappelPossible(element);
  if (!possible) return { abonnement_id: dossier.abonnement_id, aucun: true, raison };

  const { objet, texte } = composerRappel({ vehicule, element, urlBase: dossier.url_base });
  return {
    abonnement_id: dossier.abonnement_id,
    cle: element.cle,
    echeance: element.date,
    jour: jourRappel(element.date, dossier.delai_jours),
    palier: `j${dossier.delai_jours}`,
    fondement: element.fondement,
    provenance: element.provenance ?? null,
    objet,
    texte,
    empreinte: dossier.empreinte,
  };
}

export function planifierRappels(dossiers = [], { maintenant = new Date() } = {}) {
  const aujourdhui = jourParis(maintenant);
  return dossiers.filter((d) => d && d.abonnement_id).map((d) => planifierRappel(d, { aujourdhui }));
}
