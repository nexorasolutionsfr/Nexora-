// Construit les variantes du workflow « Relances de travaux différés » :
//   - test.json          : Supabase TEST, garage de recette seulement, transport
//                          SIMULÉ (un nœud Code qui n'envoie rien et le dit) ;
//   - production.json    : Supabase Production, SMTP Brevo, INACTIF ;
//   - recette-smtp.json  : la VRAIE chaîne de production (mêmes nœuds d'envoi et
//                          de classement), sur Supabase TEST, bornée à UN garage
//                          de recette, avec un identifiant SMTP qui vise le
//                          serveur contrôlé scripts/recette/smtp-controle.mjs.
//                          Construite seulement si RECETTE_SMTP_GARAGE est fourni.
//
// Un seul fichier source : les variantes ne divergent que sur l'URL, les
// identifiants, les garages, le déclencheur manuel (recette) et le transport.
// Aucune clé ici : les identifiants sont référencés par leur id n8n.
//
// À chaque passage :
//   1. `preparer_relances_travaux`  → obsolète / annule / prépare (à relire)
//   2. `reserver_relances_travaux`  → prend ce que le garage a AUTORISÉ
//   3. transport                    → issue CONNUE : `terminer_relance_travail`
//                                     issue INCERTAINE : on ne clôt rien
//
// L'EXPÉDITEUR
// Le même que le socle des envois (n8n/socle-envois/nouveau-devis.json, nœud
// « Construire le message ») : l'adresse Nexora vérifiée chez Brevo, le nom du
// garage en nom affiché, l'adresse du garage en Reply-To. Brevo réécrit
// l'adresse d'enveloppe mais laisse passer le nom et le Reply-To (prouvé le
// 8 septembre 2026 sur un message réellement reçu). Sans adresse de garage
// valide, pas de Reply-To : on n'en invente pas.
//
// L'ISSUE INCERTAINE NE SE REPREND PAS
// Un délai dépassé ou une connexion coupée APRÈS que le fournisseur a pu
// accepter le message ne dit pas si le client l'a reçu. La ligne reste
// `envoi_en_cours` ; `reserver_relances_travaux` ne la reprend jamais ; l'écran
// dit « Envoi à vérifier ». Le classement est dans classerEchec.js (testé).
//
// Le message vient de la base (sujet, texte, destinataire) : n8n n'en compose
// aucun. Contrat : docs/architecture/plan-n8n-2026-09-14.md.
//
// Usage : node n8n/relances-travaux/construire.mjs
//         RECETTE_SMTP_GARAGE=<uuid> node n8n/relances-travaux/construire.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const EXPEDITEUR_ADRESSE = "nexorasolutions.france@gmail.com";
const CLASSER_ECHEC = readFileSync(resolve(ICI, "classerEchec.js"), "utf8")
  .split("\n").filter((l) => !l.startsWith("if (typeof module")).join("\n");

const TEST_URL = "https://slawilafseganlbghgwx.supabase.co";
const RPC_RECETTE = { id: "BmVzKJSWPhAJ5V3Z", name: "RPC Supabase RECETTE (Test)" };

const VARIANTES = {
  test: {
    id: "relancestravauxtest0000001",
    nom: "Relances travaux différés (TEST — transport simulé)",
    supabaseUrl: TEST_URL,
    rpcCred: RPC_RECETTE,
    garages: ["31578a46-deba-4dd6-9487-7f2d876ec00f"],
    cron: "*/15 * * * *",
    manuel: true,
    transport: "simule",
  },
  production: {
    id: "relancestravauxprod0000001",
    nom: "Relances travaux différés (socle) — INACTIF",
    supabaseUrl: "https://omphppsmhmyllapdqevn.supabase.co",
    rpcCred: { id: "fk85N6k6Aea2u0fb", name: "RPC Supabase Production" },
    smtpCred: { id: "6opiCKNWBLDnvYKJ", name: "SMTP Brevo — envois métier" },
    garages: null,
    cron: "*/15 * * * *",
    manuel: false,
    transport: "smtp",
  },
};
if (process.env.RECETTE_SMTP_GARAGE) {
  if (!/^[0-9a-f-]{36}$/.test(process.env.RECETTE_SMTP_GARAGE)) throw new Error("RECETTE_SMTP_GARAGE : uuid attendu");
  VARIANTES["recette-smtp"] = {
    id: "relancestravauxsmtp0000001",
    nom: "Relances travaux différés (RECETTE — vraie variante, SMTP contrôlé)",
    supabaseUrl: TEST_URL,
    rpcCred: RPC_RECETTE,
    smtpCred: { id: "SmtpRecetteCtrl01", name: "SMTP recette contrôlé (aucun relais)" },
    garages: [process.env.RECETTE_SMTP_GARAGE],
    cron: "*/15 * * * *",
    manuel: true,
    transport: "smtp",
  };
}

