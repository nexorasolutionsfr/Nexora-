// Construit les deux variantes du workflow « Relances de travaux différés » :
//   - test.json       : Supabase TEST, garages de recette seulement, transport
//                       SIMULÉ (un nœud Code qui n'envoie rien et le dit) ;
//   - production.json : Supabase Production, SMTP Brevo, INACTIF.
//
// Un seul fichier source, pour que les deux variantes ne divergent que sur ce
// qui doit diverger : URL, identifiants, garages, transport. Les identifiants
// sont référencés par leur id n8n ; aucune clé ici.
//
// Ce que fait le workflow, à chaque passage :
//   1. `preparer_relances_travaux`  → obsolète / annule / prépare (à_relire)
//   2. `reserver_relances_travaux`  → prend ce qui a été AUTORISÉ par le garage
//   3. transport (simulé ou SMTP)   → `terminer_relance_travail` envoyé / bloqué / à reprendre
//
// Le message vient de la base (sujet, texte, destinataire) : n8n n'en compose
// aucun. C'est le contrat retenu dans docs/architecture/plan-n8n-2026-09-14.md.
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
    // Bornée au garage de recette : jamais tous les garages de Test.
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
  };
}

function construire(cle) {
  const v = VARIANTES[cle];
  const garagesJson = v.garages ? JSON.stringify(v.garages) : "null";
  const nodes = [
    { parameters: { rule: { interval: [{ field: "cronExpression", expression: v.cron }] } }, name: "Toutes les 15 minutes", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 300] },
    rpc("Préparer les relances", v, "preparer_relances_travaux", `{"p_garages": ${garagesJson}}`, [240, 300]),
    // Le résultat de la préparation n'est pas consommé : il est journalisé
    // dans l'exécution. On enchaîne toujours, même s'il est vide.
    rpc("Réserver les relances autorisées", v, "reserver_relances_travaux", `{"p_limite": 10, "p_garages": ${garagesJson}}`, [480, 300]),
    { parameters: { options: {} }, name: "Une relance à la fois", type: "n8n-nodes-base.splitInBatches", typeVersion: 3, position: [720, 300] },
  ];
  if (v.transport === "simule") {
    nodes.push({
      parameters: {
        jsCode: [
          "// FAUX FOURNISSEUR — recette. N'envoie rien, ne contacte rien.",
          "// Refuse tout destinataire hors des boîtes de recette (.invalid),",
          "// pour qu'une erreur de jeu ne parte jamais vers une vraie adresse.",
          "const r = $('Une relance à la fois').item.json;",
          "const dest = String(r.destinataire || '');",
          "if (!/@[a-z0-9.-]+\\.invalid$/i.test(dest)) {",
          "  return [{ json: { id: r.id, resultat: 'bloque', motif: 'destinataire hors des boîtes de recette autorisées' } }];",
          "}",
          "return [{ json: { id: r.id, resultat: 'envoye', motif: 'transport simulé (recette) : aucun message réel n\\'est parti', sujet: r.sujet, apercu: String(r.texte).slice(0, 120) } }];",
        ].join("\n"),
      },
      name: "Transport simulé (recette)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 300],
    });
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
      // Un refus du fournisseur ne doit pas planter l'exécution : il se clôt
      // « à reprendre », borné par tentatives < 3 côté base.
      onError: "continueErrorOutput",
    });
    nodes.push({
      parameters: { jsCode: "const r = $('Une relance à la fois').item.json;\nreturn [{ json: { id: r.id, resultat: 'envoye', motif: null } }];" },
      name: "Accepté par le fournisseur",
      type: "n8n-nodes-base.code", typeVersion: 2, position: [1200, 200],
    });
    nodes.push({
      parameters: { jsCode: "const r = $('Une relance à la fois').item.json;\nreturn [{ json: { id: r.id, resultat: 'a_reprendre', motif: 'refus du fournisseur d\\'envoi' } }];" },
      name: "Refusé par le fournisseur",
      type: "n8n-nodes-base.code", typeVersion: 2, position: [1200, 400],
    });
  }
  nodes.push(rpc("Clore la relance", v, "terminer_relance_travail",
    "={\"p_id\": \"{{ $json.id }}\", \"p_resultat\": \"{{ $json.resultat }}\", \"p_motif\": {{ $json.motif === null || $json.motif === undefined ? 'null' : JSON.stringify($json.motif) }}}",
    [1440, 300]));

  const connections = {
    "Toutes les 15 minutes": { main: [[{ node: "Préparer les relances", type: "main", index: 0 }]] },
    "Préparer les relances": { main: [[{ node: "Réserver les relances autorisées", type: "main", index: 0 }]] },
    "Réserver les relances autorisées": { main: [[{ node: "Une relance à la fois", type: "main", index: 0 }]] },
  };
  if (v.transport === "simule") {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Transport simulé (recette)", type: "main", index: 0 }]] };
    connections["Transport simulé (recette)"] = { main: [[{ node: "Clore la relance", type: "main", index: 0 }]] };
  } else {
    connections["Une relance à la fois"] = { main: [[], [{ node: "Envoyer la relance (email)", type: "main", index: 0 }]] };
    connections["Envoyer la relance (email)"] = { main: [[{ node: "Accepté par le fournisseur", type: "main", index: 0 }], [{ node: "Refusé par le fournisseur", type: "main", index: 0 }]] };
    connections["Accepté par le fournisseur"] = { main: [[{ node: "Clore la relance", type: "main", index: 0 }]] };
    connections["Refusé par le fournisseur"] = { main: [[{ node: "Clore la relance", type: "main", index: 0 }]] };
  }
  // La boucle : après la clôture, on repasse au lot suivant.
  connections["Clore la relance"] = { main: [[{ node: "Une relance à la fois", type: "main", index: 0 }]] };

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
