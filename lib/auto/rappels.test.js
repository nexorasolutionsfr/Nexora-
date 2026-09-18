import assert from "node:assert/strict";
import test from "node:test";

import { elementControle } from "../../components/auto/aPrevoir.js";
import { ajouterJours } from "./echeances.js";
import {
  DELAI_PAR_DEFAUT,
  MOMENTS_RAPPEL,
  composerRappel,
  etatRappel,
  heureParis,
  jourParis,
  libelleMoment,
  jourRappel,
  lienEcheance,
  momentParDefaut,
  momentsPossibles,
  planifierRappel,
  prochainJourNeufHeures,
  planifierRappels,
  rappelPossible,
  texteActivation,
} from "./rappels.js";

const AUJOURDHUI = "2026-09-18";
const URL = "https://nexora-garage.vercel.app";
const ct = (extra) => ({ type: "controle_technique", realise_le: "2026-06-19", nature_controle: "periodique", resultat_controle: "favorable", ...extra });
const corsa = { id: "v-corsa", marque: "Opel", modele: "Corsa", immatriculation: "AB123CD", date_mise_en_circulation: "2014-05-20" };
const dossier = (historique, extra = {}) => ({
  abonnement_id: "a-1",
  delai_jours: 30,
  vehicule: corsa,
  historique,
  empreinte: "empreinte-lue",
  url_base: URL,
  ...extra,
});

