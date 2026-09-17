// Essai de la lecture automatique sur des corpus FICTIFS — base TEST uniquement.
//
//   node scripts/recette/factures/corpus.mjs <dossier-a>
//   node scripts/recette/factures/corpus-controle.mjs <dossier-b>
//   node scripts/recette/factures/lecture-essai.mjs <dossier-a> [<dossier-b> …] [--garder]
//
// Utilise la lecture configurée sur le serveur local : gratuite par défaut
// (texte des PDF), payante seulement si elle a été activée explicitement.
//
// Pour chaque dossier : compte de recette neuf, voiture, dépôt de chaque
// document avec les droits de ce compte, lecture par la VRAIE route
// /api/auto/documents/<id>/lecture, puis :
// - chaque champ comparé à attendus.json, en cinq classes :
//     extrait          présent sur le document et correctement proposé ;
//     manque           présent, mais non proposé ;
//     errone           présent, mais proposé avec une autre valeur ;
//     absence_correcte absent du document et laissé vide ;
//     invente          absent du document, mais une valeur est proposée ;
//   avec la certitude affichée ;
// - « à corriger » : champs que la personne devra modifier ;
// - attente entre le début du dépôt et la proposition ;
// - coût et facturation journalisés (auto_lectures) ;
// - une deuxième demande sur une facture déjà lue ne relance aucune lecture.
// Rapport : <dossier>/rapport-lecture.json. Sans --garder, comptes, fichiers
// et données sont supprimés ; le journal des lectures reste.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const SERVEUR = process.env.NEXORA_SERVEUR || "http://localhost:3114";
const TYPES_MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

function lireEnv() {
  const env = { ...process.env };
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const arguments_ = process.argv.slice(2);
const garder = arguments_.includes("--garder");
const dossiers = arguments_.filter((a) => a !== "--garder");
if (!dossiers.length) {
  console.error("Usage : node scripts/recette/factures/lecture-essai.mjs <dossier> [<dossier> …] [--garder]");
  process.exit(1);
}
const env = lireEnv();
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : la base n'est pas la base Test.");
  process.exit(1);
}
const configuration = await fetch(`${SERVEUR}/api/auto/lecture`).then((r) => r.json()).catch(() => null);
if (!configuration?.disponible) {
  console.error("Lecture automatique non disponible sur le serveur local.");
  process.exit(2);
}
console.log(`Lecture : ${configuration.externe ? "PAYANTE, prestataire extérieur" : "gratuite, sur le serveur"} — formats lus : ${configuration.formats.join(", ")}`);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { saisieDepuisProposition } = await import(new URL("../../../lib/auto/factures.js", import.meta.url));

const normaliserTexte = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const CHAMPS = [
  ["dateFacture", (a, b) => a === b],
  ["dateIntervention", (a, b) => a === b],
  ["professionnel", (a, b) => normaliserTexte(b).includes(normaliserTexte(a)) || normaliserTexte(a).includes(normaliserTexte(b))],
  ["immatriculation", (a, b) => a === b],
  ["kilometrage", (a, b) => a === b],
  ["montantTtc", (a, b) => Math.round(a * 100) === Math.round(b * 100)],
];

