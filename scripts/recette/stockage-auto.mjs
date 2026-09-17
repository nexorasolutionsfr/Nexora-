// Recette des règles du compartiment privé `auto-documents`, par la vraie API
// Storage de Supabase — base TEST uniquement.
//
//   node scripts/recette/stockage-auto.mjs
//
// Crée deux comptes automobilistes de recette (adresses .invalid, aucun
// e-mail), une voiture chacun, puis vérifie :
//   1. Alice dépose un fichier dans le dossier de sa voiture ;
//   2. Alice ne dépose rien dans le dossier de Bruno, ni dans celui d'une
//      voiture qui ne lui appartient pas ;
//   3. Bruno ne lit, ne liste, ne signe ni ne supprime le fichier d'Alice ;
//   4. une adresse signée d'Alice sert bien le fichier ;
//   5. le compartiment refuse un format non accepté.
// Puis supprime fichiers, voitures et comptes créés.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const COMPARTIMENT = "auto-documents";

const env = { ...process.env };
try {
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // environnement seul
}
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let echecs = 0;
function verifier(condition, libelle) {
  console.log(`${condition ? "OK   " : "ÉCHEC"} ${libelle}`);
  if (!condition) echecs += 1;
}

async function ouvrirSession(prenom) {
  const horodatage = Date.now();
  const email = `recette.auto.stockage.${prenom}.${horodatage}@nexora-recette.invalid`;
  const { data: cree, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
  if (error) throw new Error(`création ${prenom} : ${error.message}`);
  // Bêta privée (20260922001100) : le compte fictif est invité le temps de la recette.
  await admin.from("auto_acces_beta").upsert({ email: email.toLowerCase(), note: "recette automatique (Test)" });
  const { data: lien, error: erreurLien } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (erreurLien) throw new Error(`lien ${prenom} : ${erreurLien.message}`);
  const client = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: erreurOtp } = await client.auth.verifyOtp({ token_hash: lien.properties.hashed_token, type: "magiclink" });
  if (erreurOtp) throw new Error(`session ${prenom} : ${erreurOtp.message}`);
  const { data: vehicule, error: erreurVehicule } = await client.rpc("auto_ajouter_vehicule", { p_marque: "Recette", p_modele: prenom });
  if (erreurVehicule) throw new Error(`voiture ${prenom} : ${erreurVehicule.message}`);
  return { id: cree.user.id, email, client, vehicule };
}

const alice = await ouvrirSession("alice");
const bruno = await ouvrirSession("bruno");
const pdf = new Blob(["%PDF-1.4\n% recette Nexora Auto\n"], { type: "application/pdf" });
const cheminAlice = `${alice.id}/${alice.vehicule}/recette.pdf`;

try {
  const depot = await alice.client.storage.from(COMPARTIMENT).upload(cheminAlice, pdf, { contentType: "application/pdf" });
  verifier(!depot.error, "Alice dépose dans le dossier de sa voiture");

  const chezBruno = await alice.client.storage.from(COMPARTIMENT).upload(`${bruno.id}/${bruno.vehicule}/intrus.pdf`, pdf, { contentType: "application/pdf" });
  verifier(Boolean(chezBruno.error), "Alice ne dépose rien dans le dossier de Bruno");

  const voitureDeBruno = await alice.client.storage.from(COMPARTIMENT).upload(`${alice.id}/${bruno.vehicule}/intrus.pdf`, pdf, { contentType: "application/pdf" });
  verifier(Boolean(voitureDeBruno.error), "Alice ne dépose rien sous une voiture de Bruno, même dans son propre dossier");

  const lectureBruno = await bruno.client.storage.from(COMPARTIMENT).download(cheminAlice);
  verifier(Boolean(lectureBruno.error), "Bruno ne télécharge pas le fichier d'Alice");

  const listeBruno = await bruno.client.storage.from(COMPARTIMENT).list(`${alice.id}/${alice.vehicule}`);
  verifier(!listeBruno.error && (listeBruno.data ?? []).length === 0, "Bruno ne liste pas le dossier d'Alice");

  const signeeBruno = await bruno.client.storage.from(COMPARTIMENT).createSignedUrl(cheminAlice, 60);
  verifier(Boolean(signeeBruno.error), "Bruno n'obtient pas d'adresse signée pour le fichier d'Alice");

  const suppressionBruno = await bruno.client.storage.from(COMPARTIMENT).remove([cheminAlice]);
  const encoreLa = await alice.client.storage.from(COMPARTIMENT).download(cheminAlice);
  verifier(!encoreLa.error && (suppressionBruno.data ?? []).length === 0, "Bruno ne supprime pas le fichier d'Alice");

  const signee = await alice.client.storage.from(COMPARTIMENT).createSignedUrl(cheminAlice, 60);
  const reponse = signee.data?.signedUrl ? await fetch(signee.data.signedUrl) : null;
  verifier(reponse?.status === 200 && (await reponse.text()).includes("recette Nexora Auto"), "L'adresse signée d'Alice sert le fichier");

  const publique = await fetch(`${url}/storage/v1/object/public/${COMPARTIMENT}/${cheminAlice}`);
  verifier(publique.status >= 400, "Aucune adresse publique ne sert le fichier");

  const exe = await alice.client.storage.from(COMPARTIMENT).upload(`${alice.id}/${alice.vehicule}/virus.exe`, new Blob(["MZ"], { type: "application/x-msdownload" }), { contentType: "application/x-msdownload" });
  verifier(Boolean(exe.error), "Le compartiment refuse un format non accepté");
} finally {
  await admin.storage.from(COMPARTIMENT).remove([cheminAlice]);
  for (const personne of [alice, bruno]) {
    await admin.from("auto_vehicules").delete().eq("proprietaire_id", personne.id);
    await admin.from("auto_acces_beta").delete().eq("email", personne.email.toLowerCase());
    await admin.auth.admin.deleteUser(personne.id);
  }
  console.log("Nettoyage : fichier, voitures et comptes de recette supprimés.");
}

process.exit(echecs ? 1 : 0);
