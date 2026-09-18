// Recette du rappel par e-mail (contrôle technique) — base TEST uniquement.
//
//   node scripts/recette/rappels-auto.mjs preparer <fichier.json>   crée les comptes et les voitures, active les rappels
//   node scripts/recette/rappels-auto.mjs rendre-dus <fichier.json> rend dus les rappels programmés (le temps passe)
//   node scripts/recette/rappels-auto.mjs relancer <fichier.json>   rend dues les reprises en attente (30 min, 2 h)
//   node scripts/recette/rappels-auto.mjs etat <fichier.json>       la file, lisible
//   node scripts/recette/rappels-auto.mjs geste <fichier.json> <compte> <geste> [voiture] [valeur]
//   node scripts/recette/rappels-auto.mjs supprimer <fichier.json>  efface les comptes du jeu (et leurs rappels)
//
// Comptes fictifs @nexora-recette.invalid, dont le début d'adresse pilote le
// serveur SMTP contrôlé (scripts/recette/smtp-controle.mjs) : « accepte. »,
// « temporaire. » (451), « definitif. » (550), « coupure. » (issue incertaine).
// Aucune adresse ne peut atteindre une vraie boîte : le serveur refuse tout ce
// qui n'est pas @nexora-recette.invalid, et ne relaie rien.
//
// Les consentements passent par la VRAIE fonction, avec la session du compte
// (auto_activer_rappel) — jamais par une écriture de service.
//
// Refus de démarrer hors de la base Test. Aucun e-mail n'est envoyé.

import { readFileSync, writeFileSync } from "node:fs";
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
const [, , commande, fichier, ...reste] = process.argv;
if (!commande || !fichier) {
  console.error("Usage : node scripts/recette/rappels-auto.mjs <preparer|rendre-dus|relancer|etat|geste|supprimer> <fichier.json> …");
  process.exit(1);
}

const verifier = (r, quoi) => {
  if (r.error) {
    console.error(`Échec (${quoi}) :`, r.error.message);
    process.exit(1);
  }
  return r.data;
};
const jour = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

async function session(email) {
  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error(`Session de recette impossible pour ${email}`);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });
}

