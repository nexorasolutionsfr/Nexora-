// Fermer Nexora Auto pendant qu'une session est ouverte — base TEST uniquement.
//
//   node scripts/recette/fermeture-beta.mjs [http://localhost:3114]
//
// Deux fermetures, qui ne font pas la même chose :
//
// 1. EN BASE (`auto_acces_parametres.mode = 'ferme'`, ou une adresse retirée
//    de la liste) : la personne perd immédiatement l'accès à SES données et à
//    SES fichiers, même avec une session déjà ouverte et même en parlant
//    directement à la base, sans passer par l'application. C'est la seule
//    fermeture qui protège les données.
//
// 2. APPLICATIVE (`AUTO_ACCES=ferme` sur le serveur) : les écrans et les
//    routes de Nexora Auto se ferment, mais un onglet déjà ouvert continue de
//    parler directement à la base. Ce contrôle sert à retirer l'application,
//    pas à couper l'accès aux données.
//
// Limite mesurée ici : le stockage Supabase est servi par un cache
// (« Cache-Control: public, max-age=3600 »). Un fichier DÉJÀ téléchargé peut
// encore être servi à LA MÊME session pendant au plus une heure après la
// fermeture. Un fichier jamais téléchargé est refusé, et un autre compte est
// refusé même quand le fichier est en cache : le cache est propre à la session.
//
// Le script éprouve la fermeture EN BASE, avec des comptes fictifs créés puis
// supprimés, et remet le mode d'origine à la fin. La fermeture applicative se
// vérifie à la main (voir docs/architecture/nexora-auto-livraison.md).

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const SERVEUR = process.argv[2] || null;
const COMPARTIMENT = "auto-documents";

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

const resultats = [];
const verifier = (nom, ok, detail = "") => resultats.push({ nom, ok: Boolean(ok), detail });
const modeInitial = (await admin.from("auto_acces_parametres").select("mode").single()).data?.mode ?? "ferme";
const regler = async (mode) => admin.from("auto_acces_parametres").update({ mode }).eq("unique_ligne", true);
let utilisateurId = null;
let email = null;
let voisinId = null;
let voisinEmail = null;

