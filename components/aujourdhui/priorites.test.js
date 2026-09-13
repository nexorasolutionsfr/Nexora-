import assert from "node:assert/strict";
import test from "node:test";

import {
  ENVOI,
  RAISONS,
  compterLeGarage,
  lireEtatEnvoi,
  arriveesDuJour,
  classerPriorites,
  decouperPriorites,
  pretesARendre,
  raisonDePriorite,
} from "./priorites.js";
import { filVehicule } from "../atelier/filVehicule.js";

const MAINTENANT = new Date("2026-09-13T10:00:00+02:00");
const aujourdhui = (h, m = 0) => new Date(`2026-09-13T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`).toISOString();
const avantHier = (h) => new Date(`2026-09-11T${String(h).padStart(2, "0")}:00:00+02:00`).toISOString();

/** Un dossier tel que l'écran le compose : le fil, et ce qui l'a produit. */
function dossier({ etape = "a_venir", debut = aujourdhui(9), fin = aujourdhui(11), devis = null, ordre = null, facture = null, etatEnvoiDevis = null, etatEnvoiFacture = null, etatNotification = null, id = "d1" } = {}) {
  const rdv = { id, statut_atelier: etape, date_debut: debut, date_fin: fin };
  return {
    id,
    rdv,
    etatEnvoiDevis,
    etatEnvoiFacture,
    etatNotification,
    fil: filVehicule({ rdv, devis, ordre, facture, etatEnvoiDevis, etatEnvoiFacture }),
  };
}

// --- La raison, et son absence ---------------------------------------------

