// Construit les workflows fiabilisés du socle d'envois à partir des
// définitions VIVES conservées dans `origine-2026-09-15/` (exportées en lecture
// seule le 15 septembre 2026). Correctifs ciblés : mêmes ids, même composition
// des messages (« Construire le message » n'est pas touché), mêmes lectures.
//
// Variantes :
//   production/<nom>.json : ids d'origine, Supabase Production, Brevo. À importer
//                           dans l'instance vive SEULEMENT avec le feu vert
//                           (procédure : BASCULE-A-AUTORISER.md).
//   recette/<nom>.json    : ids neufs, Supabase TEST derrière le relais de
//                           pannes, SMTP contrôlé, bornés à UN garage de recette.
//                           Construits seulement si RECETTE_GARAGE est fourni.
//
// CE QUI CHANGE, par workflow du socle
//   1. Une ligne réservée à la fois (`p_limite: 1`), trois au plus par passage :
//      une coupure ne laisse qu'UNE ligne en `envoi_en_cours`, jamais des lignes
//      réservées et jamais tentées.
//   2. Réservation : délai d'attente de 20 s, aucune reprise automatique (une
//      réponse perdue peut suivre une réservation validée). L'échec fait échouer
//      l'exécution → workflow d'erreur.
//   3. Lecture ou préparation impossible, destinataire absent : issue CERTAINE
//      « rien n'est parti » (à reprendre, ou bloqué si les données manquent).
//   4. Envoi : sortie d'erreur classée par classerEchec.js (4xx → à reprendre,
//      5xx → bloqué, tout le reste → INCERTAIN, rien n'est clos).
//   5. Plafond : un refus temporaire à la 3e tentative bloque la ligne.
//   6. Une seule clôture, rejouée 3 fois (terminer_notification n'agit que sur
//      `envoi_en_cours` : la rejouer ne change rien de plus). Si elle échoue
//      encore, l'exécution échoue → workflow d'erreur → « clôture échouée ».
//   7. Toute issue autre qu'« envoyé » est journalisée APRÈS la clôture ; un
//      journal indisponible n'arrête pas la file.
//   8. settings.errorWorkflow = le journaliseur ; cadence selon CADENCES.
//
// Usage : node n8n/socle-envois/construire.mjs
//         RECETTE_GARAGE=<uuid> [RECETTE_URL=http://host.docker.internal:8787] \
//         [RECETTE_CRON="* * * * *"] node n8n/socle-envois/construire.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const ORIGINE = resolve(ICI, "origine-2026-09-15");
const sansExport = (f) => readFileSync(f, "utf8").split("\n").filter((l) => !l.startsWith("if (typeof module")).join("\n");
const CLASSER_ECHEC = sansExport(resolve(ICI, "..", "relances-travaux", "classerEchec.js"));
const EXPURGER = sansExport(resolve(ICI, "expurger.js"));

export const JOURNALISEUR_ID = "erroralerts000000000000000001";
export const MAX_TENTATIVES = 3;
export const LIGNES_PAR_PASSAGE = 3;

// Cadence proposée (docs/architecture/plan-n8n-2026-09-14.md, §9).
export const CADENCES = {
  "nouveau-devis": "*/2 * * * *",
  facture: "*/5 * * * *",
  "proposition-rdv": "*/5 * * * *",
  "vehicule-pret": "*/5 * * * *",
};
const TABLES_FILE = { devis: "notifications_devis", factures: "notifications_factures", proposition: "notifications_proposition", atelier: "notifications_atelier" };

