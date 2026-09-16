// Essai de la lecture automatique sur le corpus FICTIF — base TEST uniquement.
//
//   node scripts/recette/factures/corpus.mjs <dossier>
//   node scripts/recette/factures/lecture-essai.mjs <dossier> [--garder]
//
// Prérequis (côté serveur, jamais dans le dépôt) : ANTHROPIC_API_KEY et
// AUTO_LECTURE_BUDGET_USD dans .env.local, serveur local redémarré. Pour lire
// les 13 documents d'un coup : AUTO_LECTURE_QUOTA_24H=20.
//
// Déroulé : compte de recette neuf, voiture Renault Clio V, dépôt de chaque
// document avec les droits de ce compte, lecture par la VRAIE route
// /api/auto/documents/<id>/lecture, comparaison aux valeurs attendues
// (attendus.json), relevé du coût estimé journalisé (auto_lectures). Rapport
// dans <dossier>/rapport-lecture.json. Sans --garder, le compte, ses fichiers
// et ses données sont supprimés ; le journal des coûts reste (budget).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const SERVEUR = process.env.NEXORA_SERVEUR || "http://localhost:3114";

function lireEnv() {
  const env = { ...process.env };
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const [dossier, option] = process.argv.slice(2);
if (!dossier) {
  console.error("Usage : node scripts/recette/factures/lecture-essai.mjs <dossier du corpus> [--garder]");
  process.exit(1);
}
const env = lireEnv();
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : la base n'est pas la base Test.");
  process.exit(1);
}

const etat = await fetch(`${SERVEUR}/api/auto/lecture`).then((r) => r.json()).catch(() => null);
if (!etat?.disponible) {
  console.error("Lecture automatique non activée sur le serveur local : ANTHROPIC_API_KEY et AUTO_LECTURE_BUDGET_USD dans .env.local, puis redémarrer le serveur.");
  process.exit(2);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const attendus = JSON.parse(readFileSync(join(dossier, "attendus.json"), "utf8"));

// Compte neuf et session.
const email = `recette.lecture.${Date.now()}@nexora-recette.invalid`;
const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
if (creation.error) throw creation.error;
const utilisateurId = creation.data.user.id;
const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
if (!jeton) throw new Error("Session de recette impossible.");
const personne = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${jeton}` } },
  auth: { persistSession: false },
});

const { data: vehiculeId, error: erreurVehicule } = await personne.rpc("auto_ajouter_vehicule", {
  p_marque: "Renault", p_modele: "Clio V", p_annee: 2019, p_energie: "diesel", p_immatriculation: "GH456JK",
  p_date_mise_en_circulation: "2019-05-02", p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
});
if (erreurVehicule) throw erreurVehicule;

const TYPES_MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };
const resultats = [];
const chemins = [];

for (const attendu of attendus) {
  const octets = readFileSync(join(dossier, attendu.fichier));
  const typeMime = TYPES_MIME[attendu.fichier.split(".").pop()];
  const chemin = `${utilisateurId}/${vehiculeId}/${crypto.randomUUID()}.${attendu.fichier.split(".").pop()}`;
  const depot = await personne.storage.from("auto-documents").upload(chemin, octets, { contentType: typeMime });
  if (depot.error) throw depot.error;
  chemins.push(chemin);
  const { data: document, error } = await personne
    .from("auto_documents")
    .insert({ vehicule_id: vehiculeId, type: "facture", chemin, nom_fichier: attendu.fichier, type_mime: typeMime, taille_octets: octets.length, empreinte_sha256: createHash("sha256").update(octets).digest("hex") })
    .select("id")
    .single();
  if (error) throw error;

  const debut = Date.now();
  const reponse = await fetch(`${SERVEUR}/api/auto/documents/${document.id}/lecture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  resultats.push({ attendu, documentId: document.id, reponse, dureeTotaleMs: Date.now() - debut });
  console.log(`${attendu.fichier} : ${reponse.etat}${reponse.raison ? ` (${reponse.raison})` : ""}`);
}

// Comparaison champ par champ. « Inventé » : une valeur proposée là où le document n'en a pas.
const normaliserTexte = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const CHAMPS = [
  ["dateFacture", "dateFacture", (a, b) => a === b],
  ["dateIntervention", "dateIntervention", (a, b) => a === b],
  ["professionnel", "professionnel", (a, b) => normaliserTexte(b).includes(normaliserTexte(a)) || normaliserTexte(a).includes(normaliserTexte(b))],
  ["immatriculation", "immatriculation", (a, b) => a === b],
  ["kilometrage", "kilometrage", (a, b) => a === b],
  ["montantTtc", "montantTtc", (a, b) => Math.round(a * 100) === Math.round(b * 100)],
];
const bilan = { documents: resultats.length, proposees: 0, champs: {}, inventes: [], typesPrincipaux: { justes: 0, total: 0 }, revisionInventee: [], nonFacture: null };
for (const [nom] of CHAMPS) bilan.champs[nom] = { justes: 0, faux: 0, manques: 0, inventes: 0, incertainsParmiFaux: 0 };

