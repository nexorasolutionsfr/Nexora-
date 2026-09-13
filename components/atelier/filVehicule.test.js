// Le fil d'une voiture — tests de l'enchaînement et des contradictions.
//
// Exécution : node --test components/atelier/filVehicule.test.js
//
// Deux règles sont verrouillées ici :
//  — une action déjà faite n'est jamais proposée comme prochaine action ;
//  — deux statuts qui se contredisent se signalent au lieu de se taire.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGIT_CLIENT,
  AGIT_GARAGE,
  AGIT_PERSONNE,
  actionOrdreReparation,
  filVehicule,
  libelleQuiAgit,
} from "./filVehicule.js";

test("un rendez-vous seul mène au devis", () => {
  const f = filVehicule({ rdv: { statut_atelier: "a_venir" } });
  assert.equal(f.etat, "Rendez-vous prévu");
  assert.match(f.prochaineAction, /devis/);
  assert.equal(f.quiAgit, AGIT_GARAGE);
  assert.equal(f.contradiction, false);
});

test("un devis établi mène à la relecture puis à l'envoi, jamais à un envoi direct", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "en_attente" }, etatEnvoiDevis: "a_valider" });
  assert.equal(f.etat, "Devis établi");
  assert.match(f.prochaineAction, /Relisez/);
  assert.match(f.prochaineAction, /confirmez son envoi/);
  assert.equal(f.quiAgit, AGIT_GARAGE);
});

test("un devis envoyé rend la main au client, et ne repropose pas de l'envoyer", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" });
  assert.equal(f.etat, "Devis envoyé");
  assert.equal(f.quiAgit, AGIT_CLIENT);
  assert.doesNotMatch(f.prochaineAction, /confirmez son envoi/);
});

test("un envoi programmé n'appelle aucun geste", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "en_attente" }, etatEnvoiDevis: "en_attente_envoi" });
  assert.equal(f.quiAgit, AGIT_PERSONNE);
  assert.match(f.prochaineAction, /programmé/);
});

test("un envoi incertain se vérifie auprès du client, il ne se rejoue pas", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "en_attente" }, etatEnvoiDevis: "envoi_en_cours" });
  assert.match(f.etat, /envoi à vérifier/);
  assert.match(f.prochaineAction, /Vérifiez avec le client/);
  assert.doesNotMatch(f.prochaineAction, /renvoy|réessay/i);
});

test("un devis accepté mène à l'ordre de réparation, pas à une « fiche atelier »", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "accepte" } });
  assert.equal(f.etat, "Devis accepté");
  assert.match(f.prochaineAction, /ordre de réparation/);
  assert.doesNotMatch(f.prochaineAction, /fiche atelier/);
});

test("un ordre déjà ouvert ne se « prépare » plus : il s'ouvre", () => {
  const f = filVehicule({ rdv: {}, devis: { statut: "accepte" }, ordre: { statut: "confirme" } });
  assert.equal(f.etat, "Ordre de réparation ouvert");
  assert.match(f.prochaineAction, /Ouvrez-le/);
  assert.equal(actionOrdreReparation({ statut: "confirme" }), "Ouvrir l'ordre de réparation");
  assert.equal(actionOrdreReparation(null), "Créer l'ordre de réparation");
});

// Corrigé le 13 septembre 2026 : ce test affirmait que les cinq étapes
// engagées donnent la même phrase. C'était précisément le défaut — « attente
// client » et « attente pièce » ne sont pas des travaux en cours, et les
// confondre faisait dire au dossier « à vous de jouer » sur une voiture que
// l'atelier annonçait en attente du client. Les deux attentes ont désormais
// leurs propres tests, plus bas.
test("une voiture dont les travaux avancent renvoie vers l'écran Atelier", () => {
  for (const etape of ["depose", "diagnostic", "intervention"]) {
    const f = filVehicule({ rdv: { statut_atelier: etape }, ordre: { statut: "confirme" } });
    assert.equal(f.etat, "Voiture à l'atelier", etape);
    assert.equal(f.cible, "atelier", etape);
    assert.match(f.prochaineAction, /écran Atelier/);
  }
});