const PRODUCTION = {
  cle: "production",
  supabaseUrl: "https://omphppsmhmyllapdqevn.supabase.co",
  rpcCred: { id: "fk85N6k6Aea2u0fb", name: "RPC Supabase Production" },
  supaCred: { id: "C90K7jXD8RR1HJKP", name: "Supabase account" },
  smtpCred: { id: "6opiCKNWBLDnvYKJ", name: "SMTP Brevo — envois métier" },
  garages: null,
  journaliseur: JOURNALISEUR_ID,
};
function recette() {
  const g = process.env.RECETTE_GARAGE;
  if (!g) return null;
  if (!/^[0-9a-f-]{36}$/.test(g)) throw new Error("RECETTE_GARAGE : uuid attendu");
  return {
    cle: "recette",
    supabaseUrl: process.env.RECETTE_URL || "http://host.docker.internal:8787",
    rpcCred: { id: "BmVzKJSWPhAJ5V3Z", name: "RPC Supabase RECETTE (Test)" },
    supaCred: { id: "UcypEtKPfdzK32kR", name: "Supabase RECETTE (Test)" },
    smtpCred: { id: "SmtpRecetteCtrl01", name: "SMTP recette contrôlé (aucun relais)" },
    garages: [g],
    cron: process.env.RECETTE_CRON || "* * * * *",
    journaliseur: "fiabrecjournal000001",
    // Recette seulement : le journaliseur peut viser un second relais, pour
    // couper la réservation sans couper le journal (regroupement d'erreurs
    // réseau). En Production les deux visent le même Supabase : limite écrite.
    urlJournal: process.env.RECETTE_URL_JOURNAL || null,
    id: (nom) => `fiabrec${nom.replace(/[^a-z]/g, "").slice(0, 8)}`.padEnd(19, "0") + "1",
  };
}

