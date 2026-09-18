// Construit le workflow « Rappels Nexora Auto » (contrôle technique, e-mail).
//
// Variantes :
//   production.json   : Supabase Production, SMTP Brevo « envois métier »,
//                       INACTIF. À importer dans l'instance vive SEULEMENT avec
//                       le feu vert (docs/architecture/nexora-auto-rappel-ct.md).
//   <sortie>/recette-smtp.json + journaliseur : la même chaîne sur Supabase
//                       TEST, bornée aux comptes de recette, SMTP CONTRÔLÉ
//                       (scripts/recette/smtp-controle.mjs : n'accepte que
//                       @nexora-recette.invalid, ne relaie rien). Construite
//                       seulement si RECETTE_PROPRIETAIRES est fourni ; écrite
//                       hors du dépôt (RECETTE_SORTIE) : les identifiants de
//                       recette changent à chaque jeu.
//   <sortie>/essai-reel.json : la chaîne de Production (identifiant Brevo
//                       « envois métier »), sur Supabase TEST, pour le premier
//                       essai réel que Baptiste autorisera. Elle tourne dans
//                       une instance n8n de RECETTE — jamais dans l'instance
//                       qui sert Nexora Pro — et elle est bornée de cinq façons :
//                       déclenchement manuel seulement (aucune planification),
//                       un seul compte (p_proprietaires), un seul rappel par
//                       exécution (aucune boucle), UNE adresse autorisée
//                       (tout autre destinataire est bloqué avant l'envoi) et
//                       première tentative seulement (aucune reprise).
//                       Construite seulement si ESSAI_PROPRIETAIRE et
//                       ESSAI_DESTINATAIRE sont fournis.
//
// À CHAQUE PASSAGE (tous les quarts d'heure) :
//   1. lire les dossiers abonnés (auto_rappels_a_planifier) ;
//   2. décider avec les RÈGLES DE L'ÉCRAN (lib/auto/rappels.js, embarqué tel
//      quel par embarquer.mjs) et programmer (auto_planifier_rappels) ;
//   3. réserver UN rappel dû (auto_reserver_rappel : gardes, SKIP LOCKED,
//      jeton du débit COMMUN au compte garage), le remettre au fournisseur,
//      classer l'échec (classerEchec.js, le même que les relances), clore
//      (auto_terminer_rappel, rejouée 3 fois), journaliser tout ce qui n'est
//      pas « envoyé » (journaliser_incident). Trois rappels au plus par
//      passage ; un refus temporaire arrête le passage.
//   Issue INCERTAINE (connexion coupée après que le fournisseur a pu accepter) :
//   rien n'est clos, la ligne reste `envoi_en_cours`, jamais reprise, et
//   l'incident demande une vérification humaine.
//
// Les noms des nœuds de réservation, d'envoi et de clôture suivent ceux que le
// journaliseur d'erreurs du socle sait classer (« Réserver la file »,
// « Notifier … (email) », « Clore … ») : une panne de ce workflow est classée
// comme celles du compte garage, sans toucher au journaliseur.
//
// Usage : node n8n/rappels-auto/construire.mjs
//         RECETTE_PROPRIETAIRES=<uuid,…> RECETTE_SORTIE=<dossier> node n8n/rappels-auto/construire.mjs
//         ESSAI_PROPRIETAIRE=<uuid> RECETTE_SORTIE=<dossier> node n8n/rappels-auto/construire.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { embarquer } from "./embarquer.mjs";
import { DEBIT_HEURE, DEBIT_JOUR, JOURNALISEUR_ID, construireJournaliseur } from "../socle-envois/construire.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const sansExport = (f) => readFileSync(f, "utf8").split("\n").filter((l) => !l.startsWith("if (typeof module")).join("\n");
const CLASSER_ECHEC = sansExport(resolve(ICI, "..", "relances-travaux", "classerEchec.js"));
const EXPURGER = sansExport(resolve(ICI, "..", "socle-envois", "expurger.js"));

export const RAPPELS_PAR_PASSAGE = 3;
// L'adresse Nexora vérifiée chez Brevo, la même que le socle ; Brevo réécrit le
// domaine d'enveloppe mais laisse passer le nom affiché et le Reply-To
// (prouvé le 8 sept. 2026 sur un message réellement reçu).
export const EXPEDITEUR = '"Nexora Auto" <nexorasolutions.france@gmail.com>';
export const REPONDRE_A = "nexorasolutions.france@gmail.com";

const TEST_URL = "https://slawilafseganlbghgwx.supabase.co";
const PRODUCTION_URL = "https://omphppsmhmyllapdqevn.supabase.co";
// Créé dans l'instance de RECETTE (Custom Auth, deux en-têtes). NB : dans
// l'instance vive, l'identifiant de même id est un Header Auth (relevé le
// 18 sept. 2026, noms et types seulement) — l'essai n'y tourne pas.
const RPC_TEST = { id: "BmVzKJSWPhAJ5V3Z", name: "RPC Supabase RECETTE (Test)" };
const RPC_PRODUCTION = { id: "fk85N6k6Aea2u0fb", name: "RPC Supabase Production" };
const SMTP_BREVO = { id: "6opiCKNWBLDnvYKJ", name: "SMTP Brevo — envois métier" };
const SMTP_CONTROLE = { id: "SmtpRecetteCtrl01", name: "SMTP recette contrôlé (aucun relais)" };
const JOURNALISEUR_RECETTE = "rappelsautojournal01";

// L'adresse de l'essai : une seule, écrite en clair dans le workflow, et
// comparée à l'octet près au destinataire que la base a réservé.
const adresseAutorisee = (texte) => {
  const a = String(texte || "").trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(a)) throw new Error("ESSAI_DESTINATAIRE : une adresse e-mail attendue");
  return a;
};

