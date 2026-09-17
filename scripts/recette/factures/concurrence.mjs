// Confirmations simultanées d'une facture — base TEST uniquement, données fictives.
//
//   node scripts/recette/factures/concurrence.mjs [tours=20]
//
// Deux appareils (ou deux onglets) confirment en même temps :
// A. la MÊME facture : une seule intervention, l'autre appel reçoit
//    « facture déjà enregistrée » ;
// B. deux fichiers DIFFÉRENTS de la même facture (PDF et photo), même date et
//    même montant, sans choix « créer une autre intervention » : une seule
//    intervention, l'autre appel reçoit « intervention ressemblante » ;
//    aucune dépense comptée deux fois.
// C. deux interventions RÉELLEMENT distinctes (même date, même montant) : la
//    seconde est d'abord signalée comme ressemblante, puis créée quand la
//    personne choisit « Créer une autre intervention » ; et deux confirmations
//    simultanées avec ce choix explicite créent bien deux interventions. Le
//    verrou ordonne, il ne fusionne jamais.
//
// Compte fictif en .invalid créé puis supprimé avec ses fichiers. Aucun
// e-mail, aucune lecture automatique. Refus hors de la base Test.

import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const TOURS = Math.max(1, Math.min(100, Number(process.argv[2]) || 20));

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

const email = `recette.concurrence.${Date.now()}@nexora-recette.invalid`;
const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
if (creation.error) throw creation.error;
const utilisateurId = creation.data.user.id;
// Bêta privée (20260922001100) : le compte fictif est invité le temps de la recette.
await admin.from("auto_acces_beta").upsert({ email: email.toLowerCase(), note: "recette automatique (Test)" });
const chemins = [];