test("une voiture dont la balle est au client ne remonte pas", () => {
  // Devis envoyé : c'est au client de répondre. Le mettre dans « à faire
  // maintenant » transforme la liste en inventaire de tout le garage.
  // Heure d'arrivée dans le futur : sans cela le no-show prendrait le dessus,
  // et c'est normal — une voiture qui n'arrive pas est l'affaire du garage,
  // quel que soit l'état du devis.
  const d = dossier({ debut: aujourdhui(16), fin: aujourdhui(17), devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" });
  assert.equal(raisonDePriorite(d, MAINTENANT), null);
});

test("un dossier clos ne remonte pas", () => {
  const d = dossier({ etape: "restitue", facture: { statut: "payee" } });
  assert.equal(raisonDePriorite(d, MAINTENANT), null);
});

test("une contradiction passe avant tout le reste", () => {
  // Ordre terminé alors que la voiture est notée « à venir » : tant que ce
  // n'est pas résolu, rien de ce qu'affiche l'écran n'est fiable.
  const d = dossier({ etape: "a_venir", ordre: { statut: "termine" } });
  const r = raisonDePriorite(d, MAINTENANT);
  assert.equal(r.cle, "contradiction");
  // La contradiction EXACTE, et le geste : « ordre terminé / voiture encore à
  // venir / mettez l'atelier à jour ». Une formule générique obligeait à
  // ouvrir le dossier pour savoir laquelle des deux corriger.
  assert.match(r.texte, /ordre de réparation est terminé/);
  assert.match(r.texte, /encore notée « à venir »/);
  assert.match(r.texte, /Mettez l'atelier à jour/);
  assert.equal(r.texte, d.fil.avertissement);
});

test("une voiture prête dont le client n'est pas prévenu remonte, et c'est urgent", () => {
  const d = dossier({ etape: "pret", etatNotification: "aucune" });
  const r = raisonDePriorite(d, MAINTENANT);
  assert.equal(r.cle, "notification_non_envoyee");
  assert.equal(RAISONS.find((x) => x.cle === r.cle).urgent, true);
});

test("une voiture prête dont le client EST prévenu ne remonte plus", () => {
  assert.equal(raisonDePriorite(dossier({ etape: "pret", etatNotification: "envoye" }), MAINTENANT), null);
});

test("tant qu'on ignore si le client est prévenu, on ne conclut pas qu'il ne l'est pas", () => {
  // `null` = la réponse de `etat_envoi_atelier` n'est pas encore là. Afficher
  // « le client ne le sait pas » serait une affirmation non vérifiée.
  const r = raisonDePriorite(dossier({ etape: "pret", etatNotification: null }), MAINTENANT);
  assert.notEqual(r?.cle, "notification_non_envoyee");
});

test("une voiture attendue dont l'heure est passée remonte avec son heure", () => {
  const r = raisonDePriorite(dossier({ etape: "a_venir", debut: aujourdhui(8) }), MAINTENANT);
  assert.equal(r.cle, "attendue_en_retard");
  assert.match(r.texte, /Attendue à 08:00/);
});

test("une voiture attendue plus tard dans la journée ne remonte pas comme un retard", () => {
  const r = raisonDePriorite(dossier({ etape: "a_venir", debut: aujourdhui(16) }), MAINTENANT);
  assert.notEqual(r?.cle, "attendue_en_retard");
});

test("un rendez-vous d'avant-hier resté « à venir » n'est pas une urgence du jour", () => {
  const r = raisonDePriorite(dossier({ etape: "a_venir", debut: avantHier(8), fin: avantHier(9) }), MAINTENANT);
  assert.notEqual(r?.cle, "attendue_en_retard");
});

test("un créneau dépassé ne remonte que sur une voiture en cours de travail", () => {
  const enCours = raisonDePriorite(dossier({ etape: "intervention", debut: aujourdhui(7), fin: aujourdhui(9) }), MAINTENANT);
  assert.equal(enCours.cle, "creneau_depasse");
  // Bloquée par un tiers : ce n'est pas au garage de rattraper le temps.
  const bloquee = raisonDePriorite(dossier({ etape: "attente_piece", debut: aujourdhui(7), fin: aujourdhui(9) }), MAINTENANT);
  assert.notEqual(bloquee?.cle, "creneau_depasse");
});

test("un document établi mais pas envoyé est nommé comme tel", () => {
  const d = raisonDePriorite(dossier({ debut: aujourdhui(16), fin: aujourdhui(17), devis: { statut: "en_attente" }, etatEnvoiDevis: "aucune" }), MAINTENANT);
  assert.equal(d.cle, "document_a_envoyer");
  assert.match(d.texte, /Devis établi/);
  const f = raisonDePriorite(dossier({ etape: "restitue", facture: { statut: "en_attente" }, etatEnvoiFacture: "a_valider" }), MAINTENANT);
  assert.equal(f.cle, "document_a_envoyer");
  assert.match(f.texte, /Facture établie/);
});

test("à défaut, la raison est la phrase du fil — jamais une phrase inventée ici", () => {
  const d = dossier({ etape: "a_venir", debut: aujourdhui(16) });
  const r = raisonDePriorite(d, MAINTENANT);
  assert.equal(r.cle, "a_vous_de_jouer");
  assert.equal(r.texte, d.fil.prochaineAction);
});

// --- Le classement ---------------------------------------------------------

test("l'ordre suit la raison, puis l'heure du rendez-vous", () => {
  const lignes = classerPriorites([
    dossier({ id: "tard", etape: "a_venir", debut: aujourdhui(16) }),
    dossier({ id: "prete", etape: "pret", etatNotification: "aucune" }),
    dossier({ id: "retard", etape: "a_venir", debut: aujourdhui(8) }),
    dossier({ id: "contradiction", etape: "a_venir", ordre: { statut: "termine" } }),
  ], MAINTENANT);
  assert.deepEqual(lignes.map((l) => l.id), ["contradiction", "prete", "retard", "tard"]);
});

test("à raison égale, la voiture attendue le plus tôt passe devant", () => {
  const lignes = classerPriorites([
    dossier({ id: "neuf", etape: "a_venir", debut: aujourdhui(9) }),
    dossier({ id: "sept", etape: "a_venir", debut: aujourdhui(7) }),
    dossier({ id: "huit", etape: "a_venir", debut: aujourdhui(8) }),
  ], MAINTENANT);
  assert.deepEqual(lignes.map((l) => l.id), ["sept", "huit", "neuf"]);
});

test("chaque ligne porte sa raison, en clair", () => {
  for (const l of classerPriorites([dossier({ etape: "pret", etatNotification: "aucune" })], MAINTENANT)) {
    assert.ok(l.raison && l.raison.length > 5, "raison vide");
  }
});

// --- La limite d'affichage -------------------------------------------------

test("aucune urgence ne disparaît derrière la limite", () => {
  // Six voitures prêtes dont personne n'est prévenu, limite à quatre : les six
  // restent visibles. Une urgence cachée est une urgence découverte trop tard.
  const urgentes = Array.from({ length: 6 }, (_, i) => dossier({ id: `u${i}`, etape: "pret", etatNotification: "aucune" }));
  const { visibles, total, masquees } = decouperPriorites(classerPriorites(urgentes, MAINTENANT), 4);
  assert.equal(visibles.length, 6);
  assert.equal(total, 6);
  assert.equal(masquees, 0);
});

test("le reste est replié, et le compte total reste annoncé", () => {
  const lignes = classerPriorites([
    dossier({ id: "u", etape: "pret", etatNotification: "aucune" }),
    ...Array.from({ length: 8 }, (_, i) => dossier({ id: `n${i}`, etape: "a_venir", debut: aujourdhui(12 + (i % 6)) })),
  ], MAINTENANT);
  const { visibles, total, masquees } = decouperPriorites(lignes, 4);
  assert.equal(visibles.length, 4);
  assert.equal(total, 9);
  assert.equal(masquees, 5);
  // L'urgente est dedans, et en tête.
  assert.equal(visibles[0].id, "u");
});

test("moins de priorités que la limite : rien n'est masqué", () => {
  const { visibles, masquees } = decouperPriorites(classerPriorites([dossier({ etape: "a_venir", debut: aujourdhui(16) })], MAINTENANT), 4);
  assert.equal(visibles.length, 1);
  assert.equal(masquees, 0);
});

test("aucune priorité : des listes vides, pas une erreur", () => {
  const { visibles, total, masquees } = decouperPriorites(classerPriorites([], MAINTENANT), 4);
  assert.deepEqual([visibles.length, total, masquees], [0, 0, 0]);
});

// --- Arrivées et voitures prêtes -------------------------------------------

test("les arrivées du jour portent leur heure réelle, dans l'ordre", () => {
  const a = arriveesDuJour([
    dossier({ id: "b", etape: "a_venir", debut: aujourdhui(14) }),
    dossier({ id: "a", etape: "a_venir", debut: aujourdhui(8) }),
    dossier({ id: "hier", etape: "a_venir", debut: avantHier(9) }),
    dossier({ id: "atelier", etape: "intervention" }),
  ], MAINTENANT);
  assert.deepEqual(a.map((x) => x.id), ["a", "b"]);
  assert.equal(a[0].heure, "08:00");
  assert.equal(a[0].enRetard, true);
  assert.equal(a[1].enRetard, false);
});

test("une voiture prête n'a PAS d'heure de restitution : le modèle n'en porte aucune", () => {
  const p = pretesARendre([dossier({ id: "p", etape: "pret", debut: aujourdhui(8) })]);
  assert.equal(p.length, 1);
  // Le contrat de cette fonction : elle ne fabrique aucune heure. C'est ce qui
  // distingue « prête » d'une « restitution planifiée », qui n'existe pas.
  assert.equal(p[0].heure, undefined);
  assert.equal(p[0].heureRestitution, undefined);
});

test("une voiture qui n'arrive pas reste l'affaire du garage, même si le devis est chez le client", () => {
  // Découvert en écrivant ces tests : le no-show passe AVANT le « qui doit
  // agir » du fil, et c'est voulu. Un client qui ne vient pas se rappelle,
  // même quand on attend par ailleurs sa réponse sur un devis.
  const d = dossier({ etape: "a_venir", debut: aujourdhui(8), devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" });
  assert.equal(d.fil.quiAgit, "client");
  assert.equal(raisonDePriorite(d, MAINTENANT).cle, "attendue_en_retard");
});

// --- Une liste qui contient tout ne hiérarchise rien -------------------------
//
// Constaté sur la journée chargée du prototype : 13 voitures sur 13
// remontaient. `filVehicule` dit « à vous de jouer » pour toute voiture en
// cours de travail — c'est juste, mais ce n'est pas une décision à prendre :
// c'est du travail en cours, et sa place est dans l'Atelier.

test("une voiture simplement en cours de travail n'est pas une priorité", () => {
  // Créneau non dépassé : il ne reste que « suivez l'avancement ».
  const d = dossier({ etape: "intervention", debut: aujourdhui(9), fin: aujourdhui(18) });
  assert.equal(d.fil.quiAgit, "garage");
  assert.equal(d.fil.cible, "atelier");
  assert.equal(raisonDePriorite(d, MAINTENANT), null);
});

test("une voiture en attente de pièce n'est pas une priorité non plus", () => {
  // Le garage doit suivre la commande, mais il n'y a aucune décision à
  // prendre maintenant. Elle est visible dans la file « En attente ».
  const d = dossier({ etape: "attente_piece", debut: avantHier(9), fin: avantHier(12) });
  assert.equal(d.fil.quiAgit, "garage");
  assert.equal(raisonDePriorite(d, MAINTENANT), null);
});

test("mais un créneau dépassé sur cette même voiture la fait remonter", () => {
  const d = dossier({ etape: "intervention", debut: aujourdhui(7), fin: aujourdhui(9) });
  assert.equal(raisonDePriorite(d, MAINTENANT).cle, "creneau_depasse");
});

test("une décision qui attend un geste remonte, elle", () => {
  // Devis accepté sans rendez-vous : le fil pointe vers l'Agenda, il y a
  // quelque chose à faire.
  const d = dossier({ etape: "a_venir", debut: aujourdhui(16), fin: aujourdhui(17), devis: { statut: "accepte" }, etatEnvoiDevis: "envoye" });
  const r = raisonDePriorite(d, MAINTENANT);
  assert.equal(r.cle, "a_vous_de_jouer");
  assert.equal(r.texte, d.fil.prochaineAction);
});


// --- L'état d'un envoi se demande, il ne se déduit pas ----------------------

test("les cinq états d'envoi sont distingués, et nommés", () => {
  assert.equal(lireEtatEnvoi("aucune").libelle, "Notification de disponibilité non envoyée");
  assert.equal(lireEtatEnvoi("a_valider").libelle, "Notification de disponibilité non envoyée");
  assert.equal(lireEtatEnvoi("en_attente_envoi").libelle, "Notification autorisée, départ en attente");
  assert.equal(lireEtatEnvoi("envoi_en_cours").libelle, "Envoi de la notification à vérifier");
  assert.equal(lireEtatEnvoi("envoye").libelle, "Notification envoyée");
  assert.equal(lireEtatEnvoi("bloque").libelle, "Notification bloquée : à revalider");
  for (const cle of Object.keys(ENVOI)) assert.equal(lireEtatEnvoi(cle).connu, true, cle);
});

test("un état indisponible reste INCONNU, jamais « non envoyé »", () => {
  for (const valeur of [null, undefined, "", "autre_chose"]) {
    const e = lireEtatEnvoi(valeur);
    assert.equal(e.connu, false, String(valeur));
    assert.equal(e.libelle, "État de la notification inconnu");
    assert.doesNotMatch(e.libelle, /non envoyée|envoyée/i, String(valeur));
  }
});

test("« notification envoyée » est la seule preuve revendiquée — jamais « client prévenu »", () => {
  // Ce que Nexora sait, c'est qu'un message est parti. Pas qu'il a été lu, ni
  // que le client est au courant.
  for (const cle of Object.keys(ENVOI)) {
    assert.doesNotMatch(ENVOI[cle].libelle, /prévenu|au courant|sait/i, cle);
  }
});

test("chaque état d'envoi mène à la bonne priorité, ou à aucune", () => {
  const cas = {
    aucune: "notification_non_envoyee",
    a_valider: "notification_non_envoyee",
    bloque: "notification_bloquee",
    envoi_en_cours: "notification_incertaine",
    envoye: null,
    en_attente_envoi: null,
  };
  for (const [etat, attendu] of Object.entries(cas)) {
    const r = raisonDePriorite(dossier({ etape: "pret", etatNotification: etat }), MAINTENANT);
    assert.equal(r?.cle ?? null, attendu, etat);
  }
  // Et l'inconnu ne fabrique aucune tâche.
  assert.equal(raisonDePriorite(dossier({ etape: "pret", etatNotification: null }), MAINTENANT), null);
});

test("une notification bloquée passe avant une notification jamais envoyée", () => {
  const lignes = classerPriorites([
    dossier({ id: "jamais", etape: "pret", etatNotification: "aucune" }),
    dossier({ id: "bloquee", etape: "pret", etatNotification: "bloque" }),
  ], MAINTENANT);
  assert.deepEqual(lignes.map((l) => l.id), ["bloquee", "jamais"]);
  assert.ok(lignes.every((l) => l.urgent));
});

// --- Ce qui est au garage, et ce qui est attendu ---------------------------

test("on ne compte comme présentes que les voitures réellement là", () => {
  const c = compterLeGarage([
    dossier({ id: "a", etape: "a_venir", debut: aujourdhui(16) }),
    dossier({ id: "b", etape: "a_venir", debut: aujourdhui(8) }),
    dossier({ id: "c", etape: "depose" }),
    dossier({ id: "d", etape: "attente_piece" }),
    dossier({ id: "e", etape: "pret" }),
    dossier({ id: "f", etape: "restitue" }),
  ], MAINTENANT);
  // Deux attendues, trois présentes. La restituée n'est plus là.
  assert.deepEqual(c, { presentes: 3, attendues: 2 });
});

test("un rendez-vous d'un autre jour resté « à venir » n'est pas attendu aujourd'hui", () => {
  const c = compterLeGarage([dossier({ etape: "a_venir", debut: avantHier(8), fin: avantHier(9) })], MAINTENANT);
  assert.deepEqual(c, { presentes: 0, attendues: 0 });
});

test("un créneau dépassé nomme la FIN des travaux, pas l'heure d'arrivée", () => {
  // Une heure d'arrivée dépassée ne prouve rien sur l'avancement des travaux :
  // les deux phrases ne doivent pas se ressembler.
  const r = raisonDePriorite(dossier({ etape: "intervention", debut: aujourdhui(7), fin: aujourdhui(9) }), MAINTENANT);
  assert.match(r.texte, /Travaux prévus jusqu'à 09:00, dépassés/);
  assert.doesNotMatch(r.texte, /07:00/);
  const arrivee = raisonDePriorite(dossier({ etape: "a_venir", debut: aujourdhui(8) }), MAINTENANT);
  assert.match(arrivee.texte, /Attendue à 08:00/);
});