test("jourParis : la date à Paris, pas celle de la machine", () => {
  // 22 h 30 UTC un soir d'octobre = 0 h 30 le lendemain à Paris (heure d'été).
  assert.equal(jourParis(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
  // Le 31 décembre à 23 h 30 UTC, Paris est déjà en janvier (heure d'hiver).
  assert.equal(jourParis(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  // 23 h 59 à Paris : encore le même jour.
  assert.equal(jourParis(new Date("2026-06-30T21:59:00Z")), "2026-06-30");
  // Nuit du changement d'heure (25 octobre 2026, 3 h → 2 h).
  assert.equal(jourParis(new Date("2026-10-25T00:30:00Z")), "2026-10-25");
});

test("date DÉCLARÉE : procès-verbal renseigné par la personne", () => {
  const plan = planifierRappel(dossier([ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })]), { aujourdhui: AUJOURDHUI });
  assert.equal(plan.echeance, "2028-06-18");
  assert.equal(plan.jour, "2028-05-19");
  assert.equal(plan.palier, "j30");
  assert.equal(plan.fondement, "officiel");
  assert.equal(plan.provenance, "proprietaire");
  assert.equal(plan.empreinte, "empreinte-lue", "l'empreinte est celle de la lecture, pas recalculée");
  assert.equal(plan.objet, "Contrôle technique de votre Opel Corsa : avant le 18 juin 2028");
  assert.match(plan.texte, /Le contrôle technique de votre Opel Corsa \(AB-123-CD\) est à faire avant le 18 juin 2028\./);
  assert.match(plan.texte, /D'où vient cette date : date du procès-verbal, renseignée par vous\./);
});

test("date EXTRAITE : lue sur un document, et dite comme telle", () => {
  const plan = planifierRappel(dossier([ct({ controle_valable_jusqu_au: "2028-06-18", source: "prestation" })]), { aujourdhui: AUJOURDHUI });
  assert.equal(plan.provenance, "prestation");
  assert.match(plan.texte, /date du procès-verbal, lue sur votre document\./);
  assert.doesNotMatch(plan.texte, /renseignée par vous/);
});

test("date CALCULÉE : la règle est dite, et le procès-verbal reste la référence", () => {
  const plan = planifierRappel(dossier([ct({ source: "proprietaire" })]), { aujourdhui: AUJOURDHUI });
  assert.equal(plan.fondement, "calcul");
  assert.equal(plan.echeance, "2028-06-18");
  assert.match(plan.texte, /D'où vient cette date : calcul selon la règle\. Validité de 2 ans du contrôle du 19 juin 2026/);
  assert.match(plan.texte, /La date du procès-verbal fait foi\./);
  // Jamais présentée comme lue sur un procès-verbal.
  assert.doesNotMatch(plan.texte, /date du procès-verbal, renseignée/);
});

test("premier contrôle, calculé depuis la mise en circulation : la fenêtre est dite", () => {
  const recente = { ...corsa, date_mise_en_circulation: "2024-05-20" };
  const plan = planifierRappel(dossier([], { vehicule: recente }), { aujourdhui: AUJOURDHUI });
  assert.equal(plan.echeance, "2028-05-19");
  assert.equal(plan.objet, "Contrôle technique de votre Opel Corsa : entre le 20 nov. 2027 et le 19 mai 2028");
  assert.match(plan.texte, /Premier contrôle d'une voiture particulière/);
});

test("la clé du rappel est celle de l'échéance affichée : même objet, pas deux vérités", () => {
  const historique = [ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })];
  const plan = planifierRappel(dossier(historique), { aujourdhui: AUJOURDHUI });
  assert.equal(plan.cle, elementControle({ ...corsa, historique }, { aujourdhui: AUJOURDHUI }).cle);
});

test("pas de rappel quand il n'a pas de sens — et la raison est dite", () => {
  const sansDate = planifierRappel(dossier([], { vehicule: { ...corsa, date_mise_en_circulation: null } }), { aujourdhui: AUJOURDHUI });
  assert.deepEqual(sansDate, { abonnement_id: "a-1", aucun: true, raison: "date du prochain contrôle inconnue" });

  const contreVisite = planifierRappel(dossier([ct({ realise_le: "2026-09-01", resultat_controle: "defavorable_majeure" })]), { aujourdhui: AUJOURDHUI });
  assert.equal(contreVisite.aucun, true);
  assert.match(contreVisite.raison, /contre-visite/);

  const depasse = planifierRappel(dossier([ct({ realise_le: "2024-09-01", controle_valable_jusqu_au: "2026-09-10", source: "proprietaire" })]), { aujourdhui: AUJOURDHUI });
  assert.equal(depasse.aucun, true);
  assert.equal(depasse.raison, "contrôle technique plus valable");
});

test("le message : court, la voiture, la date, le lien, comment arrêter — rien d'autre", () => {
  const vehicule = { ...corsa, historique: [ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire", montant_ttc: 78 })] };
  const element = elementControle(vehicule, { aujourdhui: AUJOURDHUI });
  const { objet, texte } = composerRappel({ vehicule, element, urlBase: URL + "/" });
  assert.ok(objet.length <= 80, `objet trop long : ${objet.length}`);
  assert.ok(texte.length <= 900, `message trop long : ${texte.length}`);
  assert.match(texte, /https:\/\/nexora-garage\.vercel\.app\/auto\/vehicules\/v-corsa\?action=echeance_ct/);
  assert.match(texte, /Pour le modifier ou l'arrêter/);
  // Aucune pièce jointe possible (texte brut), aucun montant, aucun document.
  assert.doesNotMatch(texte, /€|facture|\.pdf|document joint|pièce jointe/i);
  assert.doesNotMatch(texte, /https?:\/\/[^\s]*\/\//, "pas de double barre dans le lien");
});

test("sans plaque, la voiture reste nommée", () => {
  const vehicule = { ...corsa, immatriculation: null, historique: [ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })] };
  const { texte } = composerRappel({ vehicule, element: elementControle(vehicule, { aujourdhui: AUJOURDHUI }), urlBase: URL });
  assert.match(texte, /votre Opel Corsa est à faire/);
});

test("lienEcheance : une seule barre, quelle que soit la racine", () => {
  assert.equal(lienEcheance("https://exemple.test/", "v1"), "https://exemple.test/auto/vehicules/v1?action=echeance_ct");
  assert.equal(lienEcheance("https://exemple.test", "v1"), "https://exemple.test/auto/vehicules/v1?action=echeance_ct");
});

test("moments proposés : seulement ceux qui tombent APRÈS aujourd'hui", () => {
  const dans = (jours) => jourRappel("2026-09-18", -jours);
  assert.deepEqual(momentsPossibles(dans(100), { aujourdhui: AUJOURDHUI }).map((m) => m.jours), [60, 30, 15]);
  assert.deepEqual(momentsPossibles(dans(40), { aujourdhui: AUJOURDHUI }).map((m) => m.jours), [30, 15]);
  assert.deepEqual(momentsPossibles(dans(20), { aujourdhui: AUJOURDHUI }).map((m) => m.jours), [15]);
  assert.deepEqual(momentsPossibles(dans(15), { aujourdhui: AUJOURDHUI }), [], "le jour même : trop tard pour un rappel");
  assert.equal(momentParDefaut(momentsPossibles(dans(100), { aujourdhui: AUJOURDHUI })).jours, DELAI_PAR_DEFAUT);
  assert.equal(momentParDefaut(momentsPossibles(dans(20), { aujourdhui: AUJOURDHUI })).jours, 15);
  assert.equal(momentParDefaut([]), null);
  // Échéance le 28 octobre, 30 jours avant : le 28 septembre.
  assert.equal(momentsPossibles(dans(40), { aujourdhui: AUJOURDHUI })[0].jour, "2026-09-28");
});

test("rappelPossible : les raisons", () => {
  assert.deepEqual(rappelPossible(null), { possible: false, raison: "aucune échéance" });
  assert.equal(rappelPossible({ etat: "a_faire", cle: "controle_technique:v:2028-01-01", date: "2028-01-01" }).possible, true);
});

test("planifierRappels : la date de Paris de l'instant donné, dossiers invalides écartés", () => {
  const plans = planifierRappels(
    [dossier([ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })]), null, { vehicule: corsa }],
    { maintenant: new Date("2026-09-18T07:00:00Z") },
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].jour, "2028-05-19");
});

test("libelleMoment : l'instant en base, lu à l'heure de Paris", () => {
  // 7 h UTC en mai = 9 h à Paris ; 8 h UTC en décembre = 9 h à Paris.
  assert.equal(libelleMoment({ instant: "2028-05-19T07:00:00Z" }), "le 19 mai 2028 à 9 h");
  assert.equal(libelleMoment({ instant: "2028-12-01T08:00:00Z" }), "le 1er déc. 2028 à 9 h");
  assert.equal(libelleMoment({ jour: "2028-05-19" }), "le 19 mai 2028 à 9 h");
  assert.equal(heureParis("2028-10-29T08:00:00Z"), 9, "jour du retour à l'heure d'hiver");
  assert.equal(libelleMoment({}), "");
});

test("etatRappel : ce que dit le panneau, dans chaque situation", () => {
  const vehicule = { ...corsa, historique: [ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })] };
  const element = elementControle(vehicule, { aujourdhui: AUJOURDHUI });
  const actif = { actif: true, delai_jours: 30, adresse_consentie: "alice@exemple.test" };
  const lu = (extra) => ({ adresse_compte: "alice@exemple.test", abonnement: actif, prochain: null, dernier_envoye: null, ...extra });

  assert.equal(etatRappel({ lu: { adresse_compte: "a@b.test", abonnement: null }, element, aujourdhui: AUJOURDHUI }).cas, "proposable");
  assert.equal(etatRappel({ lu: { abonnement: { ...actif, actif: false } }, element, aujourdhui: AUJOURDHUI }).cas, "proposable");

  // Activé, pas encore programmé : le calcul du programmateur.
  assert.deepEqual(etatRappel({ lu: lu(), element, aujourdhui: AUJOURDHUI }), {
    cas: "programme", moment: "le 19 mai 2028 à 9 h", adresse: "alice@exemple.test", adresseCompte: "alice@exemple.test", delaiJours: 30,
  });
  // Programmé en base pour CETTE échéance : l'instant enregistré fait foi.
  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "prevu", prevu_le: "2028-05-19T07:00:00Z", echeance: "2028-06-18" } }), element, aujourdhui: AUJOURDHUI }).moment, "le 19 mai 2028 à 9 h");
  // Programmé pour une ANCIENNE échéance (date corrigée, programmateur pas encore passé) : on montre le nouveau calcul.
  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "prevu", prevu_le: "2027-01-01T08:00:00Z", echeance: "2027-01-31" } }), element, aujourdhui: AUJOURDHUI }).moment, "le 19 mai 2028 à 9 h");

  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "envoi_en_cours" } }), element, aujourdhui: AUJOURDHUI }).cas, "en_cours");
  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "bloque", motif: "adresse du compte changée depuis l'activation" } }), element, aujourdhui: AUJOURDHUI }).cas, "adresse_a_confirmer");
  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "bloque", motif: "trois tentatives sans succès" } }), element, aujourdhui: AUJOURDHUI }).cas, "echec");
  // Une adresse INUTILISABLE n'est pas une adresse changée : pas de « confirmer ».
  assert.equal(etatRappel({ lu: lu({ prochain: { statut: "bloque", motif: "adresse du compte absente ou invalide, rien n'est parti" } }), element, aujourdhui: AUJOURDHUI }).cas, "echec");
  const envoye = etatRappel({ lu: lu({ dernier_envoye: { envoye_le: "2028-05-19T07:00:04Z", echeance: "2028-06-18" } }), element, aujourdhui: AUJOURDHUI });
  assert.equal(envoye.cas, "envoye");
  assert.equal(envoye.moment, "le 19 mai 2028 à 9 h");

  // Activé, mais plus rien à rappeler : on le dit, on ne promet rien.
  const depasse = elementControle({ ...corsa, historique: [ct({ realise_le: "2024-09-01", controle_valable_jusqu_au: "2026-09-10" })] }, { aujourdhui: AUJOURDHUI });
  assert.deepEqual(etatRappel({ lu: lu(), element: depasse, aujourdhui: AUJOURDHUI }).cas, "sans_envoi");
  assert.equal(etatRappel({ lu: { abonnement: null }, element: depasse, aujourdhui: AUJOURDHUI }).cas, "masque");
});