const { saisieDepuisProposition } = await import(new URL("../../../lib/auto/factures.js", import.meta.url));
for (const r of resultats) {
  if (r.reponse.etat !== "proposee") continue;
  bilan.proposees++;
  const p = r.reponse.proposition;
  r.ecarts = [];
  for (const [nom, cle, egal] of CHAMPS) {
    const attenduValeur = r.attendu[cle];
    const lu = p.champs[nom];
    const b = bilan.champs[nom];
    if (attenduValeur == null) {
      if (lu.valeur != null) {
        b.inventes++;
        bilan.inventes.push(`${r.attendu.fichier} ${nom}=${lu.valeur}`);
        r.ecarts.push(`${nom} inventé (${lu.valeur})`);
      }
    } else if (lu.valeur == null) {
      b.manques++;
      r.ecarts.push(`${nom} manquant`);
    } else if (egal(attenduValeur, lu.valeur)) {
      b.justes++;
    } else {
      b.faux++;
      if (lu.certitude === "incertaine") b.incertainsParmiFaux++;
      r.ecarts.push(`${nom} : ${lu.valeur} au lieu de ${attenduValeur} (${lu.certitude})`);
    }
  }
  if (r.attendu.typePrincipal) {
    const { saisie } = saisieDepuisProposition(p);
    bilan.typesPrincipaux.total++;
    if (saisie.type === r.attendu.typePrincipal) bilan.typesPrincipaux.justes++;
    else r.ecarts.push(`type principal : ${saisie.type} au lieu de ${r.attendu.typePrincipal}`);
    if (saisie.type === "revision" && r.attendu.typePrincipal !== "revision") bilan.revisionInventee.push(r.attendu.fichier);
  }
  if (r.attendu.estFacture === false) bilan.nonFacture = p.estFacture === false ? "reconnu" : "non reconnu";
}

// Coûts journalisés.
const ids = resultats.map((r) => r.documentId);
const { data: lectures } = await admin
  .from("auto_lectures")
  .select("document_id, statut, facturation, tokens_entree, tokens_sortie, cout_estime_micro_usd, cout_reserve_micro_usd, duree_ms, erreur")
  .in("document_id", ids);
const couts = {
  lectures: lectures.length,
  facturees: lectures.filter((l) => l.facturation === "facturee").length,
  inconnues: lectures.filter((l) => l.facturation === "inconnue").length,
  tokensEntree: lectures.reduce((s, l) => s + (l.tokens_entree ?? 0), 0),
  tokensSortie: lectures.reduce((s, l) => s + (l.tokens_sortie ?? 0), 0),
  coutEstimeUsd: lectures.reduce((s, l) => s + (l.cout_estime_micro_usd ?? (l.facturation === "non_facturee" ? 0 : l.cout_reserve_micro_usd)), 0) / 1e6,
  dureeMoyenneMs: Math.round(lectures.reduce((s, l) => s + (l.duree_ms ?? 0), 0) / Math.max(1, lectures.length)),
};
couts.coutMoyenParDocumentUsd = couts.coutEstimeUsd / Math.max(1, lectures.length);
for (const r of resultats) {
  const l = lectures.find((x) => x.document_id === r.documentId);
  r.cout = l ? { tokensEntree: l.tokens_entree, tokensSortie: l.tokens_sortie, usd: (l.cout_estime_micro_usd ?? 0) / 1e6, dureeMs: l.duree_ms } : null;
}

const rapport = { date: new Date().toISOString(), modele: resultats.find((r) => r.reponse.proposition)?.reponse.proposition.modele ?? null, bilan, couts, documents: resultats.map(({ attendu, reponse, ecarts, cout }) => ({ fichier: attendu.fichier, etat: reponse.etat, raison: reponse.raison ?? null, ecarts: ecarts ?? [], cout })) };
writeFileSync(join(dossier, "rapport-lecture.json"), JSON.stringify(rapport, null, 2));
console.log(JSON.stringify({ bilan, couts }, null, 2));

if (option !== "--garder") {
  await admin.storage.from("auto-documents").remove(chemins);
  await admin.auth.admin.deleteUser(utilisateurId);
  console.log("Compte de recette, fichiers et données supprimés ; le journal des coûts est conservé.");
}
