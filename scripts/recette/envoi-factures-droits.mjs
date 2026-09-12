// Recette de l'envoi des factures — droits et états, contre Supabase TEST.
//
// Ce que ce script prouve, sur des données entièrement fictives :
//   - une facture créée naît `sans_lien`, sans jeton : rien ne peut partir ;
//   - produire un lien n'arme pas l'envoi ;
//   - seul `autoriser_envoi_facture` arme la notification, après contrôle du
//     destinataire montré ; un second appel ne crée rien (double clic) ;
//   - dirigeant et accueil peuvent préparer et autoriser ; mécanicien, membre
//     révoqué, autre garage et visiteur sans session sont refusés EN BASE ;
//   - une facture modifiée après autorisation est mise de côté (« bloqué »)
//     par la réservation, jamais envoyée en silence ; elle se revalide ;
//   - les cinq états de l'écran existent : à valider, en attente, envoi à
//     vérifier, envoyé, bloqué.
//
// Garde-fous, dans cet ordre : refus hors projet Test ; comptes synthétiques
// `…@nexora-recette.invalid` seulement ; aucun envoi (rien ne lit la file de
// Test, et les lignes réservées ici sont closes avant la fin du script).
//
// Usage : node scripts/recette/envoi-factures-droits.mjs
//
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(RACINE + "/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const PROJET_TEST = "slawilafseganlbghgwx";
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes(PROJET_TEST)) {
  console.error(`REFUS : ce worktree ne vise pas le projet Test (${PROJET_TEST}).`);
  process.exit(2);
}
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("REFUS : clé de service ou clé anonyme absente du .env.local.");
  process.exit(2);
}

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SYNTHETIQUE = /^recette\.[a-z0-9.-]+@nexora-recette\.invalid$/;

const GARAGE_A = "2d52c219-da21-4ce6-a8e4-07d2921b668e"; // Garage Recette Dix Minutes Apres
const COMPTES = {
  dirigeant: "recette.dixmin.apres@nexora-recette.invalid",
  accueil: "recette.dixmin.accueil@nexora-recette.invalid",
  mecanicien: "recette.dixmin.meca@nexora-recette.invalid",
  revoque: "recette.dixmin.revoque@nexora-recette.invalid",
  autreGarage: "recette.dixmin.avant@nexora-recette.invalid",
};
for (const e of Object.values(COMPTES)) {
  if (!SYNTHETIQUE.test(e)) { console.error("REFUS : adresse hors du domaine synthétique"); process.exit(2); }
}