try {
  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error("Session de recette impossible.");
  // Deux « appareils » : deux clients, deux connexions.
  const appareil = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });
  const [a, b] = [appareil(), appareil()];

  const { data: vehiculeId, error } = await a.rpc("auto_ajouter_vehicule", {
    p_marque: "Peugeot", p_modele: "208", p_annee: 2020, p_energie: "essence", p_immatriculation: null,
    p_date_mise_en_circulation: null, p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  if (error) throw error;

  async function deposer(contenu) {
    const octets = new TextEncoder().encode(`%PDF-1.4\n% facture fictive ${contenu}\n%%EOF`);
    const chemin = `${utilisateurId}/${vehiculeId}/${randomUUID()}.pdf`;
    const depot = await a.storage.from("auto-documents").upload(chemin, octets, { contentType: "application/pdf" });
    if (depot.error) throw depot.error;
    chemins.push(chemin);
    const { data, error: e } = await a
      .from("auto_documents")
      .insert({ vehicule_id: vehiculeId, type: "facture", chemin, nom_fichier: "facture-fictive.pdf", type_mime: "application/pdf", taille_octets: octets.length, empreinte_sha256: createHash("sha256").update(octets).digest("hex") })
      .select("id")
      .single();
    if (e) throw e;
    return data.id;
  }

  const confirmer = (client, documentId, realiseLe, { creer = false } = {}) =>
    client.rpc("auto_enregistrer_facture", {
      p_document_id: documentId, p_rattacher_a: null, p_realise_le: realiseLe, p_date_facture: realiseLe, p_type: "vidange",
      p_operations: [{ type: "vidange", libelle: "Vidange moteur" }], p_prestataire: "Garage fictif", p_kilometrage: 42000,
      p_montant_ttc: 129.9, p_libelle: "Vidange moteur", p_creer_malgre_ressemblance: creer, p_lecture_id: null, p_corrections: null,
    });
  const code = (r) => (r.error ? (r.error.message.match(/\((auto_[a-z_]+)\)/)?.[1] ?? r.error.message) : "ok");

  const bilan = { A: { tours: 0, uneSeule: 0, issues: {} }, B: { tours: 0, uneSeule: 0, issues: {} }, C: { tours: 0, deux: 0, issues: {} } };
  const noter = (cas, resultats, interventions) => {
    bilan[cas].tours += 1;
    if (interventions === 1) bilan[cas].uneSeule += 1;
    const cle = resultats.map(code).sort().join(" + ");
    bilan[cas].issues[cle] = (bilan[cas].issues[cle] ?? 0) + 1;
  };
  const compter = async (realiseLe) => (await admin.from("auto_historique").select("id", { count: "exact", head: true }).eq("vehicule_id", vehiculeId).eq("realise_le", realiseLe)).count;

  for (let tour = 0; tour < TOURS; tour += 1) {
    const jour = new Date(Date.UTC(2025, 0, 1 + tour * 2)).toISOString().slice(0, 10);
    const lendemain = new Date(Date.UTC(2025, 0, 2 + tour * 2)).toISOString().slice(0, 10);

    const meme = await deposer(`A-${tour}`);
    noter("A", await Promise.all([confirmer(a, meme, jour), confirmer(b, meme, jour)]), await compter(jour));

    const [pdf, photo] = [await deposer(`B-${tour}-pdf`), await deposer(`B-${tour}-photo`)];
    noter("B", await Promise.all([confirmer(a, pdf, lendemain), confirmer(b, photo, lendemain)]), await compter(lendemain));
  }

  // C. Deux interventions distinctes, même date, même montant.
  const toursC = Math.max(1, Math.round(TOURS / 2));
  for (let tour = 0; tour < toursC; tour += 1) {
    const sequentiel = new Date(Date.UTC(2024, 0, 1 + tour * 2)).toISOString().slice(0, 10);
    const simultane = new Date(Date.UTC(2024, 0, 2 + tour * 2)).toISOString().slice(0, 10);
    const [premier, second] = [await deposer(`C-${tour}-1`), await deposer(`C-${tour}-2`)];
    const r1 = await confirmer(a, premier, sequentiel);
    const r2 = await confirmer(a, second, sequentiel);
    const r3 = await confirmer(a, second, sequentiel, { creer: true });
    const [d1, d2] = [await deposer(`C-${tour}-3`), await deposer(`C-${tour}-4`)];
    const simultanes = await Promise.all([confirmer(a, d1, simultane, { creer: true }), confirmer(b, d2, simultane, { creer: true })]);
    bilan.C.tours += 1;
    const cle = `${[r1, r2, r3].map(code).join(" > ")} | ${simultanes.map(code).sort().join(" + ")}`;
    bilan.C.issues[cle] = (bilan.C.issues[cle] ?? 0) + 1;
    if (code(r1) === "ok" && code(r2) === "auto_doublon_potentiel" && code(r3) === "ok" && (await compter(sequentiel)) === 2 && simultanes.every((r) => !r.error) && (await compter(simultane)) === 2) bilan.C.deux += 1;
  }

  const { data: depenses } = await admin.from("auto_historique").select("montant_ttc").eq("vehicule_id", vehiculeId);
  const attendues = TOURS * 2 + toursC * 4;
  console.log(JSON.stringify({ tours: TOURS, ...bilan, interventions: depenses.length, attendues }, null, 2));
  const ok = bilan.A.uneSeule === TOURS && bilan.B.uneSeule === TOURS && bilan.C.deux === toursC && depenses.length === attendues;
  console.log(
    ok
      ? "RÉSULTAT : aucun doublon involontaire, et les interventions distinctes choisies explicitement sont bien créées."
      : "RÉSULTAT : ÉCART constaté (doublon involontaire, ou intervention distincte refusée).",
  );
  process.exitCode = ok ? 0 : 3;
} finally {
  for (let i = 0; i < chemins.length; i += 100) await admin.storage.from("auto-documents").remove(chemins.slice(i, i + 100));
  await admin.from("auto_acces_beta").delete().eq("email", email.toLowerCase());
  await admin.auth.admin.deleteUser(utilisateurId);
  const reste = await admin.from("auto_vehicules").select("id", { count: "exact", head: true }).eq("proprietaire_id", utilisateurId);
  console.log(`Nettoyage : compte supprimé, ${chemins.length} fichiers retirés, voitures restantes : ${reste.count}.`);
}