// Recette du 12 septembre 2026 : l'ordre de réparation affichait « Terminé »
// pendant que l'atelier affichait « À venir » pour la même voiture.
test("un ordre terminé et un atelier « à venir » se signalent au lieu de se taire", () => {
  const f = filVehicule({ rdv: { statut_atelier: "a_venir" }, ordre: { statut: "termine" } });
  assert.equal(f.contradiction, true);
  assert.match(f.avertissement, /ordre de réparation est terminé/);
  assert.match(f.avertissement, /Mettez l'atelier à jour/);
  assert.equal(f.etat, "Travaux terminés sur l'ordre de réparation");
  assert.doesNotMatch(f.etat, /À venir/i);
});

test("sans contradiction, aucun avertissement n'est inventé", () => {
  const f = filVehicule({ rdv: { statut_atelier: "pret" }, ordre: { statut: "termine" } });
  assert.equal(f.contradiction, false);
  assert.equal(f.avertissement, null);
  assert.equal(f.etat, "Voiture prête");
  assert.equal(f.quiAgit, AGIT_CLIENT);
});

test("une voiture restituée mène à la facture", () => {
  const f = filVehicule({ rdv: { statut_atelier: "restitue" }, ordre: { statut: "termine" } });
  assert.equal(f.etat, "Voiture restituée");
  assert.match(f.prochaineAction, /facture/);
  assert.equal(f.quiAgit, AGIT_GARAGE);
});

test("la facture suit le même chemin que le devis, et finit le fil", () => {
  const base = { rdv: { statut_atelier: "restitue" }, facture: { statut: "en_attente" } };
  assert.match(filVehicule(base).prochaineAction, /confirmez son envoi/);
  assert.equal(filVehicule({ ...base, etatEnvoiFacture: "envoye" }).quiAgit, AGIT_CLIENT);
  const payee = filVehicule({ ...base, facture: { statut: "payee" } });
  assert.equal(payee.etat, "Facture payée");
  assert.equal(payee.quiAgit, AGIT_PERSONNE);
  assert.match(payee.prochaineAction, /dossier est clos/);
});

test("aucune prochaine action ne promet une lecture du client", () => {
  const cas = [
    {},
    { rdv: {} },
    { rdv: {}, devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" },
    { rdv: { statut_atelier: "restitue" }, facture: { statut: "en_attente" }, etatEnvoiFacture: "envoye" },
  ];
  for (const c of cas) {
    assert.doesNotMatch(filVehicule(c).prochaineAction, /\bl(u|ue)\b|a ouvert/i);
  }
});

test("qui doit agir se lit en clair", () => {
  assert.equal(libelleQuiAgit(AGIT_GARAGE), "À vous de jouer");
  assert.equal(libelleQuiAgit(AGIT_CLIENT), "Au client de jouer");
  assert.equal(libelleQuiAgit(AGIT_PERSONNE), "Rien à faire");
});

test("chaque état a toujours un état, une action et un auteur", () => {
  const cas = [
    {},
    { rdv: {} },
    { rdv: {}, devis: { statut: "refuse" } },
    { rdv: { statut_atelier: "pret" } },
    { rdv: { statut_atelier: "a_venir" }, ordre: { statut: "brouillon" } },
    { rdv: {}, facture: { statut: "en_attente" }, etatEnvoiFacture: "envoi_en_cours" },
  ];
  for (const c of cas) {
    const f = filVehicule(c);
    assert.ok(f.etat && f.prochaineAction && f.quiAgit, JSON.stringify(c));
  }
});

// --- Qui doit bouger quand l'atelier attend --------------------------------
//
// Défaut trouvé en recette le 13 septembre 2026 : la carte de l'atelier disait
// « Attente de la réponse du client », le dossier du même véhicule disait
// « À vous de jouer ». Ces tests figent la correspondance.

test("une voiture en attente client renvoie la balle au client", () => {
  const f = filVehicule({ rdv: { statut_atelier: "attente_client" } })
  assert.equal(f.quiAgit, "client")
  assert.match(f.etat, /attente de la réponse du client/i)
  assert.match(f.prochaineAction, /notez sa réponse/i)
})

test("une voiture en attente de pièce reste au garage, et ce n'est pas « rien à faire »", () => {
  const f = filVehicule({ rdv: { statut_atelier: "attente_piece" } })
  assert.equal(f.quiAgit, "garage")
  assert.match(f.etat, /attente d'une pièce/i)
  assert.match(f.prochaineAction, /dès sa réception/i)
})

test("les deux attentes ne se confondent pas avec un travail en cours", () => {
  const enCours = ["depose", "diagnostic", "intervention"].map((e) => filVehicule({ rdv: { statut_atelier: e } }))
  for (const f of enCours) {
    assert.equal(f.etat, "Voiture à l'atelier")
    assert.equal(f.quiAgit, "garage")
  }
  const attentes = ["attente_client", "attente_piece"].map((e) => filVehicule({ rdv: { statut_atelier: e } }))
  for (const f of attentes) assert.notEqual(f.etat, "Voiture à l'atelier")
})

test("le bouton de l'atelier ne promet plus un document qui n'existe pas", () => {
  // « Fiche atelier » désigne la vue d'un ordre de réparation — le vocabulaire
  // est fixé en tête du module. `CIBLE_ATELIER` mène à la liste de l'atelier :
  // il ne doit donc jamais employer ce mot.
  for (const etape of ["depose", "diagnostic", "intervention", "attente_client", "attente_piece"]) {
    const f = filVehicule({ rdv: { statut_atelier: etape } })
    assert.equal(f.cible, "atelier")
    assert.doesNotMatch(f.libelleAction, /fiche atelier/i, `« ${etape} » promet une fiche atelier`)
  }
})

test("un ordre de réparation ouvert continue d'annoncer sa fiche, lui", () => {
  // La correction ci-dessus ne doit pas retirer le mot là où il est juste.
  const f = filVehicule({ rdv: { statut_atelier: "a_venir" }, ordre: { statut: "confirme" } })
  assert.equal(f.libelleAction, "Ouvrir la fiche atelier")
})