const uuids = (texte) => {
  const liste = String(texte || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const u of liste) if (!/^[0-9a-f-]{36}$/.test(u)) throw new Error(`uuid attendu : ${u}`);
  return liste;
};

export const VARIANTES = {
  production: () => ({
    cle: "production", id: "rappelsautoprod00001", nom: "Rappels Nexora Auto (contrôle technique) — INACTIF",
    supabaseUrl: PRODUCTION_URL, rpcCred: RPC_PRODUCTION, smtpCred: SMTP_BREVO,
    proprietaires: null, cron: "*/15 * * * *", manuel: false, journaliseur: JOURNALISEUR_ID,
  }),
  "recette-smtp": () => process.env.RECETTE_PROPRIETAIRES && ({
    cle: "recette-smtp", id: "rappelsautorecette01", nom: "Rappels Nexora Auto — RECETTE (Test, SMTP contrôlé)",
    supabaseUrl: TEST_URL, rpcCred: RPC_TEST, smtpCred: SMTP_CONTROLE,
    proprietaires: uuids(process.env.RECETTE_PROPRIETAIRES), cron: process.env.RECETTE_CRON || "*/15 * * * *", manuel: true,
    journaliseur: JOURNALISEUR_RECETTE,
  }),
  "essai-reel": () => process.env.ESSAI_PROPRIETAIRE && ({
    cle: "essai-reel", id: "rappelsautoessai0001", nom: "Rappels Nexora Auto — ESSAI RÉEL (Test, un compte, une adresse, un message, à la main)",
    supabaseUrl: TEST_URL, rpcCred: RPC_TEST, smtpCred: SMTP_BREVO,
    proprietaires: uuids(process.env.ESSAI_PROPRIETAIRE).slice(0, 1), cron: null, manuel: true, journaliseur: JOURNALISEUR_RECETTE,
    essai: { destinataire: adresseAutorisee(process.env.ESSAI_DESTINATAIRE) },
  }),
};

const lien = (node, index = 0) => ({ node, type: "main", index });
const code = (name, jsCode, position) => ({ parameters: { jsCode }, name, type: "n8n-nodes-base.code", typeVersion: 2, position });
const si = (name, gauche, operateur, droite, position) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
      conditions: [{ id: name, leftValue: gauche, rightValue: droite, operator: { type: "string", operation: operateur } }],
      combinator: "and",
    },
    options: {},
  },
  name, type: "n8n-nodes-base.if", typeVersion: 2, position,
});
function rpc(name, v, fonction, jsonBody, position, extra = {}) {
  const type = v.rpcCred.type || "httpCustomAuth";
  const identifiant = { id: v.rpcCred.id, name: v.rpcCred.name };
  return {
    parameters: {
      method: "POST",
      url: `${v.supabaseUrl}/rest/v1/rpc/${fonction}`,
      authentication: "genericCredentialType",
      genericAuthType: type,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: { timeout: 20000 },
    },
    name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position,
    credentials: { [type]: identifiant },
    ...extra,
  };
}