test("le rattrapage suit la base : prochain 9 h, et jamais le jour de l'échéance", () => {
  // 8 h à Paris (6 h UTC l'été) : le prochain 9 h est aujourd'hui ; 10 h : demain.
  assert.equal(prochainJourNeufHeures(new Date("2026-09-18T06:00:00Z")), "2026-09-18");
  assert.equal(prochainJourNeufHeures(new Date("2026-09-18T08:00:00Z")), "2026-09-19");
  // 8 h 30 à Paris l'hiver (7 h 30 UTC).
  assert.equal(prochainJourNeufHeures(new Date("2026-12-01T07:30:00Z")), "2026-12-01");

  const lu = { adresse_compte: "a@b.test", abonnement: { actif: true, delai_jours: 30, adresse_consentie: "a@b.test" }, prochain: null, dernier_envoye: null };
  const demain = elementControle({ ...corsa, historique: [ct({ realise_le: "2024-09-20", controle_valable_jusqu_au: "2026-09-19", source: "proprietaire" })] }, { aujourdhui: AUJOURDHUI });
  // Avant 9 h, la veille de l'échéance : un rappel part encore ce matin.
  assert.deepEqual(
    etatRappel({ lu, element: demain, maintenant: new Date("2026-09-18T06:00:00Z") }).moment,
    "le 18 sept. 2026 à 9 h",
  );
  // Après 9 h, la veille : le prochain 9 h est le jour de l'échéance — rien n'est promis.
  const tard = etatRappel({ lu, element: demain, maintenant: new Date("2026-09-18T08:00:00Z") });
  assert.equal(tard.cas, "sans_envoi");
  assert.equal(tard.raison, "échéance trop proche pour un rappel utile");
  // Le jour même de l'échéance.
  const jourMeme = elementControle({ ...corsa, historique: [ct({ realise_le: "2024-09-19", controle_valable_jusqu_au: "2026-09-18", source: "proprietaire" })] }, { aujourdhui: AUJOURDHUI });
  assert.equal(etatRappel({ lu, element: jourMeme, maintenant: new Date("2026-09-18T05:00:00Z") }).cas, "sans_envoi");
});