function rpc(nom, v, fonction, corps, pos) {
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
      jsonBody: corps,
      options: {},
    },
    name: nom,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: pos,
    credentials: { httpCustomAuth: v.rpcCred },
    // Une réponse vide (rien à préparer, rien à réserver) n'arrête pas le flux.
    alwaysOutputData: true,
  };
}

const code = (nom, jsCode, pos) => ({ parameters: { jsCode }, name: nom, type: "n8n-nodes-base.code", typeVersion: 2, position: pos });

function construire(cle) {
  const v = VARIANTES[cle];
  const garagesJson = v.garages ? JSON.stringify(v.garages) : "null";
  const nodes = [
    { parameters: { rule: { interval: [{ field: "cronExpression", expression: v.cron }] } }, name: "Toutes les 15 minutes", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 300] },
    rpc("Préparer les relances", v, "preparer_relances_travaux", `{"p_garages": ${garagesJson}}`, [240, 300]),
    rpc("Réserver les relances autorisées", v, "reserver_relances_travaux", `{"p_limite": 10, "p_garages": ${garagesJson}}`, [480, 300]),
    // La réservation rend un tableau ; une réponse vide donne un élément sans
    // `id`, qu'on écarte avant la boucle.
    code("Garder les lignes réservées", "return $input.all().filter((i) => i.json && i.json.id);", [600, 300]),
    { parameters: { options: {} }, name: "Une relance à la fois", type: "n8n-nodes-base.splitInBatches", typeVersion: 3, position: [720, 300] },
  ];
  if (v.manuel) {
    nodes.push({ parameters: {}, name: "Lancer à la main (recette)", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 480] });
  }
  if (v.transport === "simule") {
    nodes.push(code("Transport simulé (recette)", [
      "// FAUX FOURNISSEUR — recette. N'envoie rien, ne contacte rien.",
      "// L'issue est pilotée par le destinataire, uniquement sur des boîtes .invalid :",
      "//   echec.transport@…     → échec CERTAIN avant envoi → à reprendre",
      "//   incertain.transport@… → issue INCERTAINE (accepté peut-être) → on ne clôt rien",
      "//   autre @….invalid      → accepté (simulé)",
      "// Tout destinataire hors .invalid est refusé : une erreur de jeu ne part jamais.",
      "const r = $('Une relance à la fois').item.json;",
      "const dest = String(r.destinataire || '').toLowerCase();",
      "if (!/@[a-z0-9.-]+\\.invalid$/.test(dest)) return [{ json: { id: r.id, resultat: 'bloque', motif: 'destinataire hors des boîtes de recette autorisées' } }];",
      "if (dest.startsWith('echec.transport@')) return [{ json: { id: r.id, resultat: 'a_reprendre', motif: 'échec certain avant envoi (simulé)' } }];",
      "if (dest.startsWith('incertain.transport@')) return [{ json: { id: r.id, resultat: 'incertain', motif: 'délai dépassé après acceptation possible (simulé)' } }];",
      "return [{ json: { id: r.id, resultat: 'envoye', motif: 'transport simulé (recette) : aucun message réel n\\'est parti' } }];",
    ].join("\n"), [960, 300]));
  } else {
    nodes.push(code("Composer l'expéditeur", [
      "// Même identité que le socle des envois : adresse Nexora vérifiée chez Brevo,",
      "// nom du garage affiché, adresse du garage en Reply-To (jamais inventée).",
      `const ADRESSE = ${JSON.stringify(EXPEDITEUR_ADRESSE)};`,
      "const r = $json;",
      "const nom = String(r.expediteur_nom || '').replace(/[\"\\\\<>\\r\\n]/g, ' ').replace(/\\s+/g, ' ').trim() || 'Votre garage';",
      "const repondreA = /^[^\\s@<>\"]+@[^\\s@<>\"]+\\.[^\\s@<>\"]+$/.test(String(r.repondre_a || '')) ? String(r.repondre_a) : '';",
      "return [{ json: { ...r, expediteur: `\"${nom}\" <${ADRESSE}>`, repondreA } }];",
    ].join("\n"), [840, 300]));
    nodes.push({
      parameters: {
        fromEmail: "={{ $json.expediteur }}",
        toEmail: "={{ $json.destinataire }}",
        subject: "={{ $json.sujet }}",
        emailFormat: "text",
        text: "={{ $json.texte }}",
        options: { appendAttribution: false, replyTo: "={{ $json.repondreA }}" },
      },
      name: "Envoyer la relance (email)",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2.1,
      position: [960, 300],
      credentials: { smtp: v.smtpCred },
      onError: "continueErrorOutput",
    });
    nodes.push(code("Accepté par le fournisseur", "const r = $('Une relance à la fois').item.json;\nreturn [{ json: { id: r.id, resultat: 'envoye', motif: null } }];", [1200, 200]));
    nodes.push(code("Classer l'échec", [
      CLASSER_ECHEC,
      "const r = $('Une relance à la fois').item.json;",
      "const brut = $json.error && typeof $json.error === 'object' ? $json.error : { message: $json.error || $json.message || '' };",
      "const c = classerEchec({ message: brut.message || $json.message || '', description: brut.description, code: brut.code || $json.code, responseCode: brut.responseCode ?? $json.responseCode, command: brut.command || $json.command });",
      "return [{ json: { id: r.id, resultat: c.resultat, motif: c.motif, erreur_brute: JSON.stringify($json).slice(0, 600) } }];",
    ].join("\n"), [1200, 400]));
  }
  nodes.push({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ id: "issue-connue", leftValue: "={{ $json.resultat }}", rightValue: "incertain", operator: { type: "string", operation: "notEquals" } }],
        combinator: "and",
      },
      options: {},
    },
    name: "Issue connue ?",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [1440, 300],
  });
  nodes.push(rpc("Clore la relance", v, "terminer_relance_travail",
    "={\"p_id\": \"{{ $json.id }}\", \"p_resultat\": \"{{ $json.resultat }}\", \"p_motif\": {{ $json.motif === null || $json.motif === undefined ? 'null' : JSON.stringify($json.motif) }}}",
    [1680, 220]));
  nodes.push({ parameters: {}, name: "Issue incertaine : rien n'est clos", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [1680, 420] });

  const connections = {
    "Toutes les 15 minutes": { main: [[{ node: "Préparer les relances", type: "main", index: 0 }]] },
    "Préparer les relances": { main: [[{ node: "Réserver les relances autorisées", type: "main", index: 0 }]] },
    "Réserver les relances autorisées": { main: [[{ node: "Garder les lignes réservées", type: "main", index: 0 }]] },
    "Garder les lignes réservées": { main: [[{ node: "Une relance à la fois", type: "main", index: 0 }]] },
    "Issue connue ?": { main: [[{ node: "Clore la relance", type: "main", index: 0 }], [{ node: "Issue incertaine : rien n'est clos", type: "main", index: 0 }]] },
    "Clore la relance": { main: [[{ node: "Une relance à la fois", type: "main", index: 0 }]] },
    "Issue incertaine : rien n'est clos": { main: [[{ node: "Une relance à la fois", type: "main", index: 0 }]] },
  };
  if (v.manuel) connections["Lancer à la main (recette)"] = { main: [[{ node: "Préparer les relances", type: "main", index: 0 }]] };
  if (v.transport === "simule") {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Transport simulé (recette)", type: "main", index: 0 }]] };
    connections["Transport simulé (recette)"] = { main: [[{ node: "Issue connue ?", type: "main", index: 0 }]] };
  } else {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Composer l'expéditeur", type: "main", index: 0 }]] };
    connections["Composer l'expéditeur"] = { main: [[{ node: "Envoyer la relance (email)", type: "main", index: 0 }]] };
    connections["Envoyer la relance (email)"] = { main: [[{ node: "Accepté par le fournisseur", type: "main", index: 0 }], [{ node: "Classer l'échec", type: "main", index: 0 }]] };
    connections["Accepté par le fournisseur"] = { main: [[{ node: "Issue connue ?", type: "main", index: 0 }]] };
    connections["Classer l'échec"] = { main: [[{ node: "Issue connue ?", type: "main", index: 0 }]] };
  }

  return {
    name: v.nom,
    nodes,
    connections,
    active: false,
    settings: { executionOrder: "v1", saveManualExecutions: true, saveDataErrorExecution: "all", saveDataSuccessExecution: "all" },
    id: v.id,
    meta: { instanceId: "" },
    tags: [],
  };
}

for (const cle of Object.keys(VARIANTES)) {
  const sortie = resolve(ICI, `${cle}.json`);
  writeFileSync(sortie, JSON.stringify(construire(cle), null, 2) + "\n");
  console.log(sortie);
}