try {
  email = `recette.fermeture.${Date.now()}@nexora-recette.invalid`;
  const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
  if (creation.error) throw creation.error;
  utilisateurId = creation.data.user.id;
  await admin.from("auto_acces_beta").upsert({ email, note: "recette de fermeture (Test)" });
  await regler("beta");

  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error("Session de recette impossible.");
  // Une session déjà ouverte : le client garde ce jeton, valable une heure.
  const personne = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false },
  });

  // Un voisin, invité lui aussi : il ne doit jamais rien obtenir, cache ou pas.
  voisinEmail = `recette.fermeture.voisin.${Date.now()}@nexora-recette.invalid`;
  const voisin = await admin.auth.admin.createUser({ email: voisinEmail, email_confirm: true, user_metadata: { espace: "auto" } });
  if (voisin.error) throw voisin.error;
  voisinId = voisin.data.user.id;
  await admin.from("auto_acces_beta").upsert({ email: voisinEmail, note: "recette de fermeture (Test)" });
  const lienVoisin = await admin.auth.admin.generateLink({ type: "magiclink", email: voisinEmail });
  const destinationVoisin = (await fetch(lienVoisin.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jetonVoisin = new URLSearchParams(destinationVoisin.split("#")[1] || "").get("access_token");

  const { data: vehiculeId, error } = await personne.rpc("auto_ajouter_vehicule", { p_marque: "Opel", p_modele: "Corsa fictive", p_annee: 2017 });
  if (error) throw error;
  const octets = new TextEncoder().encode(`%PDF-1.4\n% facture fictive ${randomUUID()}\n%%EOF`);
  const chemin = `${utilisateurId}/${vehiculeId}/${randomUUID()}.pdf`;
  const cheminJamaisLu = `${utilisateurId}/${vehiculeId}/${randomUUID()}.pdf`;
  const depot = await personne.storage.from(COMPARTIMENT).upload(chemin, octets, { contentType: "application/pdf" });
  if (depot.error) throw depot.error;
  const depotSecond = await personne.storage.from(COMPARTIMENT).upload(cheminJamaisLu, octets, { contentType: "application/pdf" });
  if (depotSecond.error) throw depotSecond.error;
  // Requête directe au stockage, pour voir l'état du cache.
  const telecharger = async (c, jeton) => {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${COMPARTIMENT}/${c}`, {
      headers: { Authorization: `Bearer ${jeton}`, apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    return { statut: r.status, cache: r.headers.get("cf-cache-status") };
  };
  verifier("Session ouverte, bêta en cours : la personne lit son dossier", (await personne.from("auto_vehicules").select("id").eq("id", vehiculeId)).data?.length === 1);
  verifier("Session ouverte, bêta en cours : la personne ouvre son fichier", !(await personne.storage.from(COMPARTIMENT).download(chemin)).error);

  // --- Fermeture EN BASE, session inchangée ---
  await regler("ferme");
  const etat = await personne.rpc("auto_etat_acces");
  verifier("Fermé en base : l'état rendu à l'écran devient « fermé, non autorisé »", etat.data?.mode === "ferme" && etat.data?.autorise === false, JSON.stringify(etat.data ?? etat.error));
  verifier("Fermé en base : le dossier n'est plus lisible", (await personne.from("auto_vehicules").select("id").eq("id", vehiculeId)).data?.length === 0);
  verifier("Fermé en base : plus aucune écriture", Boolean((await personne.from("auto_releves_km").insert({ vehicule_id: vehiculeId, kilometrage: 10, releve_le: "2026-09-01" })).error));
  const jamaisLu = await telecharger(cheminJamaisLu, jeton);
  verifier("Fermé en base : un fichier jamais téléchargé n'est plus accessible", jamaisLu.statut !== 200, JSON.stringify(jamaisLu));
  const voisinSurCache = await telecharger(chemin, jetonVoisin);
  verifier("Fermé en base : un autre compte n'obtient rien, même sur un fichier déjà mis en cache", voisinSurCache.statut !== 200, JSON.stringify(voisinSurCache));
  const dejaLu = await telecharger(chemin, jeton);
  verifier(
    `Limite connue : un fichier déjà téléchargé peut encore être servi à la même session par le cache du stockage (${dejaLu.statut}, cache ${dejaLu.cache}, une heure au plus)`,
    dejaLu.statut === 200 || dejaLu.statut === 400,
    JSON.stringify(dejaLu),
  );
  verifier("Fermé en base : plus aucun dépôt de fichier", Boolean((await personne.storage.from(COMPARTIMENT).upload(`${utilisateurId}/${vehiculeId}/${randomUUID()}.pdf`, octets, { contentType: "application/pdf" })).error));
  const signee = await personne.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60);
  verifier("Fermé en base : aucune nouvelle adresse signée", Boolean(signee.error), signee.error?.message);
  if (SERVEUR) {
    const reponse = await fetch(`${SERVEUR}/api/auto/lecture`, { cache: "no-store" });
    const corps = await reponse.json().catch(() => ({}));
    verifier("Fermé en base : le serveur n'annonce plus la lecture automatique", corps.disponible === false, JSON.stringify(corps));
  }

  // --- Retrait de la liste, bêta rétablie ---
  await regler("beta");
  verifier("Bêta rétablie : la même session retrouve son dossier", (await personne.from("auto_vehicules").select("id").eq("id", vehiculeId)).data?.length === 1);
  await admin.from("auto_acces_beta").delete().eq("email", email);
  verifier("Adresse retirée de la liste : la même session perd l'accès", (await personne.from("auto_vehicules").select("id").eq("id", vehiculeId)).data?.length === 0);
  verifier("Adresse retirée : les données restent en base pour la personne", (await admin.from("auto_vehicules").select("id").eq("id", vehiculeId)).data?.length === 1);
} catch (e) {
  verifier("Déroulé de la recette", false, e?.message ?? String(e));
} finally {
  for (const adresse of [email, voisinEmail]) if (adresse) await admin.from("auto_acces_beta").delete().eq("email", adresse);
  if (voisinId) await admin.auth.admin.deleteUser(voisinId);
  if (utilisateurId) {
    const vehicules = (await admin.from("auto_vehicules").select("id").eq("proprietaire_id", utilisateurId)).data ?? [];
    for (const v of vehicules) {
      const fichiers = (await admin.storage.from(COMPARTIMENT).list(`${utilisateurId}/${v.id}`)).data ?? [];
      if (fichiers.length) await admin.storage.from(COMPARTIMENT).remove(fichiers.map((f) => `${utilisateurId}/${v.id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(utilisateurId);
  }
  await regler(modeInitial);
  const echecs = resultats.filter((r) => !r.ok);
  for (const r of resultats) console.log(`${r.ok ? "ok  " : "ÉCHEC"} ${r.nom}${r.ok ? "" : ` — ${r.detail}`}`);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} contrôles passés. Mode remis à « ${modeInitial} », compte fictif supprimé.`);
  process.exitCode = echecs.length ? 3 : 0;
}
