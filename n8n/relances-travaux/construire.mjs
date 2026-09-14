// Construit les deux variantes du workflow « Relances de travaux différés » :
//   - test.json       : Supabase TEST, garage de recette seulement, transport
//                       SIMULÉ (un nœud Code qui n'envoie rien et le dit) ;
//   - production.json : Supabase Production, SMTP Brevo, INACTIF.
//
// Un seul fichier source : les deux variantes ne divergent que sur l'URL, les
// identifiants, les garages, le déclencheur manuel (Test) et le transport.
// Aucune clé ici : les identifiants sont référencés par leur id n8n.
//
// À chaque passage :
//   1. `preparer_relances_travaux`  → obsolète / annule / prépare (à relire)
//   2. `reserver_relances_travaux`  → prend ce que le garage a AUTORISÉ
//   3. transport                    → issue CONNUE : `terminer_relance_travail`
//                                     issue INCERTAINE : on ne clôt rien
//
// L'ISSUE INCERTAINE NE SE REPREND PAS
// Un délai dépassé ou une connexion coupée APRÈS que le fournisseur a pu
// accepter le message ne dit pas si le client l'a reçu. La ligne reste
// `envoi_en_cours` ; `reserver_relances_travaux` ne la reprend jamais ; l'écran
// dit « Envoi à vérifier ». Seul un échec CERTAIN avant l'envoi repasse
// `a_reprendre` (borné à 3 tentatives côté base).
//
// Le message vient de la base (sujet, texte, destinataire) : n8n n'en compose
// aucun. Contrat : docs/architecture/plan-n8n-2026-09-14.md.
//
// Usage : node n8n/relances-travaux/construire.mjs
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));

const VARIANTES = {
  test: {
    id: "relancestravauxtest0000001",
    nom: "Relances travaux différés (TEST — transport simulé)",
    supabaseUrl: "https://slawilafseganlbghgwx.supabase.co",
    rpcCred: { id: "BmVzKJSWPhAJ5V3Z", name: "RPC Supabase RECETTE (Test)" },
    garages: ["31578a46-deba-4dd6-9487-7f2d876ec00f"],
    cron: "*/15 * * * *",
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
    transport: "smtp",
  },
};

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
  if (cle === "test") {
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
    nodes.push({
      parameters: {
        fromEmail: "={{ $json.repondre_a }}",
        toEmail: "={{ $json.destinataire }}",
        subject: "={{ $json.sujet }}",
        emailFormat: "text",
        text: "={{ $json.texte }}",
        options: { appendAttribution: false, replyTo: "={{ $json.repondre_a }}" },
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
      "// Un échec n'est CERTAIN que si le fournisseur a refusé avant d'accepter le",
      "// message. Tout le reste (délai, connexion coupée, erreur inconnue) est",
      "// INCERTAIN : le message a pu partir, on ne le rejoue pas.",
      "const r = $('Une relance à la fois').item.json;",
      "const m = String(($json.error && ($json.error.message || $json.error)) || $json.message || '');",
      "if (/\\b5\\d\\d\\b/.test(m)) return [{ json: { id: r.id, resultat: 'bloque', motif: 'refus définitif du fournisseur : ' + m.slice(0, 200) } }];",
      "if (/ECONNREFUSED|ENOTFOUND|EAUTH|Invalid login|\\b4\\d\\d\\b/i.test(m)) return [{ json: { id: r.id, resultat: 'a_reprendre', motif: 'échec certain avant envoi : ' + m.slice(0, 200) } }];",
      "return [{ json: { id: r.id, resultat: 'incertain', motif: 'issue inconnue : ' + m.slice(0, 200) } }];",
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
  if (cle === "test") connections["Lancer à la main (recette)"] = { main: [[{ node: "Préparer les relances", type: "main", index: 0 }]] };
  if (v.transport === "simule") {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Transport simulé (recette)", type: "main", index: 0 }]] };
    connections["Transport simulé (recette)"] = { main: [[{ node: "Issue connue ?", type: "main", index: 0 }]] };
  } else {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Envoyer la relance (email)", type: "main", index: 0 }]] };
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