let echecs = 0;
function verifier(condition, libelle, detail) {
  if (condition) console.log(`  ✔ ${libelle}`);
  else { echecs += 1; console.log(`  ✖ ${libelle}${detail ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

// Une session par compte, sans mot de passe : lien magique produit par la clé
// de service, échangé contre une session par `verifyOtp`. Le compte n'est pas
// modifié.
async function session(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`lien pour ${email} : ${error.message}`);
  const client = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (e2) throw new Error(`session pour ${email} : ${e2.message}`);
  return client;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  return { data, error: error ? { code: error.code, message: error.message } : null };
}

async function etatNotif(factureId) {
  const { data } = await admin
    .from("notifications_factures")
    .select("id, type, statut, envoye, jeton, destinataire_valide, empreinte_document, derniere_erreur")
    .eq("facture_id", factureId)
    .eq("type", "nouvelle")
    .order("created_at", { ascending: false });
  return data || [];
}

// ---------------------------------------------------------------------------
// Fixtures : un membre révoqué, un client avec e-mail, une voiture, trois
// factures — toutes fictives, toutes dans le garage synthétique A.
// ---------------------------------------------------------------------------
async function assurerMembreRevoque() {
  const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = liste.users.find((u) => u.email === COMPTES.revoque);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: COMPTES.revoque, email_confirm: true });
    if (error) throw new Error(`création membre révoqué : ${error.message}`);
    user = data.user;
  }
  const { data: m } = await admin.from("garage_membres").select("id, actif, revoked_at").eq("garage_id", GARAGE_A).eq("user_id", user.id).maybeSingle();
  if (!m) {
    const { error } = await admin.from("garage_membres").insert({ garage_id: GARAGE_A, user_id: user.id, role: "accueil", actif: false, revoked_at: new Date().toISOString() });
    if (error) throw new Error(`adhésion révoquée : ${error.message}`);
  } else if (m.actif || !m.revoked_at) {
    await admin.from("garage_membres").update({ actif: false, revoked_at: new Date().toISOString() }).eq("id", m.id);
  }
}

async function creerFacture(suffixe, montantHt) {
  const email = `client.recette.factures@nexora-recette.invalid`;
  let { data: client } = await admin.from("clients").select("id").eq("garage_id", GARAGE_A).eq("email", email).maybeSingle();
  if (!client) {
    const r = await admin.from("clients").insert({ garage_id: GARAGE_A, nom: "Client Recette Factures", email, telephone: "0600000000" }).select("id").single();
    if (r.error) throw new Error(`client : ${r.error.message}`);
    client = r.data;
  }
  let { data: vehicule } = await admin.from("vehicules").select("id").eq("garage_id", GARAGE_A).eq("client_id", client.id).eq("immatriculation", "DEMO-FAC-01").maybeSingle();
  if (!vehicule) {
    const r = await admin.from("vehicules").insert({ garage_id: GARAGE_A, client_id: client.id, marque: "Dacia", modele: "Sandero", immatriculation: "DEMO-FAC-01" }).select("id").single();
    if (r.error) throw new Error(`véhicule : ${r.error.message}`);
    vehicule = r.data;
  }
  const lignes = [{ type: "main_oeuvre", description: `Recette facture ${suffixe}`, quantite: 1, prix_unitaire_ht: montantHt, taux_tva: 20, montant_ht: montantHt, montant_tva: montantHt * 0.2, montant_ttc: montantHt * 1.2 }];
  const r = await admin
    .from("factures")
    .insert({ garage_id: GARAGE_A, client_id: client.id, vehicule_id: vehicule.id, motif: `Recette envoi ${suffixe}`, lignes, montant_ht: montantHt, montant_ttc: Math.round(montantHt * 1.2 * 100) / 100, statut: "en_attente" })
    .select("id, numero, montant_ttc")
    .single();
  if (r.error) throw new Error(`facture : ${r.error.message}`);
  return r.data;
}

// ---------------------------------------------------------------------------
console.log("Fixtures");
await assurerMembreRevoque();
const fA = await creerFacture("A (dirigeant)", 100);
const fB = await creerFacture("B (accueil)", 80);
const fC = await creerFacture("C (modifiée après autorisation)", 50);
console.log(`  factures ${fA.numero}, ${fB.numero}, ${fC.numero} créées par la clé de service (sans session)`);

console.log("\n1. Une facture créée n'arme rien");
for (const f of [fA, fB, fC]) {
  const n = await etatNotif(f.id);
  verifier(n.length === 1 && n[0].statut === "sans_lien" && n[0].jeton === null && !n[0].destinataire_valide && !n[0].empreinte_document,
    `${f.numero} : une notification, sans_lien, sans jeton, sans destinataire ni empreinte`, n);
}

console.log("\n2. Dirigeant : préparer, lier, autoriser, ne pas doubler");
const dirigeant = await session(COMPTES.dirigeant);
{
  const etat = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fA.id });
  verifier(etat.data?.ok && etat.data.etat === "a_valider", "état initial : à valider", etat);
  const apercu = await rpc(dirigeant, "apercu_message_facture", { p_facture_id: fA.id });
  verifier(apercu.data?.ok && apercu.data.destinataire === "client.recette.factures@nexora-recette.invalid", "aperçu : destinataire montré", apercu);
  verifier(apercu.data?.sujet === `Votre facture ${fA.numero}`, "aperçu : objet « Votre facture <numéro> »", apercu.data?.sujet);
  verifier(/vous transmet la facture .* pour votre Dacia Sandero \(DEMO-FAC-01\) : 120 € TTC\./.test(apercu.data?.texte || ""), "aperçu : texte du traitement, montant « 120 » sans zéros", apercu.data?.texte);
  const jeton = await rpc(dirigeant, "creer_jeton_facture", { p_facture_id: fA.id });
  verifier(!jeton.error && typeof jeton.data === "string" && jeton.data.length === 64, "lien produit", jeton.error);
  const apresLien = await etatNotif(fA.id);
  verifier(apresLien[0].statut === "sans_lien" && apresLien[0].jeton === null, "le lien n'a pas armé l'envoi", apresLien);
  const mauvais = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fA.id, p_destinataire: "autre@exemple.invalid" });
  verifier(mauvais.data?.ok === false && mauvais.data.raison === "destinataire_different", "autorisation refusée si l'adresse montrée diffère", mauvais);
  const ok1 = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fA.id, p_destinataire: apercu.data.destinataire });
  verifier(ok1.data?.ok === true && ok1.data.deja_autorise === false, "autorisation acceptée", ok1);
  const ok2 = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fA.id, p_destinataire: apercu.data.destinataire });
  verifier(ok2.data?.ok === true && ok2.data.deja_autorise === true && ok2.data.notification === ok1.data.notification, "second clic : déjà autorisé, rien d'ajouté", ok2);
  const n = await etatNotif(fA.id);
  verifier(n.length === 1 && n[0].statut === "en_attente" && n[0].jeton && n[0].destinataire_valide === apercu.data.destinataire && n[0].empreinte_document, "une seule ligne, en_attente, avec jeton, destinataire et empreinte", n);
  const etat2 = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fA.id });
  verifier(etat2.data?.etat === "en_attente_envoi" && etat2.data.destinataire === apercu.data.destinataire, "état : en attente d'envoi, destinataire affiché", etat2);
}

console.log("\n3. Accueil : mêmes droits que pour un devis");
const accueil = await session(COMPTES.accueil);
{
  const etat = await rpc(accueil, "etat_envoi_facture", { p_facture_id: fB.id });
  verifier(etat.data?.ok && etat.data.etat === "a_valider", "état lisible", etat);
  const apercu = await rpc(accueil, "apercu_message_facture", { p_facture_id: fB.id });
  verifier(apercu.data?.ok === true, "aperçu lisible", apercu);
  const ok = await rpc(accueil, "autoriser_envoi_facture", { p_facture_id: fB.id, p_destinataire: apercu.data?.destinataire });
  verifier(ok.data?.ok === true && ok.data.deja_autorise === false, "autorisation acceptée", ok);
}

console.log("\n4. Refusés en base : mécanicien, membre révoqué, autre garage, sans session");
const anonyme = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const refuses = [
  ["mécanicien", await session(COMPTES.mecanicien)],
  ["membre révoqué", await session(COMPTES.revoque)],
  ["dirigeant d'un autre garage", await session(COMPTES.autreGarage)],
  ["sans session", anonyme],
];
for (const [nom, client] of refuses) {
  const etat = await rpc(client, "etat_envoi_facture", { p_facture_id: fC.id });
  verifier(etat.error || etat.data?.ok === false, `${nom} : état refusé`, etat);
  const apercu = await rpc(client, "apercu_message_facture", { p_facture_id: fC.id });
  verifier(apercu.error || apercu.data?.ok === false, `${nom} : aperçu refusé`, apercu);
  const aut = await rpc(client, "autoriser_envoi_facture", { p_facture_id: fC.id, p_destinataire: "client.recette.factures@nexora-recette.invalid" });
  verifier(Boolean(aut.error), `${nom} : autorisation refusée`, aut);
  const jeton = await rpc(client, "creer_jeton_facture", { p_facture_id: fC.id });
  verifier(Boolean(jeton.error), `${nom} : lien refusé`, jeton);
}
const nC = await etatNotif(fC.id);
verifier(nC.length === 1 && nC[0].statut === "sans_lien" && nC[0].jeton === null, "après ces refus, la facture C reste sans_lien", nC);

console.log("\n5. Une facture modifiée après autorisation est mise de côté, jamais envoyée en silence");
{
  const apercu = await rpc(dirigeant, "apercu_message_facture", { p_facture_id: fC.id });
  const ok = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fC.id, p_destinataire: apercu.data.destinataire });
  verifier(ok.data?.ok === true, "autorisation de C", ok);
  const maj = await admin.from("factures").update({ montant_ttc: 61 }).eq("id", fC.id);
  verifier(!maj.error, "montant de C modifié après autorisation", maj.error);
  // La réservation, bornée au garage synthétique : c'est la fonction même
  // qu'appelle le traitement. Elle met C de côté et réserve A et B.
  const reserve = await rpc(admin, "reserver_notifications", { p_file: "factures", p_limite: 10, p_garages: [GARAGE_A] });
  verifier(!reserve.error, "réservation bornée au garage A", reserve.error);
  const ids = (reserve.data || []).map((r) => r.doc_id);
  verifier(!ids.includes(fC.id), "C n'est pas réservée", ids);
  const etatC = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fC.id });
  verifier(etatC.data?.etat === "bloque" && /a changé depuis la validation/.test(etatC.data.motif || ""), "état de C : bloqué, motif explicite", etatC);
  const reval = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fC.id, p_destinataire: apercu.data.destinataire });
  verifier(reval.data?.ok === true && reval.data.deja_autorise === false, "C revalidée après relecture", reval);
  const nC2 = await etatNotif(fC.id);
  verifier(nC2.length === 1 && nC2[0].statut === "en_attente" && nC2[0].derniere_erreur === null, "C : même ligne, en_attente, motif effacé", nC2);

  console.log("\n6. Les états « envoi à vérifier » et « envoyé » (simulés, rien ne part)");
  const etatA = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fA.id });
  verifier(etatA.data?.etat === "envoi_en_cours", "A réservée : envoi à vérifier", etatA);
  const nA = await etatNotif(fA.id);
  const clos = await rpc(admin, "terminer_notification", { p_file: "factures", p_id: nA[0].id, p_resultat: "envoye", p_motif: null });
  verifier(!clos.error, "A close « envoyé » par le traitement (simulation, aucun message)", clos.error);
  const etatA2 = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fA.id });
  const nA2 = await etatNotif(fA.id);
  verifier(etatA2.data?.etat === "envoye" && nA2[0].jeton === null, "état de A : envoyé, jeton effacé", { etatA2, nA2 });
  const encore = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: fA.id, p_destinataire: "client.recette.factures@nexora-recette.invalid" });
  verifier(encore.data?.ok === false && encore.data.raison === "aucune_notification_en_attente", "A envoyée : plus rien à autoriser", encore);

  // Rien ne doit rester réservé ni en attente : B est close « bloqué » avec un
  // motif clair, C est remise de côté de la même façon.
  const nB = await etatNotif(fB.id);
  const closB = await rpc(admin, "terminer_notification", { p_file: "factures", p_id: nB[0].id, p_resultat: "bloque", p_motif: "recette du 12 septembre 2026 : jamais envoyé, fixture synthétique" });
  verifier(!closB.error, "B close « bloqué » (fixture)", closB.error);
  const nC3 = await etatNotif(fC.id);
  await admin.from("notifications_factures").update({ statut: "bloque", derniere_erreur: "recette du 12 septembre 2026 : jamais envoyé, fixture synthétique" }).eq("id", nC3[0].id);
  const etatB = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fB.id });
  verifier(etatB.data?.etat === "bloque", "état de B : bloqué (revalidable)", etatB);
}

console.log("\n7. Rien n'est resté en file pour le garage A");
{
  const { data } = await admin.from("notifications_factures").select("id, statut, factures!inner(garage_id)").eq("factures.garage_id", GARAGE_A).in("statut", ["en_attente", "envoi_en_cours"]);
  verifier((data || []).length === 0, "aucune notification de facture en attente ou en cours", data);
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
