import assert from "node:assert/strict";
import test from "node:test";

import { ErreurLecture } from "./anthropic.js";
import { lireFacture } from "./service.js";

const AUJOURDHUI = "2026-09-16";
const CONFIG = { disponible: true, fournisseur: "anthropic", modele: "claude-haiku-4-5-20251001", budgetMicroUsd: 5000000 };
const PDF = new TextEncoder().encode("%PDF-1.4\n<< /Type /Pages /Count 1 >> << /Type /Page >>\n%%EOF");

function faux({ document, refus = null, fournisseur }) {
  const traces = { reservations: [], journal: [], propositions: [], lectures: 0, comptages: 0 };
  const clientPersonne = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: document, error: null }) }) }),
      update: (valeurs) => ({ eq: async () => (traces.propositions.push(valeurs.lecture), { error: null }) }),
    }),
    storage: { from: () => ({ download: async () => ({ data: new Blob([PDF]), error: null }) }) },
  };
  const clientServeur = {
    rpc: async (_nom, params) => (traces.reservations.push(params), { data: [{ lecture_id: "lecture-1", refus }], error: null }),
    from: () => ({ update: (valeurs) => ({ eq: async () => (traces.journal.push(valeurs), { error: null }) }) }),
  };
  const creerFournisseur = () => ({
    nom: "anthropic",
    modele: CONFIG.modele,
    compterJetons: async () => (traces.comptages++, fournisseur.compter ? fournisseur.compter() : { jetonsEntree: 4000 }),
    lire: async () => (traces.lectures++, fournisseur.lire()),
  });
  return { traces, deps: { clientPersonne, clientServeur, creerFournisseur, aujourdhui: AUJOURDHUI, utilisateurId: "u1", journal: { error() {} } } };
}

const document = { id: "d1", vehicule_id: "v1", chemin: "u1/v1/d1.pdf", type_mime: "application/pdf", taille_octets: PDF.byteLength, historique_id: null, lecture: null };

test("Service : lecture réussie, coût estimé journalisé, proposition conservée", async () => {
  const { traces, deps } = faux({
    document,
    fournisseur: { lire: async () => ({ brut: { est_facture_vehicule: true, montant_ttc: { valeur: 189.9, certitude: "lue" }, operations: [] }, usage: { input_tokens: 6000, output_tokens: 600 }, dureeMs: 4200 }) },
  });
  const r = await lireFacture({ documentId: "d1", configuration: CONFIG, ...deps });
  assert.equal(r.etat, "proposee");
  assert.equal(r.proposition.champs.montantTtc.valeur, 189.9);
  assert.equal(traces.reservations[0].p_cout_reserve_micro_usd, 32500);
  assert.equal(traces.reservations[0].p_tentatives_max, 2);
  assert.equal(traces.journal[0].statut, "reussie");
  assert.equal(traces.journal[0].cout_estime_micro_usd, 9000);
  assert.equal(traces.journal[0].facturation, "facturee");
  assert.equal(traces.propositions.length, 1);
});

test("Service : proposition déjà obtenue rendue sans nouvel appel ; facture déjà enregistrée", async () => {
  const deja = { ...document, lecture: { champs: {}, operations: [] } };
  const { traces, deps } = faux({ document: deja, fournisseur: { lire: async () => assert.fail("aucun appel attendu") } });
  const r = await lireFacture({ documentId: "d1", configuration: CONFIG, ...deps });
  assert.equal(r.etat, "proposee");
  assert.equal(r.reprise, true);
  assert.equal(traces.reservations.length + traces.lectures + traces.comptages, 0);

  const { deps: d2 } = faux({ document: { ...document, historique_id: "h1" }, fournisseur: {} });
  assert.equal((await lireFacture({ documentId: "d1", configuration: CONFIG, ...d2 })).etat, "deja_enregistree");
});

test("Service : indisponible sans configuration, illisible, limites atteintes : aucun appel payant", async () => {
  const jamais = { lire: async () => assert.fail("aucun appel attendu") };
  let f = faux({ document, fournisseur: jamais });
  assert.deepEqual(await lireFacture({ documentId: "d1", configuration: { disponible: false, raison: "cle_absente" }, ...f.deps }), { etat: "indisponible", raison: "cle_absente" });

  f = faux({ document: { ...document, type_mime: "image/heic", taille_octets: 900 }, fournisseur: jamais });
  assert.deepEqual(await lireFacture({ documentId: "d1", configuration: CONFIG, ...f.deps }), { etat: "illisible", raison: "format" });

  f = faux({ document, refus: "budget", fournisseur: jamais });
  assert.deepEqual(await lireFacture({ documentId: "d1", configuration: CONFIG, ...f.deps }), { etat: "limite", raison: "budget" });
  assert.equal(f.traces.lectures, 0);

  f = faux({ document, fournisseur: { compter: () => ({ jetonsEntree: 40000 }), lire: jamais.lire } });
  const long = await lireFacture({ documentId: "d1", configuration: CONFIG, ...f.deps });
  assert.equal(long.etat, "illisible");
  assert.equal(f.traces.journal[0].erreur, "document_trop_long");
  assert.equal(f.traces.journal[0].cout_estime_micro_usd, 0);
});

test("Service : un échec est journalisé avec sa facturation, jamais caché", async () => {
  let f = faux({ document, fournisseur: { lire: async () => { throw new ErreurLecture("delai_depasse", { facturation: "inconnue" }); } } });
  let r = await lireFacture({ documentId: "d1", configuration: CONFIG, ...f.deps });
  assert.deepEqual([r.etat, r.raison], ["echec", "delai_depasse"]);
  assert.deepEqual([f.traces.journal[0].statut, f.traces.journal[0].facturation, f.traces.journal[0].cout_estime_micro_usd], ["echec", "inconnue", null]);

  f = faux({ document, fournisseur: { lire: async () => { throw new ErreurLecture("reponse_tronquee", { facturation: "facturee", usage: { input_tokens: 8000, output_tokens: 1500 } }); } } });
  r = await lireFacture({ documentId: "d1", configuration: CONFIG, ...f.deps });
  assert.equal(f.traces.journal[0].cout_estime_micro_usd, 15500);
  assert.equal(f.traces.propositions.length, 0);
});
