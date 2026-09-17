// Bilan d'une recette sur de VRAIES factures — base TEST uniquement.
//
//   node scripts/recette/factures/bilan-reel.mjs <adresse du compte> [--depuis AAAA-MM-JJ] [--details]
//
// Pour chaque facture déposée sur ce compte, compare ce que Nexora a PROPOSÉ
// (auto_documents.lecture) à ce que la personne a CONFIRMÉ (intervention et
// document enregistrés). La confirmation sert de référence : une erreur que la
// personne n'a pas corrigée n'est pas vue.
//
// Classes par champ : extrait, errone, manque, absence_correcte, invente.
// Temps : dépôt → proposition → confirmation. Les factures sans lecture
// (photos, scans) donnent le temps d'une saisie manuelle, pour comparer.
//
// Par défaut, AUCUNE valeur n'est affichée (montants, garages, plaques) :
// seulement les classes et les durées. --details affiche les valeurs.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const args = process.argv.slice(2);
const adresse = args.find((a) => a.includes("@"));
const details = args.includes("--details");
const depuis = args[args.indexOf("--depuis") + 1] && args.includes("--depuis") ? args[args.indexOf("--depuis") + 1] : "2000-01-01";

function lireEnv() {
  const env = { ...process.env };
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

if (!adresse) {
  console.error("Usage : node scripts/recette/factures/bilan-reel.mjs <adresse du compte> [--depuis AAAA-MM-JJ] [--details]");
  process.exit(1);
}
const env = lireEnv();
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : la base n'est pas la base Test.");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: utilisateurs, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) throw error;
const utilisateur = utilisateurs.users.find((u) => u.email === adresse);
if (!utilisateur) {
  console.error("Compte introuvable sur Test.");
  process.exit(1);
}
const { data: vehicules } = await admin.from("auto_vehicules").select("id, marque, modele").eq("proprietaire_id", utilisateur.id);
const ids = vehicules.map((v) => v.id);
const { data: documents } = await admin
  .from("auto_documents")
  .select("id, vehicule_id, type, type_mime, date_document, historique_id, lecture, created_at")
  .in("vehicule_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
  .gte("created_at", depuis)
  .order("created_at");
const historiqueIds = documents.map((d) => d.historique_id).filter(Boolean);
const { data: historique } = await admin
  .from("auto_historique")
  .select("id, type, realise_le, kilometrage, prestataire, montant_ttc, operations, saisie, created_at")
  .in("id", historiqueIds.length ? historiqueIds : ["00000000-0000-0000-0000-000000000000"]);
const { data: lectures } = await admin
  .from("auto_lectures")
  .select("document_id, fournisseur, statut, facturation, erreur, duree_ms, created_at, confirmee_le, corrections, cout_estime_micro_usd")
  .in("document_id", documents.map((d) => d.id).concat("00000000-0000-0000-0000-000000000000"));

const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const secondes = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 100) / 10 : null);

function classe(propose, confirme, egal = (a, b) => a === b) {
  const p = propose ?? null;
  const c = confirme ?? null;
  if (p == null && c == null) return "absence_correcte";
  if (p == null) return "manque";
  if (c == null) return "invente";
  return egal(p, c) ? "extrait" : "errone";
}

const total = { presents: 0, extrait: 0, errone: 0, manque: 0, absence_correcte: 0, invente: 0 };
const lignes = [];
const tempsLus = [];
const tempsManuels = [];

for (const d of documents) {
  const h = historique.find((x) => x.id === d.historique_id);
  const l = lectures.filter((x) => x.document_id === d.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const ligne = { document: d.id.slice(0, 8), format: d.type_mime, etat: "", champs: {}, secondes: {} };
  if (d.type !== "facture") ligne.etat = "gardé comme document";
  else if (!h) ligne.etat = "non confirmée";
  else if (h.saisie !== "document" && d.lecture) ligne.etat = "rattachée à une intervention existante";
  else ligne.etat = d.lecture ? "confirmée après proposition" : "saisie manuelle";

  if (d.lecture && h && h.saisie === "document") {
    const c = d.lecture.champs;
    const dateIntervention = c.dateIntervention?.valeur ?? c.dateFacture?.valeur ?? null;
    const champs = {
      dateFacture: classe(c.dateFacture?.valeur, d.date_document),
      dateIntervention: classe(dateIntervention, h.realise_le),
      professionnel: classe(c.professionnel?.valeur, h.prestataire, (a, b) => norm(a) === norm(b)),
      kilometrage: classe(c.kilometrage?.valeur, h.kilometrage),
      montantTtc: classe(c.montantTtc?.valeur, h.montant_ttc == null ? null : Number(h.montant_ttc), (a, b) => Math.round(a * 100) === Math.round(b * 100)),
    };
    for (const [nom, k] of Object.entries(champs)) {
      total[k]++;
      if (k !== "absence_correcte" && k !== "invente") total.presents++;
      ligne.champs[nom] = details
        ? { classe: k, propose: nom === "dateIntervention" ? dateIntervention : c[nom]?.valeur ?? null, confirme: { dateFacture: d.date_document, dateIntervention: h.realise_le, professionnel: h.prestataire, kilometrage: h.kilometrage, montantTtc: h.montant_ttc }[nom] ?? null }
        : k;
    }
    const typesProposes = (d.lecture.operations ?? []).map((o) => o.type).sort();
    const typesConfirmes = (h.operations ?? []).map((o) => o.type).sort();
    ligne.operations = { proposees: typesProposes.length, confirmees: typesConfirmes.length, identiques: JSON.stringify(typesProposes) === JSON.stringify(typesConfirmes) };
    ligne.corrections = l?.corrections ?? null;
    ligne.secondes = { lecture: l?.duree_ms != null ? l.duree_ms / 1000 : null, depotAConfirmation: secondes(d.created_at, l?.confirmee_le ?? h.created_at) };
    if (ligne.secondes.depotAConfirmation != null) tempsLus.push(ligne.secondes.depotAConfirmation);
  } else if (h && !d.lecture) {
    ligne.secondes = { depotAConfirmation: secondes(d.created_at, h.created_at) };
    if (ligne.secondes.depotAConfirmation != null) tempsManuels.push(ligne.secondes.depotAConfirmation);
  }
  if (l && !d.lecture) ligne.lecture = `${l.statut}${l.erreur ? `/${l.erreur}` : ""}`;
  lignes.push(ligne);
}

const moyenne = (t) => (t.length ? Math.round((t.reduce((s, x) => s + x, 0) / t.length) * 10) / 10 : null);
console.log(JSON.stringify({
  compte: adresse,
  depuis,
  documents: documents.length,
  champs: total,
  tempsMoyenDepotAConfirmationSecondes: { avecProposition: moyenne(tempsLus), saisieManuelle: moyenne(tempsManuels) },
  lecturesFacturees: lectures.filter((l) => l.facturation === "facturee").length,
  factures: lignes,
}, null, 2));