const lire = (nom) => JSON.parse(readFileSync(resolve(ORIGINE, `${nom}.json`), "utf8"));
const lien = (node, index = 0) => ({ node, type: "main", index });
const code = (name, jsCode, position) => ({ parameters: { jsCode }, name, type: "n8n-nodes-base.code", typeVersion: 2, position });
const si = (name, gauche, operateur, droite, position, type = "string") => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
      conditions: [{ id: name, leftValue: gauche, rightValue: droite, operator: { type, operation: operateur } }],
      combinator: "and",
    },
    options: {},
  },
  name, type: "n8n-nodes-base.if", typeVersion: 2, position,
});
function rpc(name, v, fonction, jsonBody, position, extra = {}) {
  return {
    parameters: {
      method: "POST",
      url: `${v.supabaseUrl}/rest/v1/rpc/${fonction}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpCustomAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: { timeout: 20000 },
    },
    name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position,
    credentials: { httpCustomAuth: v.rpcCred },
    ...extra,
  };
}

export function construireSocle(nom, v) {
  const w = lire(nom);
  const par = (n) => w.nodes.find((x) => x.name === n);
  const reserverOrigine = par("Réserver la file");
  const pFile = JSON.parse(reserverOrigine.parameters.jsonBody).p_file;
  const table = TABLES_FILE[pFile];
  if (!table) throw new Error(`${nom} : file inconnue ${pFile}`);
  const lectures = w.nodes.filter((x) => x.type === "n8n-nodes-base.supabase");
  const email = w.nodes.find((x) => x.type === "n8n-nodes-base.emailSend");
  const construireMsg = par("Construire le message");
  const declencheur = w.nodes.find((x) => x.type === "n8n-nodes-base.scheduleTrigger");
  if (!lectures.length || !email || !construireMsg || !declencheur) throw new Error(`${nom} : structure inattendue`);
  // Ordre des lectures = chaîne d'origine, à partir de la boucle.
  const ordre = [];
  for (let n = w.connections["Une notification à la fois"].main[1][0].node; n && n !== construireMsg.name; n = w.connections[n].main[0][0].node) ordre.push(n);
  const premiereLecture = ordre[0];

  const cron = v.cron || CADENCES[nom];
  const minutes = cron.startsWith("*/") ? Number(cron.split(" ")[0].slice(2)) : 1;
  const garages = v.garages ? JSON.stringify(v.garages) : "null";
  const X = (i) => -6600 + i * 260;

  const nodes = [];
  nodes.push({ ...declencheur, name: minutes === 1 ? "Toutes les minutes (recette)" : `Toutes les ${minutes} minutes`, parameters: { rule: { interval: [{ field: "cronExpression", expression: cron }] } }, position: [X(0), -400] });
  nodes.push({
    ...rpc("Réserver la file", v, "reserver_notifications", `{"p_file": "${pFile}", "p_limite": 1, "p_garages": ${garages}}`, [X(1), -400], { alwaysOutputData: true }),
    id: reserverOrigine.id,
  });
  nodes.push(code("Une notification à la fois", [
    "// Une seule ligne réservée par tour : une panne ne laisse qu'une ligne incertaine.",
    "// File vide : aucun élément, le passage s'arrête ici.",
    "return $input.all().filter((i) => i.json && i.json.id).slice(0, 1).map((i) => ({ json: i.json, pairedItem: { item: 0 } }));",
  ].join("\n"), [X(2), -400]));
  nodes.push({
    parameters: { operation: "get", tableId: table, filters: { conditions: [{ keyName: "id", keyValue: "={{ $('Une notification à la fois').item.json.id }}" }] } },
    name: "Relire la notification", type: "n8n-nodes-base.supabase", typeVersion: 1, position: [X(3), -400],
    credentials: { supabaseApi: v.supaCred }, alwaysOutputData: true, onError: "continueRegularOutput",
  });
  ordre.forEach((n, i) => {
    const o = par(n);
    // Sortie d'erreur + alwaysOutputData = DEUX éléments (recette E5 : 5 clôtures pour une
    // ligne). Un seul élément : l'erreur passe sur la sortie normale et « Vérifier » la lit.
    nodes.push({ ...o, position: [X(4 + i), -400], credentials: { supabaseApi: v.supaCred }, alwaysOutputData: true, onError: "continueRegularOutput" });
  });
  const xc = 4 + ordre.length;
  nodes.push({ ...construireMsg, position: [X(xc), -400], onError: "continueRegularOutput" });
  nodes.push(code("Vérifier avant envoi", [
    "// Rien n'est encore parti. Lecture en panne (à reprendre), document introuvable ou",
    "// adresse inutilisable (bloqué) : on le dit maintenant, au lieu de laisser le",
    "// fournisseur échouer en « incertain ».",
    `const LECTURES = ${JSON.stringify(["Relire la notification", ...ordre])};`,
    "const lu = (n) => { try { return $(n).item.json || {}; } catch (e) { return { error: 'lecture non faite : ' + n }; } };",
    "const texteErreur = (e) => (typeof e === 'string' ? e : (e && (e.message || e.description)) || 'erreur inconnue');",
    "const pannes = LECTURES.map((n) => [n, lu(n)]).filter(([, j]) => j.error);",
    "if ($json.error) pannes.push(['Construire le message', $json]);",
    "if (pannes.length) {",
    "  const [n, j] = pannes[0];",
    "  return [{ json: { pret: false, panne: true, noeud_panne: n, motif_verification: 'lecture ou préparation impossible (' + n + '), rien n\\'est parti : ' + String(texteErreur(j.error)).slice(0, 200) } }];",
    "}",
    `const doc = lu(${JSON.stringify(premiereLecture)});`,
    "const m = $json;",
    "const adresse = String(m.client_email || '');",
    "let motif = null;",
    "if (!doc.id) motif = 'document introuvable à la lecture, rien n\\'est parti';",
    "else if (!/^[^\\s@<>\"]+@[^\\s@<>\"]+\\.[^\\s@<>\"]+$/.test(adresse)) motif = 'adresse du client absente ou invalide, rien n\\'est parti';",
    "else if (!String(m.texte || '').trim()) motif = 'message vide, rien n\\'est parti';",
    "return [{ json: { ...m, pret: motif === null, panne: false, motif_verification: motif } }];",
  ].join("\n"), [X(xc + 1), -400]));
  // Comparaison de texte : un test booléen strict avec valeur de droite vide
  // est refusé par n8n 2.37 (recette du 15 sept., exécution 14).
  nodes.push(si("Prêt à envoyer ?", "={{ $json.pret === true ? 'oui' : 'non' }}", "equals", "oui", [X(xc + 2), -400]));
  nodes.push({ ...email, position: [X(xc + 3), -500], credentials: { smtp: v.smtpCred }, onError: "continueErrorOutput" });
  nodes.push(code("Accepté par le fournisseur", "return [{ json: { resultat: 'envoye', motif: null, categorie: null, noeud: " + JSON.stringify(email.name) + " } }];", [X(xc + 4), -600]));
  nodes.push(code("Classer l'échec", [
    CLASSER_ECHEC,
    "const brut = $json.error && typeof $json.error === 'object' ? $json.error : { message: $json.error || $json.message || '' };",
    "const c = classerEchec({ message: brut.message || $json.message || '', description: brut.description, code: brut.code || $json.code, responseCode: brut.responseCode ?? $json.responseCode, command: brut.command || $json.command });",
    "const categorie = { a_reprendre: 'refus_temporaire', bloque: 'refus_definitif', incertain: 'envoi_incertain' }[c.resultat];",
    `return [{ json: { resultat: c.resultat, motif: c.motif, categorie, noeud: ${JSON.stringify(email.name)} } }];`,
  ].join("\n"), [X(xc + 4), -400]));
  nodes.push(code("Échec avant envoi", [
    "// Vérification refusée : panne de lecture ou de préparation (à reprendre, plafonné)",
    "// ou données manquantes (bloqué, un humain corrige).",
    "if ($json.panne === true) {",
    "  return [{ json: { resultat: 'a_reprendre', motif: $json.motif_verification, categorie: 'echec_avant_envoi', noeud: $json.noeud_panne } }];",
    "}",
    "return [{ json: { resultat: 'bloque', motif: $json.motif_verification, categorie: 'donnees_invalides', noeud: 'Vérifier avant envoi' } }];",
  ].join("\n"), [X(xc + 4), -200]));
  nodes.push(code("Décider l'issue", [
    EXPURGER,
    `const MAX_TENTATIVES = ${MAX_TENTATIVES};`,
    "const notif = $('Une notification à la fois').item.json;",
    "let tentatives = null;",
    "try { tentatives = Number($('Relire la notification').item.json.tentatives); } catch (e) { tentatives = null; }",
    "let { resultat, motif, categorie, noeud } = $json;",
    "if (resultat === 'a_reprendre' && Number.isFinite(tentatives) && tentatives >= MAX_TENTATIVES) {",
    "  resultat = 'bloque';",
    "  categorie = categorie === 'refus_temporaire' ? 'refus_temporaire_repete' : categorie;",
    "  motif = `échec temporaire répété (${tentatives} tentatives), mis de côté : ${motif}`;",
    "}",
    "const intervention = ['bloque', 'incertain'].includes(resultat);",
    "return [{ json: {",
    `  id: notif.id, file: ${JSON.stringify(pFile)}, resultat, categorie, noeud, tentatives,`,
    "  motif: motif === null ? null : expurger(motif, 300),",
    "  intervention,",
    "} }];",
  ].join("\n"), [X(xc + 5), -400]));
  nodes.push(si("Issue connue ?", "={{ $json.resultat }}", "notEquals", "incertain", [X(xc + 6), -400]));
  nodes.push({
    ...rpc("Clore la notification", v, "terminer_notification",
      `={"p_file": "${pFile}", "p_id": "{{ $json.id }}", "p_resultat": "{{ $json.resultat }}", "p_motif": {{ $json.motif === null ? 'null' : JSON.stringify($json.motif) }}}`,
      [X(xc + 7), -500], { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, alwaysOutputData: true }),
  });
  nodes.push(si("Incident à journaliser ?", "={{ $('Décider l\\'issue').item.json.resultat }}", "notEquals", "envoye", [X(xc + 8), -500]));
  nodes.push(rpc("Journaliser l'incident", v, "journaliser_incident",
    "={{ JSON.stringify({ p_incident: { categorie: $('Décider l\\'issue').item.json.categorie, workflow_id: $workflow.id, workflow_nom: $workflow.name, execution_id: $execution.id, noeud: $('Décider l\\'issue').item.json.noeud, notification_file: $('Décider l\\'issue').item.json.file, notification_id: $('Décider l\\'issue').item.json.id, intervention_requise: $('Décider l\\'issue').item.json.intervention, message: $('Décider l\\'issue').item.json.resultat === 'incertain' ? 'issue incertaine, rien n\\'est clos, vérification humaine : ' + $('Décider l\\'issue').item.json.motif : $('Décider l\\'issue').item.json.motif } }) }}",
    [X(xc + 9), -300], { onError: "continueRegularOutput", alwaysOutputData: true }));
  // Après un refus temporaire, on s'arrête : sinon la ligne, remise en attente,
  // serait reprise dans la seconde (recette du 15 sept., exécution 25 : trois
  // tentatives en une minute). Une tentative au plus par ligne et par passage.
  nodes.push(si("Encore une ?", `={{ $runIndex < ${LIGNES_PAR_PASSAGE - 1} && $('Décider l\\'issue').item.json.resultat !== 'a_reprendre' ? 'oui' : 'non' }}`, "equals", "oui", [X(xc + 10), -400]));

  const c = {};
  const relier = (de, ...sorties) => { c[de] = { main: sorties.map((s) => (s === null ? [] : [lien(s)])) }; };
  relier(nodes[0].name, "Réserver la file");
  relier("Réserver la file", "Une notification à la fois");
  relier("Une notification à la fois", "Relire la notification");
  relier("Relire la notification", premiereLecture);
  ordre.forEach((n, i) => relier(n, ordre[i + 1] || construireMsg.name));
  relier(construireMsg.name, "Vérifier avant envoi");
  relier("Vérifier avant envoi", "Prêt à envoyer ?");
  relier("Prêt à envoyer ?", email.name, "Échec avant envoi");
  relier(email.name, "Accepté par le fournisseur", "Classer l'échec");
  relier("Accepté par le fournisseur", "Décider l'issue");
  relier("Classer l'échec", "Décider l'issue");
  relier("Échec avant envoi", "Décider l'issue");
  relier("Décider l'issue", "Issue connue ?");
  relier("Issue connue ?", "Clore la notification", "Journaliser l'incident");
  relier("Clore la notification", "Incident à journaliser ?");
  relier("Incident à journaliser ?", "Journaliser l'incident", "Encore une ?");
  relier("Journaliser l'incident", "Encore une ?");
  relier("Encore une ?", "Réserver la file", null);

  return {
    id: v.cle === "production" ? w.id : v.id(nom),
    name: v.cle === "production" ? w.name : `${w.name} — RECETTE fiabilisation`,
    active: false,
    nodes,
    connections: c,
    settings: { executionOrder: "v1", binaryMode: "separate", errorWorkflow: v.journaliseur, saveDataErrorExecution: "all", saveDataSuccessExecution: "all", saveManualExecutions: true },
    pinData: {},
    tags: [],
  };
}

export function construireJournaliseur(v) {
  const w = lire("journalisation-erreurs");
  const declencheur = w.nodes.find((x) => x.type === "n8n-nodes-base.errorTrigger");
  const extraire = w.nodes.find((x) => x.name === "Extraire les infos d'erreur");
  const journaliser = w.nodes.find((x) => x.name === "Journaliser l'erreur");
  const nodes = [
    declencheur,
    { ...extraire, parameters: { jsCode: [
      "// Workflow d'erreur des workflows du socle. N'envoie rien à personne.",
      "// Classe l'échec d'une exécution et le journalise par journaliser_incident",
      "// (regroupement en base). S'il échoue lui-même, son exécution reste en",
      "// erreur dans n8n : n8n ne déclenche pas un workflow d'erreur pour lui-même.",
      EXPURGER,
      "const src = $json || {};",
      "const exec = src.execution || {};",
      "const wf = src.workflow || {};",
      "const err = exec.error || src.error || {};",
      "const noeud = (err.node && (err.node.name || err.node)) || exec.lastNodeExecuted || 'inconnu';",
      "const brut = [err.message, err.description].filter((x) => typeof x === 'string' && x.trim()).join(' | ') || 'erreur sans message';",
      "const RESEAU_AVANT = /cannot be established|refused the connection|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i;",
      "let categorie = 'echec_workflow';",
      "let intervention = true;",
      "let conseil = '';",
      "if (noeud === 'Réserver la file') {",
      "  if (RESEAU_AVANT.test(brut)) { categorie = 'reseau_avant_reservation'; intervention = false; conseil = 'aucune ligne réservée'; }",
      "  else { categorie = 'reservation_sans_reponse'; conseil = 'la base a pu réserver : vérifier les lignes envoi_en_cours de cette file'; }",
      "} else if (/^Notifier .*\\(email\\)$/.test(String(noeud))) {",
      "  categorie = 'envoi_incertain'; conseil = 'exécution interrompue pendant l\\'envoi : le message a pu partir, la ligne reste envoi_en_cours, vérification humaine';",
      "} else if (String(noeud).startsWith('Clore')) {",
      "  categorie = 'cloture_echouee'; conseil = 'issue de l\\'envoi non enregistrée : la ligne reste envoi_en_cours, vérification humaine avant tout renvoi';",
      "}",
      "const file = { 'Nouveau devis (socle)': 'devis', 'Facture (socle)': 'factures', 'Proposition RDV (socle)': 'proposition', 'Véhicule prêt (socle)': 'atelier' }[String(wf.name || '').replace(/ — RECETTE fiabilisation$/, '')] || null;",
      "return [{ json: { p_incident: {",
      "  categorie, intervention_requise: intervention,",
      "  workflow_id: wf.id || null, workflow_nom: wf.name || null,",
      "  execution_id: exec.id ? String(exec.id) : null,",
      "  noeud: String(noeud), notification_file: file, notification_id: null,",
      "  message: expurger((conseil ? conseil + ' — ' : '') + brut, 300),",
      "} } }];",
    ].join("\n") } },
    {
      ...rpc(journaliser.name, v.urlJournal ? { ...v, supabaseUrl: v.urlJournal } : v, "journaliser_incident", "={{ JSON.stringify({ p_incident: $json.p_incident }) }}", journaliser.position),
      id: journaliser.id,
    },
  ];
  return {
    id: v.cle === "production" ? w.id : v.journaliseur,
    name: v.cle === "production" ? w.name : `${w.name} — RECETTE fiabilisation`,
    active: false,
    nodes,
    connections: { [declencheur.name]: { main: [[lien(extraire.name)]] }, [extraire.name]: { main: [[lien(journaliser.name)]] } },
    settings: { executionOrder: "v1", binaryMode: "separate", saveDataErrorExecution: "all", saveDataSuccessExecution: "all" },
    pinData: {},
    tags: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const v of [PRODUCTION, recette()].filter(Boolean)) {
    const dossier = resolve(ICI, v.cle);
    mkdirSync(dossier, { recursive: true });
    const ecrire = (nom, wf) => { writeFileSync(resolve(dossier, `${nom}.json`), JSON.stringify(wf, null, 2) + "\n"); console.log(`${v.cle}/${nom}.json  ${wf.id}  ${wf.nodes.length} nœuds`); };
    for (const nom of Object.keys(CADENCES)) ecrire(nom, construireSocle(nom, v));
    ecrire("journalisation-erreurs", construireJournaliseur(v));
  }
}
