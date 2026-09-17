// Accès croisés entre deux comptes Nexora Auto — base TEST uniquement.
//
//   node scripts/recette/acces-croises.mjs [http://localhost:3114]
//
// Deux comptes fictifs (.invalid, sans e-mail) : Alice remplit un dossier
// (voiture, relevé, intervention, document et son fichier, tâche, report,
// lecture), Bruno tente de le lire, le modifier, le supprimer, d'y écrire, de
// s'en servir par les fonctions en base, par le stockage privé et par la
// route de lecture. Un visiteur sans session aussi. Chaque tentative doit
// échouer ou ne rien rendre ; le dossier d'Alice doit rester intact.
// Les deux comptes et leurs fichiers sont supprimés à la fin.
// Refus de démarrer hors de la base Test.

import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const SERVEUR = process.argv[2] || null;
const env = { ...process.env };
for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
  const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMPARTIMENT = "auto-documents";

const resultats = [];
const verifier = (nom, ok, detail = "") => resultats.push({ nom, ok: Boolean(ok), detail });
const comptes = [];

async function compte(prenom) {
  const email = `recette.acces.${prenom}.${Date.now()}@nexora-recette.invalid`;
  const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
  if (creation.error) throw creation.error;
  comptes.push(creation.data.user.id);
  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error("Session de recette impossible.");
  const client = createClient(URL_BASE, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });
  return { id: creation.data.user.id, jeton, client };
}

const lignes = async (requete) => {
  const r = await requete;
  return r.error ? { erreur: r.error.code || r.error.message, n: 0 } : { erreur: null, n: Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0 };
};

