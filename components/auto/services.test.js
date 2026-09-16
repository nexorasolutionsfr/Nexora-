import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INFORMATIONS,
  MODES,
  SERVICES,
  UNIVERS,
  actionExistante,
  compatibilite,
  informationsService,
  peutAjouterAuxActions,
  remarquesVehicule,
  serviceParCode,
  servicesDuMode,
  suiviDe,
} from "./services.js";
import { construireAPrevoir } from "./aPrevoir.js";

const AUJOURDHUI = "2026-09-16";
const F = "\u202F";

const clio = {
  id: "v-clio",
  marque: "Renault",
  modele: "Clio V",
  energie: "essence",
  motorisation: null,
  immatriculation: "GH456JK",
  date_mise_en_circulation: "2019-05-02",
  intervalle_entretien_km: 15000,
  intervalle_entretien_mois: 12,
  releves: [{ releve_le: "2026-09-12", kilometrage: 61400 }],
  historique: [
    { type: "revision", realise_le: "2025-10-01", kilometrage: 47000 },
    { type: "controle_technique", realise_le: "2025-04-30", controle_valable_jusqu_au: "2027-04-29" },
  ],
};
const zoe = { id: "v-zoe", marque: "Renault", modele: "Zoe", energie: "electrique", releves: [], historique: [] };
const inconnue = { id: "v-x", marque: "Peugeot", modele: "208", energie: null, releves: [], historique: [] };

test("Catalogue : une fiche par prestation, univers et modes connus, informations définies", () => {
  const codes = SERVICES.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  const univers = new Set(UNIVERS.map((u) => u.code));
  const modes = new Set(MODES.map((m) => m.code));
  for (const s of SERVICES) {
    assert.ok(univers.has(s.univers), `${s.code} : univers inconnu`);
    for (const m of Object.keys(s.modes)) assert.ok(modes.has(m), `${s.code} : mode inconnu ${m}`);
    for (const i of s.informations) assert.ok(INFORMATIONS[i], `${s.code} : information inconnue ${i}`);
    assert.ok(s.aQuoiSert && s.comprend.length && s.dependDuVehicule.length, `${s.code} : fiche incomplète`);
  }
  for (const u of UNIVERS) assert.ok(SERVICES.some((s) => s.univers === u.code), `univers vide ${u.code}`);
});

test("Catalogue : aucun prix, aucune promesse de disponibilité ni de date de lancement", () => {
  const texte = JSON.stringify(SERVICES);
  assert.doesNotMatch(texte, /€|\beuros?\b|prix|tarif/i);
  assert.doesNotMatch(texte, /bientôt disponible|prochainement|disponible dès|créneau/i);
});

test("Modes : un filtre sur les mêmes prestations, jamais une prestation de plus", () => {
  const aDomicile = servicesDuMode("a_domicile");
  assert.ok(aDomicile.some((s) => s.code === "revision"));
  assert.ok(!aDomicile.some((s) => s.code === "controle_technique"), "le CT se passe dans un centre agréé");
  assert.ok(!aDomicile.some((s) => s.code === "geometrie"));
  for (const m of MODES) {
    const liste = servicesDuMode(m.code);
    assert.equal(new Set(liste.map((s) => s.code)).size, liste.length);
    for (const s of liste) assert.equal(serviceParCode(s.code), s, "même objet que la fiche unique");
  }
  assert.equal(servicesDuMode(null).length, SERVICES.length);
  assert.ok(!servicesDuMode("collecte").some((s) => s.assistance), "l'assistance n'a aucun mode");
});

test("Compatibilité : dite quand elle est connue, « à vérifier » sinon, jamais présumée", () => {
  const vidange = serviceParCode("vidange");
  assert.equal(compatibilite(vidange, clio).etat, "concerne");
  assert.equal(compatibilite(vidange, zoe).etat, "non_concerne");
  assert.match(compatibilite(vidange, zoe).texte, /électrique n'a pas d'huile moteur/);
  assert.equal(compatibilite(vidange, inconnue).etat, "a_verifier");
  assert.equal(compatibilite(vidange, null).etat, "sans_voiture");
  assert.equal(compatibilite(serviceParCode("freinage"), inconnue).etat, "concerne");
});

test("Remarques liées à la voiture : énergie seulement, jamais l'âge ni le kilométrage", () => {
  assert.match(remarquesVehicule(serviceParCode("batterie"), zoe)[0], /batterie 12 V de servitude/);
  assert.match(remarquesVehicule(serviceParCode("revision"), zoe)[0], /pas de vidange moteur/);
  const vieille = { ...clio, annee: 2004, date_mise_en_circulation: "2004-03-01", releves: [{ releve_le: "2026-09-01", kilometrage: 310000 }] };
  for (const s of SERVICES) {
    for (const r of remarquesVehicule(s, vieille)) assert.doesNotMatch(r, /âge|ancienne|kilom|remplacer|recommand/i);
  }
  assert.deepEqual(remarquesVehicule(serviceParCode("freinage"), vieille), []);
});

