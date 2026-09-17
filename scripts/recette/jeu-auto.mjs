// Jeu de recette Nexora Auto — base TEST uniquement.
//
//   node scripts/recette/jeu-auto.mjs            (crée le compte et ses voitures)
//   node scripts/recette/jeu-auto.mjs supprimer  (efface tous les comptes du jeu)
//
// Un compte fictif et cinq voitures, chacune posée pour une situation que la
// recette doit couvrir. Rien d'inventé côté produit : ce sont des données
// d'entrée, pas des règles. Les dates sont relatives au jour où on l'exécute,
// pour que le jeu reste valable demain.
//
// Refus de démarrer hors de la base Test. Aucun e-mail n'est envoyé.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url).pathname);
const { createClient } = require("@supabase/supabase-js");

const PROJET_TEST = "slawilafseganlbghgwx";
const env = { ...process.env };
for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
  const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PREFIXE = "recette.jeu.auto";

if (process.argv[2] === "supprimer") {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const cibles = data.users.filter((u) => u.email?.startsWith(PREFIXE));
  for (const u of cibles) {
    const { data: dossiers } = await admin.storage.from("auto-documents").list(u.id, { limit: 100 });
    for (const d of dossiers ?? []) {
      const { data: f } = await admin.storage.from("auto-documents").list(`${u.id}/${d.name}`, { limit: 100 });
      if (f?.length) await admin.storage.from("auto-documents").remove(f.map((x) => `${u.id}/${d.name}/${x.name}`));
    }
    await admin.from("auto_acces_beta").delete().eq("email", u.email.toLowerCase());
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log(`${cibles.length} compte(s) du jeu supprimé(s).`);
  process.exit(0);
}

const email = `${PREFIXE}.${Date.now()}@nexora-recette.invalid`;
const { data: creation, error: erreurCompte } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
if (erreurCompte) throw erreurCompte;
const uid = creation.user.id;
await admin.from("auto_acces_beta").upsert({ email: email.toLowerCase(), note: "jeu de recette (Test)" });

const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
if (!jeton) throw new Error("Session de recette impossible.");
const moi = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });

const jour = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const verifier = (r, quoi) => {
  if (r.error) {
    console.error(`Échec (${quoi}) :`, r.error.message);
    process.exit(1);
  }
  return r.data;
};
// `await` avant `verifier` : sans lui, on vérifie une promesse — jamais en
// erreur — et l'identifiant rendu vaut `undefined`. L'insertion suivante part
// alors sans voiture, et c'est la règle d'accès qui la refuse. Piège coûteux.
const ajouter = async (marque, modele, extra = {}) =>
  verifier(
    await moi.rpc("auto_ajouter_vehicule", {
      p_marque: marque, p_modele: modele, p_annee: extra.annee ?? null, p_energie: extra.energie ?? null,
      p_immatriculation: extra.immatriculation ?? null, p_date_mise_en_circulation: extra.mec ?? null,
      p_kilometrage: extra.km ?? null, p_dernier_controle: extra.ct ?? null, p_controle_valable_jusqu_au: extra.ctFin ?? null,
    }),
    `ajout ${marque} ${modele}`,
  );

// 1. Dossier vide : rien qu'une marque et un modèle.
const vierge = await ajouter("Toyota", "Yaris");

// 2. Contrôle technique lointain, entretien inconnu (le cas observé).
const corsa = await ajouter("Opel", "Corsa", { annee: 2014, energie: "diesel", mec: "2014-05-20" });
verifier(await moi.from("auto_historique").insert({
  vehicule_id: corsa, type: "controle_technique", realise_le: jour(-90), resultat_controle: "favorable",
  nature_controle: "periodique", controle_valable_jusqu_au: jour(640), libelle: "Contrôle technique périodique",
}), "CT Corsa");
verifier(await moi.from("auto_releves_km").insert({ vehicule_id: corsa, kilometrage: 231000, releve_le: jour(0) }), "km Corsa");

// 3. Révision qui approche au compteur : le compteur sert vraiment.
const clio = await ajouter("Renault", "Clio", { annee: 2019, energie: "essence", immatriculation: "AB123CD", mec: "2019-04-10" });
verifier(await moi.from("auto_vehicules").update({ intervalle_entretien_km: 15000, intervalle_entretien_mois: 12 }).eq("id", clio), "intervalle Clio");
verifier(await moi.from("auto_historique").insert({
  vehicule_id: clio, type: "revision", realise_le: jour(-330), kilometrage: 61000,
  prestataire: "Garage du Pont", montant_ttc: 289.9, libelle: "Révision constructeur",
}), "révision Clio");
verifier(await moi.from("auto_releves_km").insert([
  { vehicule_id: clio, kilometrage: 68000, releve_le: jour(-120) },
  { vehicule_id: clio, kilometrage: 74500, releve_le: jour(-25) },
]), "km Clio");

// 4. Contrôle technique dépassé : l'écran doit le mettre en premier.
const c3 = await ajouter("Citroën", "C3", { annee: 2016, energie: "essence", mec: "2016-02-01" });
verifier(await moi.from("auto_historique").insert({
  vehicule_id: c3, type: "controle_technique", realise_le: jour(-760), resultat_controle: "favorable",
  nature_controle: "periodique", controle_valable_jusqu_au: jour(-30), libelle: "Contrôle technique périodique",
}), "CT C3");

// 5. Kilométrages qui se contredisent : aucune estimation ne doit être faite.
const golf = await ajouter("Volkswagen", "Golf", { annee: 2018, energie: "diesel" });
verifier(await moi.from("auto_vehicules").update({ intervalle_entretien_km: 20000, intervalle_entretien_mois: 24 }).eq("id", golf), "intervalle Golf");
verifier(await moi.from("auto_historique").insert({
  vehicule_id: golf, type: "revision", realise_le: jour(-200), kilometrage: 90000, libelle: "Révision",
}), "révision Golf");
verifier(await moi.from("auto_releves_km").insert([
  { vehicule_id: golf, kilometrage: 120000, releve_le: jour(-10) },
  { vehicule_id: golf, kilometrage: 95000, releve_le: jour(-9) },
]), "km Golf");

verifier(await moi.rpc("auto_definir_principal", { p_vehicule_id: corsa }), "voiture principale");

console.log(JSON.stringify({ email, uid, vierge, corsa, clio, c3, golf }, null, 2));
console.log("\nCinq voitures : dossier vide, CT lointain + entretien inconnu, révision qui approche au compteur, CT dépassé, kilométrages contradictoires.");
console.log("Lien de session :  node scripts/recette/compte-auto.mjs lien " + email + " http://localhost:3114/auto");