test("les libellés disent le calcul, au jour près : « N jours avant » = échéance moins N jours", () => {
  for (const m of MOMENTS_RAPPEL) {
    assert.equal(m.libelle, `${m.jours} jours avant`);
    assert.equal(jourRappel("2026-10-05", m.jours), ajouterJours("2026-10-05", -m.jours));
  }
  // L'essai : échéance dans 16 jours → seul « 15 jours avant » reste, demain.
  const possibles = momentsPossibles("2026-10-05", { aujourdhui: "2026-09-19" });
  assert.deepEqual(possibles.map((m) => [m.libelle, m.jour]), [["15 jours avant", "2026-09-20"]]);
});

test("à l'activation, la personne lit la date calculée, le calcul et l'adresse", () => {
  assert.equal(
    texteActivation({ echeance: "2026-10-05", delaiJours: 15, adresse: "quelquun@exemple.fr" }),
    "Rappel activé : un e-mail le 20 sept. 2026 à 9 h, 15 jours avant l'échéance du 5 oct. 2026. Destinataire : quelquun@exemple.fr.",
  );
  assert.match(texteActivation({ echeance: "2027-03-01", delaiJours: 30, adresse: "a@b.fr" }), /le 30 janv\. 2027 à 9 h, 30 jours avant l'échéance du 1er mars 2027/);
});