test("Informations : reprises du dossier, à compléter avec le bon geste, ou à préciser plus tard", () => {
  const infos = informationsService(serviceParCode("revision"), clio);
  const connue = (cle) => infos.connues.find((i) => i.cle === cle)?.valeur;
  assert.equal(connue("marque_modele"), "Renault Clio V");
  assert.equal(connue("energie"), "Essence");
  assert.equal(connue("kilometrage"), `61${F}400${F}km le 12 sept. 2026`);
  assert.equal(connue("derniere_revision"), `1er oct. 2025 à 47${F}000${F}km`);
  assert.equal(connue("intervalle_revision"), `15${F}000${F}km ou 12 mois`);
  assert.deepEqual(infos.aCompleter, [{ cle: "motorisation", libelle: "Motorisation", action: "modifier" }]);

  const freins = informationsService(serviceParCode("freinage"), inconnue);
  assert.deepEqual(freins.aCompleter.map((i) => `${i.cle}:${i.action}`), ["motorisation:modifier", "annee:modifier", "kilometrage:releve"]);
  assert.deepEqual(freins.aPreciser.map((i) => i.cle), ["symptomes"]);

  const sansVoiture = informationsService(serviceParCode("freinage"), null);
  assert.equal(sansVoiture.connues.length, 0);
});

test("Prochaines actions : échéance déjà suivie, tâche déjà ouverte, ou ajout possible", () => {
  const { elements } = construireAPrevoir({ vehicules: [clio, zoe], aujourdhui: AUJOURDHUI });
  const revision = serviceParCode("revision");
  const existanteRev = actionExistante(revision, clio, { elements });
  assert.equal(existanteRev.type, "echeance");
  assert.equal(existanteRev.element.vehicule.id, "v-clio");
  assert.equal(peutAjouterAuxActions(revision, clio, existanteRev), false);
  assert.equal(actionExistante(serviceParCode("controle_technique"), zoe, { elements }).element.etat, "a_completer");

  const freinage = serviceParCode("freinage");
  const taches = [
    { id: "t1", vehicule_id: "v-clio", service_code: "freinage", statut: "a_faire" },
    { id: "t2", vehicule_id: "v-zoe", service_code: "freinage", statut: "terminee" },
  ];
  assert.equal(actionExistante(freinage, clio, { elements, taches }).tache.id, "t1");
  assert.equal(actionExistante(freinage, zoe, { elements, taches }), null, "une tâche terminée ne bloque pas");
  assert.equal(peutAjouterAuxActions(freinage, zoe, null), true);
  assert.equal(peutAjouterAuxActions(freinage, { ...zoe, archive_le: "2026-09-01" }, null), false);
  assert.equal(peutAjouterAuxActions(serviceParCode("vidange"), zoe, null), false, "ne concerne pas la voiture");
  assert.equal(peutAjouterAuxActions(serviceParCode("vidange"), inconnue, null), true, "à vérifier n'empêche pas");
  assert.equal(peutAjouterAuxActions(serviceParCode("assistance_panne"), clio, null), false);
  assert.equal(peutAjouterAuxActions(freinage, null, null), false);
});

test("La base et les fiches décrivent les mêmes prestations et les mêmes modes", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260922000600_auto_services.sql", import.meta.url), "utf8");
  const blocServices = sql.split("insert into public.auto_services (code, univers, nom, suivi, ordre) values")[1].split("on conflict")[0];
  const enBase = [...blocServices.matchAll(/\('([a-z_]+)', '([a-z_]+)', '((?:[^']|'')+)', '([a-z]+)', \d+\)/g)].map((m) => ({
    code: m[1],
    univers: m[2],
    nom: m[3].replaceAll("''", "'"),
    suivi: m[4],
  }));
  assert.deepEqual(
    enBase,
    SERVICES.map((s) => ({ code: s.code, univers: s.univers, nom: s.nom, suivi: suiviDe(s) })),
  );

  const blocModes = sql.split("insert into public.auto_services_modes (service_code, mode) values")[1].split("on conflict")[0];
  const modesEnBase = [...blocModes.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
  const modesFiches = SERVICES.flatMap((s) =>
    Object.entries(s.modes)
      .filter(([, v]) => v.envisageable)
      .map(([m]) => `${s.code}:${m}`),
  );
  assert.deepEqual(modesEnBase, modesFiches);
});