try {
  const alice = await compte("alice");
  const bruno = await compte("bruno");
  const visiteur = createClient(URL_BASE, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  // --- Le dossier d'Alice, par l'API avec ses droits ---
  const a = alice.client;
  const { data: vehiculeId, error: e1 } = await a.rpc("auto_ajouter_vehicule", { p_marque: "Peugeot", p_modele: "308 fictive", p_annee: 2018 });
  if (e1) throw e1;
  const releve = (await a.from("auto_releves_km").insert({ vehicule_id: vehiculeId, kilometrage: 91000, releve_le: "2026-09-01" }).select("id").single()).data;
  const intervention = (await a.from("auto_historique").insert({ vehicule_id: vehiculeId, type: "vidange", realise_le: "2026-08-01", montant_ttc: 99 }).select("id").single()).data;
  const octets = new TextEncoder().encode(`%PDF-1.4\n% facture fictive ${randomUUID()}\n%%EOF`);
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const chemin = `${alice.id}/${vehiculeId}/${randomUUID()}.pdf`;
  const depot = await a.storage.from(COMPARTIMENT).upload(chemin, octets, { contentType: "application/pdf" });
  if (depot.error) throw depot.error;
  const documentA = (await a.from("auto_documents").insert({ vehicule_id: vehiculeId, type: "facture", chemin, nom_fichier: "facture.pdf", type_mime: "application/pdf", taille_octets: octets.length, empreinte_sha256: empreinte }).select("id").single()).data;
  const tache = (await a.from("auto_taches").insert({ vehicule_id: vehiculeId, titre: "Tâche fictive" }).select("id").single()).data;
  await a.from("auto_rappels_reports").insert({ proprietaire_id: alice.id, cle: `revision:${vehiculeId}:a_completer:intervalle_a_renseigner`, reporte_jusqu_au: "2026-12-01" });
  if (!releve || !intervention || !documentA || !tache) throw new Error("Dossier d'Alice incomplet.");

  // --- Témoins : Alice, elle, retrouve et ouvre son dossier (sinon les refus ci-dessous ne prouveraient rien) ---
  verifier("Témoin : Alice retrouve son fichier par son empreinte", (await lignes(a.from("auto_documents").select("id").eq("empreinte_sha256", empreinte))).n === 1);
  verifier("Témoin : Alice obtient une adresse signée pour son fichier", !(await a.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60)).error);

  // --- Limites du compartiment, côté serveur ---
  const dossierA = `${alice.id}/${vehiculeId}`;
  const html = await a.storage.from(COMPARTIMENT).upload(`${dossierA}/${randomUUID()}.pdf`, new TextEncoder().encode("<html></html>"), { contentType: "text/html" });
  verifier("Stockage : un type non accepté (text/html) est refusé", html.error, html.error?.message);
  const gros = await a.storage.from(COMPARTIMENT).upload(`${dossierA}/${randomUUID()}.pdf`, new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "application/pdf" });
  verifier("Stockage : un fichier de plus de 10 Mo est refusé", gros.error, gros.error?.message);
  // Limite connue : le stockage croit le type annoncé ; le contenu est vérifié à l'écran et avant toute lecture.
  const annonce = await a.storage.from(COMPARTIMENT).upload(`${dossierA}/${randomUUID()}.pdf`, new TextEncoder().encode('{"faux":"pdf"}'), { contentType: "application/pdf" });
  verifier(`Stockage : contenu non contrôlé par le compartiment (limite connue, ${annonce.error ? "refusé" : "accepté"})`, true);

  // --- Bruno : lire ---
  const b = bruno.client;
  for (const [table, id] of [["auto_vehicules", vehiculeId], ["auto_releves_km", releve.id], ["auto_historique", intervention.id], ["auto_documents", documentA.id], ["auto_taches", tache.id]]) {
    const r = await lignes(b.from(table).select("id").eq("id", id));
    verifier(`Bruno ne lit pas ${table} d'Alice`, r.n === 0, JSON.stringify(r));
  }
  verifier("Bruno ne retrouve pas le fichier d'Alice par son empreinte", (await lignes(b.from("auto_documents").select("id").eq("empreinte_sha256", empreinte))).n === 0);
  verifier("Bruno ne voit aucun report d'Alice", (await lignes(b.from("auto_rappels_reports").select("cle").eq("proprietaire_id", alice.id))).n === 0);

  // --- Bruno : modifier et supprimer ---
  for (const [table, id, valeurs] of [
    ["auto_vehicules", vehiculeId, { marque: "Intrus" }],
    ["auto_releves_km", releve.id, { kilometrage: 1 }],
    ["auto_historique", intervention.id, { montant_ttc: 1 }],
    ["auto_documents", documentA.id, { titre: "Intrus", historique_id: null }],
    ["auto_taches", tache.id, { titre: "Intrus" }],
  ]) {
    const maj = await lignes(b.from(table).update(valeurs).eq("id", id).select("id"));
    verifier(`Bruno ne modifie pas ${table} d'Alice`, maj.n === 0, JSON.stringify(maj));
    const suppr = await lignes(b.from(table).delete().eq("id", id).select("id"));
    verifier(`Bruno ne supprime pas ${table} d'Alice`, suppr.n === 0, JSON.stringify(suppr));
  }

  // --- Bruno : écrire dans le dossier d'Alice ---
  verifier("Bruno n'ajoute pas de relevé à la voiture d'Alice", (await b.from("auto_releves_km").insert({ vehicule_id: vehiculeId, kilometrage: 5, releve_le: "2026-09-02" })).error);
  verifier("Bruno n'ajoute pas d'intervention à la voiture d'Alice", (await b.from("auto_historique").insert({ vehicule_id: vehiculeId, type: "autre", realise_le: "2026-09-02" })).error);
  verifier("Bruno n'ajoute pas de tâche à la voiture d'Alice", (await b.from("auto_taches").insert({ vehicule_id: vehiculeId, titre: "Intrus" })).error);
  verifier("Bruno ne se donne pas la voiture d'Alice", (await b.from("auto_vehicules").insert({ proprietaire_id: alice.id, marque: "X", modele: "Y" })).error);

  // --- Bruno : fonctions en base ---
  const facture = await b.rpc("auto_enregistrer_facture", { p_document_id: documentA.id, p_rattacher_a: null, p_realise_le: "2026-08-01", p_date_facture: null, p_type: "vidange", p_operations: null, p_prestataire: null, p_kilometrage: null, p_montant_ttc: 99, p_libelle: null });
  verifier("Bruno ne confirme pas la facture d'Alice", facture.error && /auto_document_introuvable/.test(facture.error.message), facture.error?.message);
  const principal = await b.rpc("auto_definir_principal", { p_vehicule_id: vehiculeId });
  verifier("Bruno ne rend pas principale la voiture d'Alice", principal.error, principal.error?.message);
  const archive = await b.rpc("auto_archiver_vehicule", { p_vehicule_id: vehiculeId, p_archiver: true });
  verifier("Bruno n'archive pas la voiture d'Alice", archive.error, archive.error?.message);
  const reserve = await b.rpc("auto_lecture_reserver", { p_proprietaire_id: bruno.id, p_document_id: documentA.id, p_fournisseur: "texte_pdf", p_modele: "x", p_cout_reserve_micro_usd: 0, p_budget_micro_usd: 0, p_tentatives_max: 2, p_lectures_24h_max: 10 });
  verifier("Bruno n'appelle pas la réservation de lecture (serveur seulement)", reserve.error, reserve.error?.code);

  // --- Bruno : stockage privé ---
  verifier("Bruno ne télécharge pas le fichier d'Alice", (await b.storage.from(COMPARTIMENT).download(chemin)).error);
  verifier("Bruno n'obtient pas d'adresse signée pour le fichier d'Alice", (await b.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60)).error);
  const liste = await b.storage.from(COMPARTIMENT).list(`${alice.id}/${vehiculeId}`);
  verifier("Bruno ne liste pas le dossier d'Alice", !liste.error && liste.data.length === 0, JSON.stringify(liste.error ?? liste.data.length));
  verifier("Bruno ne dépose rien dans le dossier d'Alice", (await b.storage.from(COMPARTIMENT).upload(`${alice.id}/${vehiculeId}/${randomUUID()}.pdf`, octets, { contentType: "application/pdf" })).error);
  await b.storage.from(COMPARTIMENT).remove([chemin]);
  verifier("Bruno n'efface pas le fichier d'Alice", !(await a.storage.from(COMPARTIMENT).download(chemin)).error);

  // --- Visiteur sans session ---
  for (const table of ["auto_vehicules", "auto_historique", "auto_documents", "auto_releves_km", "auto_taches", "auto_lectures"]) {
    const r = await lignes(visiteur.from(table).select("id").limit(1));
    verifier(`Un visiteur ne lit rien de ${table}`, r.n === 0, JSON.stringify(r));
  }
  verifier("Un visiteur ne télécharge pas un fichier", (await visiteur.storage.from(COMPARTIMENT).download(chemin)).error);

  // --- Route de lecture (serveur local) ---
  if (SERVEUR) {
    const appel = (jeton) => fetch(`${SERVEUR}/api/auto/documents/${documentA.id}/lecture`, { method: "POST", headers: { "content-type": "application/json", ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) }, body: "{}" });
    const sans = await appel(null);
    verifier("Route de lecture : sans session, refus 401", sans.status === 401, String(sans.status));
    const parBruno = await appel(bruno.jeton);
    const corps = await parBruno.json().catch(() => ({}));
    verifier("Route de lecture : le document d'Alice est introuvable pour Bruno", parBruno.status === 404 && corps.etat === "introuvable", `${parBruno.status} ${JSON.stringify(corps)}`);
    const faux = await appel("eyJhbGciOiJIUzI1NiJ9.e30.signature-fausse");
    verifier("Route de lecture : jeton forgé, refus 401", faux.status === 401, String(faux.status));
    verifier("Aucune lecture journalisée pour Bruno sur le document d'Alice", (await admin.from("auto_lectures").select("id").eq("document_id", documentA.id)).data.length === 0);
  } else {
    verifier("Route de lecture non éprouvée (aucun serveur indiqué)", true, "ignorée");
  }

  // --- Le dossier d'Alice est intact ---
  const v = (await a.from("auto_vehicules").select("marque, archive_le").eq("id", vehiculeId).single()).data;
  const h = (await a.from("auto_historique").select("montant_ttc").eq("vehicule_id", vehiculeId)).data;
  const d = (await a.from("auto_documents").select("titre, historique_id").eq("id", documentA.id).single()).data;
  verifier("Dossier d'Alice intact", v?.marque === "Peugeot" && v.archive_le === null && h.length === 1 && Number(h[0].montant_ttc) === 99 && d?.titre === null, JSON.stringify({ v, h, d }));
} catch (e) {
  verifier("Déroulé de la recette", false, e?.message ?? String(e));
} finally {
  for (const id of comptes) {
    const vehicules = (await admin.from("auto_vehicules").select("id").eq("proprietaire_id", id)).data ?? [];
    for (const v of vehicules) {
      const fichiers = (await admin.storage.from(COMPARTIMENT).list(`${id}/${v.id}`)).data ?? [];
      if (fichiers.length) await admin.storage.from(COMPARTIMENT).remove(fichiers.map((f) => `${id}/${v.id}/${f.name}`));
    }
    await admin.from("auto_lectures").delete().eq("proprietaire_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  const echecs = resultats.filter((r) => !r.ok);
  for (const r of resultats) console.log(`${r.ok ? "ok  " : "ÉCHEC"} ${r.nom}${r.ok ? "" : ` — ${r.detail}`}`);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} contrôles passés. Comptes fictifs supprimés : ${comptes.length}.`);
  process.exitCode = echecs.length ? 3 : 0;
}