async function creerCompte(prefixe, horodatage) {
  const email = `${prefixe}.rappel.${horodatage}@nexora-recette.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
  if (error) throw error;
  verifier(await admin.from("auto_acces_beta").upsert({ email, note: "recette rappels (Test)" }), `invitation ${prefixe}`);
  return { email, uid: data.user.id };
}

// Une voiture avec un contrôle technique déclaré (date du procès-verbal).
async function voiture(moi, marque, modele, { plaque = null, valableJusquAu, realiseLe }) {
  const id = verifier(await moi.rpc("auto_ajouter_vehicule", {
    p_marque: marque, p_modele: modele, p_annee: 2018, p_energie: null, p_immatriculation: plaque, p_date_mise_en_circulation: null,
    p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  }), `voiture ${marque}`);
  verifier(await moi.from("auto_historique").insert({
    vehicule_id: id, type: "controle_technique", realise_le: realiseLe, nature_controle: "periodique",
    resultat_controle: "favorable", controle_valable_jusqu_au: valableJusquAu, libelle: "Contrôle technique périodique",
  }), `CT ${marque}`);
  return id;
}

const lire = () => JSON.parse(readFileSync(fichier, "utf8"));

if (commande === "preparer") {
  const t = Date.now();
  const jeu = { cree_le: new Date().toISOString(), comptes: {} };
  for (const prefixe of ["accepte", "temporaire", "definitif", "coupure"]) {
    const compte = await creerCompte(prefixe, t);
    const moi = await session(compte.email);
    compte.voitures = {};
    // Échéance dans 40 jours : « un mois avant » tombe dans 10 jours.
    compte.voitures.principale = await voiture(moi, "Opel", "Corsa", { plaque: "AB123CD", realiseLe: jour(-690), valableJusquAu: jour(40) });
    const r = verifier(await moi.rpc("auto_activer_rappel", { p_vehicule_id: compte.voitures.principale, p_delai_jours: 30 }), `activation ${prefixe}`);
    if (!r?.ok) throw new Error(`activation refusée pour ${prefixe} : ${JSON.stringify(r)}`);
    if (prefixe === "accepte") {
      // Sans consentement : aucune ligne ne doit jamais apparaître.
      compte.voitures.sans_rappel = await voiture(moi, "Renault", "Clio", { plaque: "CD456EF", realiseLe: jour(-700), valableJusquAu: jour(30) });
      // Pour la double exécution, la désactivation, la date corrigée, le nouveau contrôle, l'archivage.
      for (const cle of ["double", "desactivee", "corrigee", "nouveau_controle", "archivee"]) {
        compte.voitures[cle] = await voiture(moi, "Peugeot", `208 ${cle}`, { realiseLe: jour(-680), valableJusquAu: jour(45) });
        verifier(await moi.rpc("auto_activer_rappel", { p_vehicule_id: compte.voitures[cle], p_delai_jours: 30 }), `activation ${cle}`);
      }
    }
    jeu.comptes[prefixe] = compte;
  }
  writeFileSync(fichier, JSON.stringify(jeu, null, 2));
  console.log(`Jeu écrit dans ${fichier}`);
  console.log(`RECETTE_PROPRIETAIRES=${Object.values(jeu.comptes).map((c) => c.uid).join(",")}`);
  process.exit(0);
}

const jeu = lire();
const proprietaires = Object.values(jeu.comptes).map((c) => c.uid);

if (commande === "rendre-dus" || commande === "relancer") {
  // Cible facultative : « compte:voiture,… » ; sans cible, tout le jeu.
  const cibles = (reste[0] || "").split(",").filter(Boolean).map((c) => {
    const [compte, voitureCle] = c.split(":");
    const id = jeu.comptes[compte]?.voitures?.[voitureCle];
    if (!id) throw new Error(`cible inconnue : ${c}`);
    return id;
  });
  const base = admin.from("auto_rappels_envois").update(commande === "rendre-dus" ? { prevu_le: new Date(Date.now() - 60000).toISOString() } : { prochain_essai_le: new Date(Date.now() - 1000).toISOString() });
  let filtre = commande === "rendre-dus" ? base.in("proprietaire_id", proprietaires).eq("statut", "prevu") : base.in("proprietaire_id", proprietaires).eq("statut", "prevu").not("prochain_essai_le", "is", null);
  if (cibles.length) filtre = filtre.in("vehicule_id", cibles);
  const lignes = verifier(await filtre.select("id"), commande);
  console.log(`${lignes.length} ligne(s) ${commande === "rendre-dus" ? "rendue(s) due(s)" : "dont la reprise est avancée"}.`);
  process.exit(0);
}

if (commande === "etat") {
  const lignes = verifier(await admin.from("auto_rappels_envois")
    .select("proprietaire_id, vehicule_id, palier, echeance, prevu_le, statut, tentatives, prochain_essai_le, derniere_erreur, motif, destinataire, envoye_le")
    .in("proprietaire_id", proprietaires).order("id"), "état");
  const compteDe = (uid) => Object.entries(jeu.comptes).find(([, c]) => c.uid === uid)?.[0] ?? "?";
  const voitureDe = (uid, vid) => Object.entries(jeu.comptes[compteDe(uid)]?.voitures ?? {}).find(([, id]) => id === vid)?.[0] ?? "?";
  const paris = (iso) => (iso ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—");
  console.log(JSON.stringify(lignes.map((l) => ({
    compte: compteDe(l.proprietaire_id), voiture: voitureDe(l.proprietaire_id, l.vehicule_id), palier: l.palier, echeance: l.echeance,
    prevu_paris: paris(l.prevu_le), statut: l.statut, tentatives: l.tentatives, reprise_paris: paris(l.prochain_essai_le),
    envoye_paris: paris(l.envoye_le), motif: l.motif, erreur: l.derniere_erreur,
  })), null, 1));
  process.exit(0);
}

if (commande === "geste") {
  const [compte, geste, voitureCle, valeur] = reste;
  const c = jeu.comptes[compte];
  const vid = c?.voitures?.[voitureCle];
  const moi = await session(c.email);
  if (geste === "desactiver") console.log(JSON.stringify(verifier(await moi.rpc("auto_desactiver_rappel", { p_vehicule_id: vid }), geste)));
  else if (geste === "activer") console.log(JSON.stringify(verifier(await moi.rpc("auto_activer_rappel", { p_vehicule_id: vid, p_delai_jours: Number(valeur || 30) }), geste)));
  else if (geste === "corriger_date") {
    // La personne corrige la date du procès-verbal de son dernier contrôle.
    const ct = verifier(await moi.from("auto_historique").select("id").eq("vehicule_id", vid).eq("type", "controle_technique").order("realise_le", { ascending: false }).limit(1), geste)[0];
    verifier(await moi.from("auto_historique").update({ controle_valable_jusqu_au: jour(Number(valeur)) }).eq("id", ct.id), geste);
    console.log(`date du procès-verbal corrigée : ${jour(Number(valeur))}`);
  } else if (geste === "nouveau_controle") {
    verifier(await moi.from("auto_historique").insert({
      vehicule_id: vid, type: "controle_technique", realise_le: jour(-1), nature_controle: "periodique",
      resultat_controle: "favorable", controle_valable_jusqu_au: jour(Number(valeur || 729)), libelle: "Contrôle technique périodique",
    }), geste);
    console.log(`nouveau contrôle enregistré, valable jusqu'au ${jour(Number(valeur || 729))}`);
  } else if (geste === "archiver") console.log(JSON.stringify(verifier(await moi.rpc("auto_archiver_vehicule", { p_vehicule_id: vid, p_archiver: true }), geste)));
  else if (geste === "supprimer_voiture") {
    verifier(await moi.from("auto_vehicules").delete().eq("id", vid), geste);
    console.log("voiture supprimée");
  } else if (geste === "etat_ecran") console.log(JSON.stringify(verifier(await moi.rpc("auto_etat_rappel", { p_vehicule_id: vid }), geste)));
  else throw new Error(`geste inconnu : ${geste}`);
  process.exit(0);
}

if (commande === "supprimer") {
  let n = 0;
  for (const c of Object.values(jeu.comptes)) {
    await admin.from("auto_acces_beta").delete().eq("email", c.email.toLowerCase());
    const { error } = await admin.auth.admin.deleteUser(c.uid);
    if (!error) n += 1;
  }
  const restes = verifier(await admin.from("auto_rappels_envois").select("id").in("proprietaire_id", proprietaires), "contrôle");
  console.log(`${n} compte(s) supprimé(s) ; lignes de rappel restantes : ${restes.length}.`);
  process.exit(0);
}

console.error(`Commande inconnue : ${commande}`);
process.exit(1);