export function construireRappels(v) {
  const proprietaires = v.proprietaires ? JSON.stringify(v.proprietaires) : "null";
  const X = (i) => i * 240;
  const nodes = [];
  const c = {};
  const relier = (de, ...sorties) => { c[de] = { main: sorties.map((s) => (s === null ? [] : [lien(s)])) }; };

  if (v.cron) nodes.push({ parameters: { rule: { interval: [{ field: "cronExpression", expression: v.cron }] } }, name: "Tous les quarts d'heure", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [X(0), 0] });
  if (v.manuel) nodes.push({ parameters: {}, name: "Lancer à la main", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [X(0), 200] });

  nodes.push(rpc("Lire les dossiers abonnés", v, "auto_rappels_a_planifier", `{"p_proprietaires": ${proprietaires}}`, [X(1), 0], { alwaysOutputData: true }));
  nodes.push(code("Décider avec les règles de l'écran", [
    "// Les règles du contrôle technique et le texte du message viennent du dépôt",
    "// (lib/auto/rappels.js et ce qu'il importe), embarqués à l'identique par",
    "// n8n/rappels-auto/embarquer.mjs. Ne rien corriger ici : corriger le dépôt et",
    "// reconstruire.",
    embarquer(),
    "const { planifierRappels } = __module('lib/auto/rappels.js');",
    "const dossiers = $input.all().map((i) => i.json).filter((d) => d && d.abonnement_id);",
    "return [{ json: { p_plans: planifierRappels(dossiers, { maintenant: new Date() }), dossiers: dossiers.length } }];",
  ].join("\n"), [X(2), 0]));
  nodes.push(rpc("Programmer les rappels", v, "auto_planifier_rappels",
    `={{ JSON.stringify({ p_plans: $json.p_plans, p_proprietaires: ${proprietaires} }) }}`, [X(3), 0], { alwaysOutputData: true }));
  nodes.push(rpc("Réserver la file", v, "auto_reserver_rappel",
    `={"p_proprietaires": ${proprietaires}, "p_limite_heure": ${DEBIT_HEURE}, "p_limite_jour": ${DEBIT_JOUR}, "p_workflow_id": "{{ $workflow.id }}"}`,
    [X(4), 0], { alwaysOutputData: true }));
  nodes.push(code("Un rappel à la fois", [
    "// Une seule ligne réservée par tour : une panne ne laisse qu'une ligne incertaine.",
    "// Rien de dû (ou débit commun atteint) : aucun élément, le passage s'arrête ici.",
    "return $input.all().filter((i) => i.json && i.json.ref).slice(0, 1).map((i) => ({ json: i.json, pairedItem: { item: 0 } }));",
  ].join("\n"), [X(5), 0]));
  nodes.push(code("Vérifier avant envoi", [
    "// Rien n'est encore parti : une adresse inutilisable ou un message vide se",
    "// disent maintenant, au lieu de laisser le fournisseur échouer en « incertain ».",
    `const EXPEDITEUR = ${JSON.stringify(EXPEDITEUR)};`,
    `const REPONDRE_A = ${JSON.stringify(REPONDRE_A)};`,
    "const r = $json;",
    "const adresse = String(r.destinataire || '');",
    "let motif = null;",
    "if (!/^[^\\s@<>\"]+@[^\\s@<>\"]+\\.[^\\s@<>\"]+$/.test(adresse)) motif = 'adresse du compte absente ou invalide, rien n\\'est parti';",
    "else if (!String(r.texte || '').trim() || !String(r.objet || '').trim()) motif = 'message vide, rien n\\'est parti';",
    "return [{ json: { ...r, expediteur: EXPEDITEUR, repondreA: REPONDRE_A, pret: motif === null, motif_verification: motif } }];",
  ].join("\n"), [X(6), 0]));
  if (v.essai) {
    // ESSAI RÉEL : rien ne part vers une autre adresse que celle autorisée, et
    // jamais une deuxième tentative. Un écart bloque la ligne AVANT l'envoi.
    nodes.push(code("Garde de l'essai", [
      `const AUTORISEE = ${JSON.stringify(v.essai.destinataire)};`,
      "const r = $json;",
      "let motif = r.motif_verification;",
      "if (r.pret && String(r.destinataire || '').trim().toLowerCase() !== AUTORISEE) motif = 'essai : destinataire non autorisé, rien n\\'est parti';",
      "else if (r.pret && Number(r.tentatives) !== 1) motif = 'essai : une seule tentative autorisée, rien n\\'est reparti';",
      "return [{ json: { ...r, pret: r.pret && motif === r.motif_verification, motif_verification: motif } }];",
    ].join("\n"), [X(6), 160]));
  }
  nodes.push(si("Prêt à envoyer ?", "={{ $json.pret === true ? 'oui' : 'non' }}", "equals", "oui", [X(7), 0]));
  // DERNIER CONTRÔLE, juste avant la transmission (20260922001500) : un arrêt
  // d'urgence posé après la réservation remet le rappel en attente, et seul un
  // « ok » de la base ouvre le nœud d'envoi. Une panne ici arrête l'exécution
  // (ni reprise, ni suite) : rien n'est transmis, la ligne reste « en cours
  // d'envoi » et l'incident nomme ce nœud.
  nodes.push(rpc("Confirmer la transmission", v, "auto_confirmer_transmission", "={\"p_ref\": \"{{ $('Prêt à envoyer ?').item.json.ref }}\"}", [X(8), -120]));
  nodes.push(si("Transmission confirmée ?", "={{ $json.ok === true ? 'oui' : 'non' }}", "equals", "oui", [X(9), -120]));
  // Le message vient du rappel réservé (sortie de « Prêt à envoyer ? »), pas de
  // la réponse du contrôle.
  const rappel = (champ) => `={{ $('Prêt à envoyer ?').item.json.${champ} }}`;
  nodes.push({
    parameters: {
      fromEmail: rappel("expediteur"),
      toEmail: rappel("destinataire"),
      subject: rappel("objet"),
      emailFormat: "text",
      text: rappel("texte"),
      options: { appendAttribution: false, replyTo: rappel("repondreA") },
    },
    name: "Notifier le rappel (email)",
    type: "n8n-nodes-base.emailSend",
    typeVersion: 2.1,
    position: [X(10), -120],
    credentials: { smtp: v.smtpCred },
    onError: "continueErrorOutput",
  });
  nodes.push(code("Accepté par le fournisseur", "return [{ json: { resultat: 'envoye', motif: null, categorie: null, noeud: 'Notifier le rappel (email)' } }];", [X(11), -200]));
  nodes.push(code("Classer l'échec", [
    CLASSER_ECHEC,
    "const brut = $json.error && typeof $json.error === 'object' ? $json.error : { message: $json.error || $json.message || '' };",
    "const c = classerEchec({ message: brut.message || $json.message || '', description: brut.description, code: brut.code || $json.code, responseCode: brut.responseCode ?? $json.responseCode, command: brut.command || $json.command });",
    "const categorie = { a_reprendre: 'refus_temporaire', bloque: 'refus_definitif', incertain: 'envoi_incertain' }[c.resultat];",
    "return [{ json: { resultat: c.resultat, motif: c.motif, categorie, noeud: 'Notifier le rappel (email)' } }];",
  ].join("\n"), [X(11), -40]));
  nodes.push(code("Échec avant envoi", "return [{ json: { resultat: 'bloque', motif: $json.motif_verification, categorie: 'donnees_invalides', noeud: 'Vérifier avant envoi' } }];", [X(11), 120]));
  nodes.push(code("Décider l'issue", [
    EXPURGER,
    "// Le plafond de trois tentatives est tenu en base (auto_terminer_rappel) ;",
    "// ici, on ne fait que nommer l'incident.",
    "const r = $('Un rappel à la fois').item.json;",
    "let { resultat, motif, categorie, noeud } = $json;",
    "const tentatives = Number(r.tentatives);",
    "if (resultat === 'a_reprendre' && tentatives >= 3) categorie = 'refus_temporaire_repete';",
    "return [{ json: {",
    "  ref: r.ref, resultat, categorie, noeud, tentatives,",
    "  motif: motif === null || motif === undefined ? null : expurger(motif, 300),",
    "  intervention: ['bloque', 'incertain'].includes(resultat) || (resultat === 'a_reprendre' && tentatives >= 3),",
    "} }];",
  ].join("\n"), [X(12), 0]));
  nodes.push(si("Issue connue ?", "={{ $json.resultat }}", "notEquals", "incertain", [X(13), 0]));
  nodes.push(rpc("Clore le rappel", v, "auto_terminer_rappel",
    "={\"p_ref\": \"{{ $json.ref }}\", \"p_resultat\": \"{{ $json.resultat }}\", \"p_motif\": {{ $json.motif === null ? 'null' : JSON.stringify($json.motif) }}}",
    [X(14), -100], { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, alwaysOutputData: true }));
  nodes.push(si("Incident à journaliser ?", "={{ $('Décider l\\'issue').item.json.resultat }}", "notEquals", "envoye", [X(15), -100]));
  nodes.push(rpc("Journaliser l'incident", v, "journaliser_incident",
    "={{ JSON.stringify({ p_incident: { categorie: $('Décider l\\'issue').item.json.categorie, workflow_id: $workflow.id, workflow_nom: $workflow.name, execution_id: $execution.id, noeud: $('Décider l\\'issue').item.json.noeud, notification_file: null, notification_id: $('Décider l\\'issue').item.json.ref, intervention_requise: $('Décider l\\'issue').item.json.intervention, message: 'rappels Nexora Auto — ' + ($('Décider l\\'issue').item.json.resultat === 'incertain' ? 'issue incertaine, rien n\\'est clos, vérification humaine : ' : '') + ($('Décider l\\'issue').item.json.motif || '') } }) }}",
    [X(16), 60], { onError: "continueRegularOutput", alwaysOutputData: true }));
  // Après un refus temporaire, on s'arrête : la ligne est reprise plus tard
  // (30 min, puis 2 h), jamais dans la seconde. L'essai ne boucle jamais.
  if (!v.essai) nodes.push(si("Encore un ?", `={{ $runIndex < ${RAPPELS_PAR_PASSAGE - 1} && $('Décider l\\'issue').item.json.resultat !== 'a_reprendre' ? 'oui' : 'non' }}`, "equals", "oui", [X(17), 0]));

  const depart = [v.cron && "Tous les quarts d'heure", v.manuel && "Lancer à la main"].filter(Boolean);
  for (const d of depart) relier(d, "Lire les dossiers abonnés");
  relier("Lire les dossiers abonnés", "Décider avec les règles de l'écran");
  relier("Décider avec les règles de l'écran", "Programmer les rappels");
  relier("Programmer les rappels", "Réserver la file");
  relier("Réserver la file", "Un rappel à la fois");
  relier("Un rappel à la fois", "Vérifier avant envoi");
  if (v.essai) {
    relier("Vérifier avant envoi", "Garde de l'essai");
    relier("Garde de l'essai", "Prêt à envoyer ?");
  } else {
    relier("Vérifier avant envoi", "Prêt à envoyer ?");
  }
  relier("Prêt à envoyer ?", "Confirmer la transmission", "Échec avant envoi");
  relier("Confirmer la transmission", "Transmission confirmée ?");
  // Refus (arrêt d'urgence, rappel clos ailleurs) : la base a déjà tout remis
  // en ordre, rien d'autre à faire dans ce passage.
  relier("Transmission confirmée ?", "Notifier le rappel (email)", null);
  relier("Notifier le rappel (email)", "Accepté par le fournisseur", "Classer l'échec");
  relier("Accepté par le fournisseur", "Décider l'issue");
  relier("Classer l'échec", "Décider l'issue");
  relier("Échec avant envoi", "Décider l'issue");
  relier("Décider l'issue", "Issue connue ?");
  relier("Issue connue ?", "Clore le rappel", "Journaliser l'incident");
  relier("Clore le rappel", "Incident à journaliser ?");
  if (v.essai) {
    relier("Incident à journaliser ?", "Journaliser l'incident", null);
  } else {
    relier("Incident à journaliser ?", "Journaliser l'incident", "Encore un ?");
    relier("Journaliser l'incident", "Encore un ?");
    relier("Encore un ?", "Réserver la file", null);
  }

  return {
    id: v.id,
    name: v.nom,
    active: false,
    nodes,
    connections: c,
    settings: { executionOrder: "v1", binaryMode: "separate", errorWorkflow: v.journaliseur, saveDataErrorExecution: "all", saveDataSuccessExecution: "all", saveManualExecutions: true },
    pinData: {},
    tags: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ecrire = (chemin, wf) => {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, JSON.stringify(wf, null, 2) + "\n");
    console.log(`${chemin}  ${wf.id}  ${wf.nodes.length} nœuds`);
  };
  ecrire(resolve(ICI, "production.json"), construireRappels(VARIANTES.production()));
  const sortie = process.env.RECETTE_SORTIE;
  for (const cle of ["recette-smtp", "essai-reel"]) {
    const v = VARIANTES[cle]();
    if (!v) continue;
    if (!sortie) throw new Error("RECETTE_SORTIE : dossier hors du dépôt attendu");
    if (resolve(sortie).startsWith(resolve(ICI, "..", ".."))) throw new Error("RECETTE_SORTIE doit être HORS du dépôt");
    ecrire(resolve(sortie, `${cle}.json`), construireRappels(v));
    if (cle === "recette-smtp" || cle === "essai-reel") {
      ecrire(resolve(sortie, "journaliseur.json"), construireJournaliseur({
        cle: "recette", supabaseUrl: TEST_URL, rpcCred: RPC_TEST, journaliseur: JOURNALISEUR_RECETTE, urlJournal: null,
      }));
    }
  }
}