async function compteEtVoiture() {
  const email = `recette.lecture.${Date.now()}.${randomUUID().slice(0, 6)}@nexora-recette.invalid`;
  const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
  if (creation.error) throw creation.error;
  // Bêta privée (20260922001100) : le compte fictif est invité le temps de la recette.
  await admin.from("auto_acces_beta").upsert({ email: email.toLowerCase(), note: "recette automatique (Test)" });
  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error("Session de recette impossible.");
  const personne = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });
  const { data: vehiculeId, error } = await personne.rpc("auto_ajouter_vehicule", {
    p_marque: "Renault", p_modele: "Clio V", p_annee: 2019, p_energie: "diesel", p_immatriculation: "GH456JK",
    p_date_mise_en_circulation: "2019-05-02", p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  if (error) throw error;
  return { utilisateurId: creation.data.user.id, email, jeton, personne, vehiculeId };
}

const lire = (documentId, jeton) =>
  fetch(`${SERVEUR}/api/auto/documents/${documentId}/lecture`, { method: "POST", headers: { Authorization: `Bearer ${jeton}`, "content-type": "application/json" }, body: "{}" }).then((r) => r.json());

for (const dossier of dossiers) {
  const attendus = JSON.parse(readFileSync(join(dossier, "attendus.json"), "utf8"));
  const { utilisateurId, email, jeton, personne, vehiculeId } = await compteEtVoiture();
  const chemins = [];
  const documents = [];

  for (const attendu of attendus) {
    const extension = attendu.fichier.split(".").pop();
    const octets = readFileSync(join(dossier, attendu.fichier));
    const typeMime = TYPES_MIME[extension];
    const debut = Date.now();
    const chemin = `${utilisateurId}/${vehiculeId}/${randomUUID()}.${extension}`;
    const depot = await personne.storage.from("auto-documents").upload(chemin, octets, { contentType: typeMime });
    if (depot.error) throw depot.error;
    chemins.push(chemin);
    const { data: document, error } = await personne
      .from("auto_documents")
      .insert({ vehicule_id: vehiculeId, type: "facture", chemin, nom_fichier: attendu.fichier, type_mime: typeMime, taille_octets: octets.length, empreinte_sha256: createHash("sha256").update(octets).digest("hex") })
      .select("id")
      .single();
    if (error) throw error;
    const reponse = await lire(document.id, jeton);
    documents.push({ attendu, documentId: document.id, reponse, attenteMs: Date.now() - debut });
  }

  // Une facture déjà lue : aucune nouvelle lecture.
  const dejaLue = documents.find((d) => d.reponse.etat === "proposee");
  let relecture = null;
  if (dejaLue) {
    const avant = (await admin.from("auto_lectures").select("id").eq("document_id", dejaLue.documentId)).data.length;
    const seconde = await lire(dejaLue.documentId, jeton);
    const apres = (await admin.from("auto_lectures").select("id").eq("document_id", dejaLue.documentId)).data.length;
    relecture = { fichier: dejaLue.attendu.fichier, reprise: seconde.reprise === true, lecturesAvant: avant, lecturesApres: apres, ok: seconde.reprise === true && avant === apres };
  }

  const { data: lectures } = await admin
    .from("auto_lectures")
    .select("document_id, fournisseur, modele, statut, facturation, tokens_entree, tokens_sortie, cout_estime_micro_usd, cout_reserve_micro_usd, duree_ms, erreur")
    .in("document_id", documents.map((d) => d.documentId));

  const bilan = { documents: documents.length, proposees: 0, nonLus: {}, champs: {}, aCorrigerTotal: 0, inventes: [], typePrincipal: { justes: 0, total: 0 }, revisionInventee: [], nonFactureReconnu: [], scanReconnu: [] };
  for (const [nom] of CHAMPS) bilan.champs[nom] = { presents: 0, extrait: 0, manque: 0, errone: 0, absence_correcte: 0, invente: 0 };
  bilan.total = { presents: 0, extrait: 0, manque: 0, errone: 0, absence_correcte: 0, invente: 0 };

  for (const d of documents) {
    const { attendu, reponse } = d;
    const journal = lectures.find((l) => l.document_id === d.documentId);
    d.lecture = journal ? { fournisseur: journal.fournisseur, statut: journal.statut, facturation: journal.facturation, dureeMs: journal.duree_ms, coutUsd: (journal.cout_estime_micro_usd ?? 0) / 1e6, jetons: [journal.tokens_entree, journal.tokens_sortie] } : null;
    d.champs = {};
    d.aCorriger = 0;
    if (attendu.scan) {
      bilan.scanReconnu.push(`${attendu.fichier} : ${reponse.etat}/${reponse.raison ?? ""}`);
      continue;
    }
    if (reponse.etat !== "proposee") {
      const cle = `${reponse.etat}${reponse.raison ? `:${reponse.raison}` : ""}`;
      bilan.nonLus[cle] = (bilan.nonLus[cle] ?? 0) + 1;
      continue;
    }
    bilan.proposees++;
    const p = reponse.proposition;
    if (attendu.estFacture === false) {
      bilan.nonFactureReconnu.push(`${attendu.fichier} : ${p.estFacture === false ? "reconnu" : "NON reconnu"}`);
      continue;
    }
    for (const [nom, egal] of CHAMPS) {
      const valeurAttendue = attendu[nom];
      const lu = p.champs[nom];
      let issue;
      if (valeurAttendue == null) issue = lu.valeur == null ? "absence_correcte" : "invente";
      else if (lu.valeur == null) issue = "manque";
      else issue = egal(valeurAttendue, lu.valeur) ? "extrait" : "errone";
      bilan.champs[nom][issue]++;
      bilan.total[issue]++;
      if (valeurAttendue != null) {
        bilan.champs[nom].presents++;
        bilan.total.presents++;
      }
      d.champs[nom] = { issue, lu: lu.valeur, certitude: lu.certitude, attendu: valeurAttendue ?? null };
      if (issue === "manque" || issue === "errone" || issue === "invente") d.aCorriger++;
      if (issue === "invente") bilan.inventes.push(`${attendu.fichier} ${nom}=${lu.valeur}`);
    }
    const type = saisieDepuisProposition(p).saisie.type;
    if (attendu.typePrincipal) {
      bilan.typePrincipal.total++;
      if (type === attendu.typePrincipal) bilan.typePrincipal.justes++;
      else d.aCorriger++;
      if (type === "revision" && attendu.typePrincipal !== "revision") bilan.revisionInventee.push(attendu.fichier);
    }
    d.typePrincipal = { lu: type, attendu: attendu.typePrincipal };
    d.operations = p.operations.map((o) => `${o.type}:${o.libelle}`);
    bilan.aCorrigerTotal += d.aCorriger;
  }

  const lues = lectures.filter((l) => l.statut === "reussie");
  bilan.couts = {
    lecturesJournalisees: lectures.length,
    facturees: lectures.filter((l) => l.facturation === "facturee").length,
    coutEstimeUsd: lectures.reduce((s, l) => s + (l.cout_estime_micro_usd ?? (l.facturation === "non_facturee" ? 0 : l.cout_reserve_micro_usd)), 0) / 1e6,
    dureeLectureMoyenneMs: lues.length ? Math.round(lues.reduce((s, l) => s + (l.duree_ms ?? 0), 0) / lues.length) : null,
    attenteMoyenneMs: Math.round(documents.reduce((s, d) => s + d.attenteMs, 0) / documents.length),
  };
  bilan.relecture = relecture;

  const rapport = {
    dossier,
    date: new Date().toISOString(),
    lecture: configuration,
    bilan,
    documents: documents.map(({ attendu, reponse, attenteMs, lecture, champs, aCorriger, typePrincipal, operations }) => ({ fichier: attendu.fichier, etat: reponse.etat, raison: reponse.raison ?? null, attenteMs, lecture, champs, aCorriger, typePrincipal, operations })),
  };
  writeFileSync(join(dossier, "rapport-lecture.json"), JSON.stringify(rapport, null, 2));

  console.log(`\n=== ${dossier.split("/").pop()} ===`);
  for (const d of rapport.documents) {
    const champs = Object.entries(d.champs).map(([n, c]) => `${n}:${c.issue}${["manque", "errone", "invente"].includes(c.issue) ? `(${c.lu ?? "∅"}≠${c.attendu ?? "∅"})` : ""}`).join(" ");
    console.log(`${d.fichier.padEnd(14)} ${d.etat}${d.raison ? `/${d.raison}` : ""} · ${d.attenteMs} ms · à corriger ${d.aCorriger}${champs ? ` · ${champs}` : ""}${d.typePrincipal ? ` · type ${d.typePrincipal.lu}${d.typePrincipal.lu !== d.typePrincipal.attendu ? `≠${d.typePrincipal.attendu}` : ""}` : ""}`);
  }
  console.log(JSON.stringify(bilan, null, 2));

  if (!garder) {
    await admin.storage.from("auto-documents").remove(chemins);
    await admin.from("auto_acces_beta").delete().eq("email", email.toLowerCase());
    await admin.auth.admin.deleteUser(utilisateurId);
  }
}
if (!garder) console.log("\nComptes de recette, fichiers et données supprimés ; le journal des lectures est conservé.");
