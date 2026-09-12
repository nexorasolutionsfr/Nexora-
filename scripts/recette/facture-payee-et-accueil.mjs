// Recette : « Marquer payée » n'envoie rien, et l'accueil gère les factures.
//
// Ce que ce script prouve, sur Supabase TEST et des données fictives :
//
//   1. marquer une facture payée ne crée aucune notification, quelle que soit
//      la situation de départ — le déclencheur `notifier_facture_payee` a été
//      supprimé (20260916000200) ;
//   2. une facture sans envoi programmé : rien à mettre de côté, rien ne part ;
//   3. une facture dont l'envoi était **programmé** : la ligne passe `bloque`
//      avec un motif lisible, dans la même transaction que le paiement, et la
//      réservation ne la prend plus ;
//   4. un envoi **en cours** n'est jamais touché : il est signalé, pas rejoué,
//      pas déclaré bloqué ;
//   5. double clic : le second appel ne change rien et le dit ;
//   6. droits : dirigeant et accueil acceptés ; mécanicien, salarié révoqué,
//      autre garage et visiteur sans session refusés en base ;
//   7. l'accueil lit, crée et modifie les factures de son garage — et ne peut
//      ni les supprimer, ni voir celles d'un autre garage.
//
// Garde-fous, dans cet ordre : refus hors projet Test ; comptes synthétiques
// `…@nexora-recette.invalid` seulement ; aucun envoi (rien ne lit la file de
// Test, et la ligne réservée ici est close avant la fin du script).
//
// Usage : node scripts/recette/facture-payee-et-accueil.mjs
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
const GARAGE_B = "ceabbbcc-4b44-45fe-a58d-4667cefaaf27"; // Garage Recette Dix Minutes (autre garage)
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
  else { echecs += 1; console.log(`  ✖ ${libelle}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

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

async function notifs(factureId) {
  const { data } = await admin
    .from("notifications_factures")
    .select("id, type, statut, envoye, jeton, destinataire_valide, derniere_erreur, tentatives")
    .eq("facture_id", factureId)
    .order("created_at");
  return data || [];
}

async function facture(id) {
  const { data } = await admin.from("factures").select("id, numero, statut, date_paiement, montant_ttc").eq("id", id).maybeSingle();
  return data;
}

async function clientEtVoiture(garageId, suffixe) {
  const email = `client.recette.payee.${suffixe}@nexora-recette.invalid`;
  let { data: c } = await admin.from("clients").select("id").eq("garage_id", garageId).eq("email", email).maybeSingle();
  if (!c) {
    const r = await admin.from("clients").insert({ garage_id: garageId, nom: `Client Recette Payée ${suffixe}`, email, telephone: "0600000002" }).select("id").single();
    if (r.error) throw new Error(`client : ${r.error.message}`);
    c = r.data;
  }
  const immat = `DEMO-PAY-${suffixe.toUpperCase()}`;
  let { data: v } = await admin.from("vehicules").select("id").eq("garage_id", garageId).eq("immatriculation", immat).maybeSingle();
  if (!v) {
    const r = await admin.from("vehicules").insert({ garage_id: garageId, client_id: c.id, marque: "Fiat", modele: "Panda", immatriculation: immat }).select("id").single();
    if (r.error) throw new Error(`véhicule : ${r.error.message}`);
    v = r.data;
  }
  return { client: c, vehicule: v };
}

async function creerFacture(garageId, suffixe, montantHt) {
  const { client, vehicule } = await clientEtVoiture(garageId, suffixe);
  const lignes = [{ type: "main_oeuvre", description: `Recette payée ${suffixe}`, quantite: 1, prix_unitaire_ht: montantHt, taux_tva: 20, montant_ht: montantHt, montant_tva: montantHt * 0.2, montant_ttc: montantHt * 1.2 }];
  const r = await admin
    .from("factures")
    .insert({ garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, motif: `Recette payée ${suffixe}`, lignes, montant_ht: montantHt, montant_ttc: Math.round(montantHt * 1.2 * 100) / 100, statut: "en_attente" })
    .select("id, numero")
    .single();
  if (r.error) throw new Error(`facture : ${r.error.message}`);
  return { ...r.data, clientEmail: `client.recette.payee.${suffixe}@nexora-recette.invalid` };
}

// ---------------------------------------------------------------------------
console.log("Fixtures (garage synthétique « Apres »)");
const dirigeant = await session(COMPTES.dirigeant);
const accueil = await session(COMPTES.accueil);

const fSans = await creerFacture(GARAGE_A, "sans", 40);      // notification retirée : aucune ligne
const fDormante = await creerFacture(GARAGE_A, "dormante", 50); // reste `sans_lien`
const fArmee = await creerFacture(GARAGE_A, "armee", 60);     // envoi autorisé, donc `en_attente`
const fIncertaine = await creerFacture(GARAGE_A, "incertaine", 70); // réservée, donc `envoi_en_cours`
await admin.from("notifications_factures").delete().eq("facture_id", fSans.id);
console.log(`  ${fSans.numero} (aucune notification), ${fDormante.numero} (sans_lien), ${fArmee.numero} (à armer), ${fIncertaine.numero} (à réserver)`);

for (const f of [fArmee, fIncertaine]) {
  const a = await rpc(dirigeant, "autoriser_envoi_facture", { p_facture_id: f.id, p_destinataire: f.clientEmail });
  if (!a.data?.ok) { console.error("préparation impossible :", JSON.stringify(a)); process.exit(1); }
}
const reserve = await rpc(admin, "reserver_notifications", { p_file: "factures", p_limite: 10, p_garages: [GARAGE_A] });
const reservees = (reserve.data || []).map((r) => r.doc_id);
if (!reservees.includes(fIncertaine.id)) { console.error("la ligne incertaine n'a pas été réservée"); process.exit(1); }
// La facture « armée » a pu être réservée elle aussi : on la remet en file,
// c'est l'état dont on veut prouver la mise à l'écart au paiement.
if (reservees.includes(fArmee.id)) {
  const n = (await notifs(fArmee.id)).find((x) => x.statut === "envoi_en_cours");
  await rpc(admin, "terminer_notification", { p_file: "factures", p_id: n.id, p_resultat: "a_reprendre", p_motif: null });
}
console.log("  états de départ :", JSON.stringify({
  sans: (await notifs(fSans.id)).length,
  dormante: (await notifs(fDormante.id))[0]?.statut,
  armee: (await notifs(fArmee.id))[0]?.statut,
  incertaine: (await notifs(fIncertaine.id))[0]?.statut,
}));

console.log("\n1. Facture sans aucune notification : rien n'est créé, rien ne part");
{
  const r = await rpc(dirigeant, "marquer_facture_payee", { p_facture_id: fSans.id });
  verifier(r.data?.ok === true && r.data.deja_payee === false, "marquée payée", r);
  verifier(r.data?.envois_mis_de_cote === 0 && r.data?.envoi_incertain === false, "aucun envoi à mettre de côté, aucun incertain", r.data);
  verifier((await facture(fSans.id)).statut === "payee", "statut payée en base");
  verifier((await notifs(fSans.id)).length === 0, "aucune notification créée par le paiement", await notifs(fSans.id));
}

console.log("\n2. Facture dont l'envoi n'était pas armé : la ligne dormante reste intacte");
{
  const avant = (await notifs(fDormante.id))[0];
  const r = await rpc(dirigeant, "marquer_facture_payee", { p_facture_id: fDormante.id });
  verifier(r.data?.ok === true && r.data.envois_mis_de_cote === 0, "rien à mettre de côté", r.data);
  const apres = await notifs(fDormante.id);
  verifier(apres.length === 1 && apres[0].id === avant.id && apres[0].statut === "sans_lien" && apres[0].derniere_erreur === null,
    "la ligne `sans_lien` est inchangée, et aucune ligne `payee` n'est apparue", apres);
}

console.log("\n3. Facture dont l'envoi était programmé : mis de côté, dans la même transaction");
{
  const avant = (await notifs(fArmee.id))[0];
  verifier(avant.statut === "en_attente" && avant.jeton !== null, "au départ : en attente d'envoi, avec jeton", avant.statut);
  const r = await rpc(dirigeant, "marquer_facture_payee", { p_facture_id: fArmee.id });
  verifier(r.data?.ok === true && r.data.envois_mis_de_cote === 1, "un envoi mis de côté", r.data);
  const apres = (await notifs(fArmee.id))[0];
  verifier(apres.id === avant.id && apres.statut === "bloque" && apres.envoye === false,
    "même ligne, passée `bloque`, jamais envoyée", apres);
  verifier(/marquée payée avant l'envoi/.test(apres.derniere_erreur || ""), "motif explicite, pas « a changé depuis la validation »", apres.derniere_erreur);
  const etat = await rpc(dirigeant, "etat_envoi_facture", { p_facture_id: fArmee.id });
  verifier(etat.data?.etat === "bloque", "l'écran dira « bloqué »", etat.data);
  // Et la réservation ne la reprend pas : rien ne partira tout seul.
  const r2 = await rpc(admin, "reserver_notifications", { p_file: "factures", p_limite: 10, p_garages: [GARAGE_A] });
  verifier(!(r2.data || []).map((x) => x.doc_id).includes(fArmee.id), "la réservation ne la reprend pas", r2.data);
}

console.log("\n4. Envoi en cours au moment du paiement : signalé, jamais touché");
{
  const avant = (await notifs(fIncertaine.id))[0];
  verifier(avant.statut === "envoi_en_cours", "au départ : envoi en cours", avant.statut);
  const r = await rpc(dirigeant, "marquer_facture_payee", { p_facture_id: fIncertaine.id });
  verifier(r.data?.ok === true && r.data.envoi_incertain === true, "le paiement signale l'envoi incertain", r.data);
  verifier(r.data?.envois_mis_de_cote === 0, "il n'est pas compté comme mis de côté", r.data);
  const apres = (await notifs(fIncertaine.id))[0];
  verifier(apres.statut === "envoi_en_cours" && apres.tentatives === avant.tentatives && apres.jeton === avant.jeton && apres.derniere_erreur === avant.derniere_erreur,
    "la ligne est rigoureusement inchangée : ni rejouée, ni déclarée bloquée", apres);
  verifier((await facture(fIncertaine.id)).statut === "payee", "la facture est bien payée malgré tout");
}

console.log("\n5. Double clic : le second appel ne change rien et le dit");
{
  const avant = await facture(fArmee.id);
  const avantNotif = (await notifs(fArmee.id))[0];
  const r = await rpc(dirigeant, "marquer_facture_payee", { p_facture_id: fArmee.id });
  verifier(r.data?.ok === true && r.data.deja_payee === true, "second appel : déjà payée", r.data);
  verifier(r.data?.envois_mis_de_cote === 0, "rien remis de côté une seconde fois", r.data);
  const apres = await facture(fArmee.id);
  verifier(apres.date_paiement === avant.date_paiement, "la date de paiement n'a pas bougé", { avant: avant.date_paiement, apres: apres.date_paiement });
  const apresNotif = (await notifs(fArmee.id))[0];
  verifier(apresNotif.statut === avantNotif.statut && apresNotif.derniere_erreur === avantNotif.derniere_erreur, "la file n'a pas bougé non plus");
}

console.log("\n6. Droits sur « Marquer payée »");
{
  const fAccueil = await creerFacture(GARAGE_A, "accueil", 80);
  const r = await rpc(accueil, "marquer_facture_payee", { p_facture_id: fAccueil.id });
  verifier(r.data?.ok === true && r.data.deja_payee === false, "accueil : accepté", r);
  verifier((await facture(fAccueil.id)).statut === "payee", "accueil : la facture est payée");

  const fRefus = await creerFacture(GARAGE_A, "refus", 90);
  const anonyme = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const refuses = [
    ["mécanicien", await session(COMPTES.mecanicien)],
    ["membre révoqué", await session(COMPTES.revoque)],
    ["dirigeant d'un autre garage", await session(COMPTES.autreGarage)],
    ["sans session", anonyme],
  ];
  for (const [nom, c] of refuses) {
    const rr = await rpc(c, "marquer_facture_payee", { p_facture_id: fRefus.id });
    verifier(Boolean(rr.error), `${nom} : refusé`, rr);
  }
  verifier((await facture(fRefus.id)).statut === "en_attente", "après ces refus, la facture n'est pas payée");
}

console.log("\n7. L'accueil gère les factures de son garage, et rien d'autre");
{
  const { data: lues, error: erreurLecture } = await accueil.from("factures").select("id, numero, garage_id");
  verifier(!erreurLecture && (lues || []).length > 0, "accueil : lit les factures de son garage", erreurLecture || (lues || []).length);
  verifier((lues || []).every((f) => f.garage_id === GARAGE_A), "accueil : aucune facture d'un autre garage", [...new Set((lues || []).map((f) => f.garage_id))]);

  const { client, vehicule } = await clientEtVoiture(GARAGE_A, "parlaccueil");
  const creation = await accueil
    .from("factures")
    .insert({ garage_id: GARAGE_A, client_id: client.id, vehicule_id: vehicule.id, motif: "Facture établie par l'accueil", lignes: [{ type: "main_oeuvre", description: "Recette accueil", quantite: 1, prix_unitaire_ht: 30, taux_tva: 20 }], montant_ht: 30, montant_ttc: 36, statut: "en_attente" })
    .select("id, numero")
    .single();
  verifier(!creation.error && creation.data?.numero, "accueil : crée une facture", creation.error);

  if (creation.data) {
    const maj = await accueil.from("factures").update({ motif: "Motif corrigé au comptoir" }).eq("id", creation.data.id).select("id, motif");
    verifier(!maj.error && maj.data?.[0]?.motif === "Motif corrigé au comptoir", "accueil : modifie une facture", maj.error || maj.data);

    const suppression = await accueil.from("factures").delete().eq("id", creation.data.id).select("id");
    verifier((suppression.data || []).length === 0, "accueil : ne supprime pas une facture", suppression);
    verifier(Boolean(await facture(creation.data.id)), "la facture est toujours là après la tentative de suppression");

    // Le parcours d'envoi complet, du comptoir.
    const apercu = await rpc(accueil, "apercu_message_facture", { p_facture_id: creation.data.id });
    verifier(apercu.data?.ok === true, "accueil : prépare le message", apercu);
    const jeton = await rpc(accueil, "creer_jeton_facture", { p_facture_id: creation.data.id });
    verifier(!jeton.error && typeof jeton.data === "string", "accueil : produit le lien", jeton.error);
    const revoc = await rpc(accueil, "revoquer_jeton_facture", { p_facture_id: creation.data.id });
    verifier(revoc.data === true, "accueil : révoque le lien qu'il a produit", revoc);
    const autor = await rpc(accueil, "autoriser_envoi_facture", { p_facture_id: creation.data.id, p_destinataire: apercu.data.destinataire });
    verifier(autor.data?.ok === true, "accueil : autorise l'envoi", autor);
    // Et il le remet de côté en encaissant : la boucle complète, sans envoi.
    const paiement = await rpc(accueil, "marquer_facture_payee", { p_facture_id: creation.data.id });
    verifier(paiement.data?.envois_mis_de_cote === 1, "accueil : encaisser met l'envoi de côté", paiement.data);
  }

  for (const [nom, email] of [["mécanicien", COMPTES.mecanicien], ["membre révoqué", COMPTES.revoque], ["dirigeant d'un autre garage", COMPTES.autreGarage]]) {
    const c = await session(email);
    const { data } = await c.from("factures").select("id").eq("garage_id", GARAGE_A);
    verifier((data || []).length === 0, `${nom} : aucune facture du garage A`, (data || []).length);
  }
  const dirigeantB = await session(COMPTES.autreGarage);
  const { client: clientB } = await clientEtVoiture(GARAGE_B, "autre");
  const intrusion = await accueil
    .from("factures")
    .insert({ garage_id: GARAGE_B, client_id: clientB.id, motif: "intrusion", lignes: [], montant_ht: 1, montant_ttc: 1, statut: "en_attente" })
    .select("id");
  verifier(Boolean(intrusion.error), "accueil : ne crée pas de facture dans un autre garage", intrusion.error?.code);
  const { data: vuesParB } = await dirigeantB.from("factures").select("id, garage_id");
  verifier((vuesParB || []).every((f) => f.garage_id === GARAGE_B), "le garage B ne voit que ses propres factures", [...new Set((vuesParB || []).map((f) => f.garage_id))]);
}

console.log("\n8. Aucune notification de paiement nulle part, et rien d'armé en fin de course");
{
  const { data: payees } = await admin.from("notifications_factures").select("id").eq("type", "payee");
  verifier((payees || []).length === 0, "aucune notification de type « payee » sur tout le projet Test", (payees || []).length);

  // La ligne incertaine est close proprement : elle n'a rien envoyé et ne
  // doit pas rester réservée.
  const incertaine = (await notifs(fIncertaine.id)).find((n) => n.statut === "envoi_en_cours");
  if (incertaine) {
    await rpc(admin, "terminer_notification", { p_file: "factures", p_id: incertaine.id, p_resultat: "bloque", p_motif: "recette du 12 septembre 2026 : jamais envoyé, fixture synthétique" });
  }
  const { data: enFile } = await admin
    .from("notifications_factures")
    .select("id, statut, factures!inner(garage_id)")
    .eq("factures.garage_id", GARAGE_A)
    .in("statut", ["en_attente", "envoi_en_cours"]);
  verifier((enFile || []).length === 0, "aucune notification en attente ou en cours pour le garage A", enFile);
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
