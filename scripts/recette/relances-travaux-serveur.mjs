// Recette SERVEUR du suivi partagé et des relances de travaux différés — TEST.
//
// Joue, sous de vraies sessions, la chaîne complète sans n8n ni fournisseur :
//   candidat → brouillon à relire → autorisation → réservation → résultat.
// Le « transport » est ici un faux fournisseur (le script lui-même) : la ligne
// finit `envoye` avec un motif qui dit que rien de réel n'est parti.
//
//   A. suivi partagé : l'accueil marque « traité », le dirigeant le voit ;
//      l'accueil révoqué ne voit rien ; l'auteur est conservé.
//   B. préparation : trois travaux (échu, futur, clos) → une relance pour
//      l'échu seulement ; second passage → rien ; report → obsolète + rien
//      avant la nouvelle date ; clôture → annulée.
//   C. gestes : accueil lit le brouillon, le corrige, autorise (mauvais
//      destinataire refusé) ; révoqué refusé ; mécanicien refusé.
//   D. réservation : texte modifié après autorisation → bloqué ; ré-autorisé
//      → réservé (envoi_en_cours) ; une seconde réservation ne le reprend pas ;
//      terminer 'a_reprendre' → en_attente ; réservé → 'envoye' (simulé).
//
// Usage : node scripts/recette/relances-travaux-serveur.mjs <garage_id>
//
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(RACINE + "/.env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes("slawilafseganlbghgwx")) { console.error("REFUS : pas le projet Test."); process.exit(2); }
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const garageId = process.argv[2];
if (!garageId) { console.error("Usage : relances-travaux-serveur.mjs <garage_id>"); process.exit(1); }

let total = 0, ok = 0;
const verifier = (libelle, cond, detail = "") => { total++; if (cond) { ok++; console.log(`  ✔ ${libelle}`); } else console.log(`  ✖ ${libelle}${detail ? " — " + detail : ""}`); };
async function session(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = anonClient();
  const { error: e2 } = await c.auth.verifyOtp({ email, token: data.properties.email_otp, type: "email" });
  if (e2) throw e2;
  return c;
}
const jour = (decalage) => { const d = new Date(); d.setDate(d.getDate() + decalage); return d.toISOString().slice(0, 10); };

const { data: garage } = await admin.from("garages").select("id, nom_garage").eq("id", garageId).single();
if (!garage?.nom_garage?.startsWith("PROTO Constat")) { console.error("REFUS : pas un garage « PROTO Constat »."); process.exit(2); }
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const { data: membres } = await admin.from("garage_membres").select("user_id, role, actif").eq("garage_id", garageId);
const idDe = (role, actif = true) => membres.find((m) => m.role === role && m.actif === actif)?.user_id;
const emailDe = (role, actif = true) => users.users.find((u) => u.id === idDe(role, actif))?.email;
const dirigeant = await session(emailDe("dirigeant"));
const accueil = await session(emailDe("accueil"));
const revoque = await session(emailDe("accueil", false));
const mecano = await session(emailDe("mecanicien"));
const { data: vehicule } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).eq("immatriculation", "BA-101-AA").single();
const { data: client } = await admin.from("clients").select("id, email").eq("id", vehicule.client_id).single();
const preparer = () => admin.rpc("preparer_relances_travaux", { p_garages: [garageId] });
const relancesDe = async (travailId) => (await admin.from("relances_travaux").select("*").eq("travail_differe_id", travailId).order("created_at")).data || [];

console.log(`Garage ${garage.nom_garage}\n`);

// A. Suivi partagé.
console.log("A. Suivi partagé (opportunites_actions)");
{
  const { data: t } = await dirigeant.from("travaux_differes").insert({ garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, intervention: "Suivi partagé (recette)", niveau: "normal", statut: "a_relancer", date_relance: jour(-1), source: "manuel" }).select("id").single();
  const { error: eIns } = await accueil.from("opportunites_actions").insert({ garage_id: garageId, source_type: "travail_differe", source_id: t.id, action: "traite" });
  verifier("l'accueil enregistre « traité »", !eIns, eIns?.message);
  const { data: vuParDirigeant } = await dirigeant.from("opportunites_actions").select("id, effectue_par").eq("garage_id", garageId).eq("source_id", t.id);
  verifier("le dirigeant voit ce geste, avec son auteur (l'accueil)", vuParDirigeant?.length === 1 && vuParDirigeant[0].effectue_par === idDe("accueil"));
  const { data: vuParRevoque } = await revoque.from("opportunites_actions").select("id").eq("garage_id", garageId);
  verifier("l'accueil révoqué ne voit rien", (vuParRevoque || []).length === 0);
  const { error: eRev } = await revoque.from("opportunites_actions").insert({ garage_id: garageId, source_type: "travail_differe", source_id: t.id, action: "traite" });
  verifier("l'accueil révoqué n'écrit pas", Boolean(eRev));
  const { data: vuParMecano } = await mecano.from("opportunites_actions").select("id").eq("garage_id", garageId);
  verifier("le mécanicien ne voit rien", (vuParMecano || []).length === 0);
  await admin.from("opportunites_actions").delete().eq("source_id", t.id);
  await dirigeant.from("travaux_differes").delete().eq("id", t.id);
}

// B. Préparation.
console.log("B. Préparation des relances");
const { data: travaux } = await dirigeant.from("travaux_differes").insert([
  { garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, intervention: "Pneus arrière à remplacer (recette)", niveau: "important", statut: "a_relancer", date_relance: jour(-2), montant_ttc: 180, source: "manuel" },
  { garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, intervention: "Vidange dans 6 mois (recette)", niveau: "normal", statut: "planifie", date_relance: jour(30), source: "manuel" },
  { garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, intervention: "Clos (recette)", niveau: "normal", statut: "recupere", date_relance: jour(-5), source: "manuel" },
]).select("id, intervention, date_relance");
const [echu, futur, clos] = travaux;
{
  const p1 = await preparer();
  verifier("premier passage : une relance préparée, pour le travail échu seulement", !p1.error && p1.data.length === 1 && p1.data[0].action === "preparee" && p1.data[0].travail_id === echu.id, JSON.stringify(p1.data || p1.error));
  const p2 = await preparer();
  verifier("second passage : rien", !p2.error && p2.data.length === 0, JSON.stringify(p2.data));
  const [r] = await relancesDe(echu.id);
  verifier("la relance est à_relire, avec sujet et texte composés en base", r?.statut === "a_relire" && /Un point sur votre/.test(r.sujet) && /Pneus arrière/.test(r.texte) && /180/.test(r.texte), r?.sujet);
  verifier("aucune relance pour le futur ni pour le clos", (await relancesDe(futur.id)).length === 0 && (await relancesDe(clos.id)).length === 0);

  // Report : la relance devient obsolète, rien n'est préparé avant la nouvelle date.
  await dirigeant.from("travaux_differes").update({ date_relance: jour(10) }).eq("id", echu.id);
  const p3 = await preparer();
  verifier("report → la relance passe obsolète, aucune nouvelle avant la nouvelle date", p3.data?.some((x) => x.action === "obsolete" && x.relance_id === r.id) && !p3.data.some((x) => x.action === "preparee"), JSON.stringify(p3.data));
  verifier("motif du report lisible", /reporté/.test((await relancesDe(echu.id))[0].motif || ""));
  // Retour à une échéance passée : nouvelle relance (autre échéance), l'ancienne reste obsolète.
  await dirigeant.from("travaux_differes").update({ date_relance: jour(-1) }).eq("id", echu.id);
  const p4 = await preparer();
  const apres = await relancesDe(echu.id);
  verifier("nouvelle échéance atteinte → une nouvelle relance, l'ancienne reste obsolète", p4.data?.some((x) => x.action === "preparee") && apres.length === 2 && apres.filter((x) => x.statut === "obsolete").length === 1 && apres.filter((x) => x.statut === "a_relire").length === 1, JSON.stringify(apres.map((x) => x.statut)));
}

// C. Gestes du garage.
console.log("C. Relire, corriger, autoriser");
const relance = (await relancesDe(echu.id)).find((x) => x.statut === "a_relire");
{
  const { data: vueAccueil } = await accueil.from("relances_travaux").select("id, sujet, texte").eq("id", relance.id);
  verifier("l'accueil lit le brouillon", vueAccueil?.length === 1);
  const { data: vueRevoque } = await revoque.from("relances_travaux").select("id").eq("id", relance.id);
  verifier("l'accueil révoqué ne le voit pas", (vueRevoque || []).length === 0);
  const m = await accueil.rpc("modifier_relance_travail", { p_relance_id: relance.id, p_sujet: relance.sujet, p_texte: relance.texte + "\n\nPS : nous sommes ouverts le samedi matin." });
  verifier("l'accueil corrige le texte", m.data?.ok === true, JSON.stringify(m.data || m.error));
  const mauvais = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: "autre@nexora-recette.invalid" });
  verifier("autoriser avec un autre destinataire → destinataire_different", mauvais.data?.ok === false && mauvais.data.raison === "destinataire_different", JSON.stringify(mauvais.data || mauvais.error));
  const rev = await revoque.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  verifier("révoqué → refus", Boolean(rev.error), JSON.stringify(rev.data));
  const mec = await mecano.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  verifier("mécanicien → refus", Boolean(mec.error), JSON.stringify(mec.data));
  const okA = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  verifier("l'accueil autorise → en_attente, auteur conservé", okA.data?.ok === true && (await relancesDe(echu.id)).find((x) => x.id === relance.id)?.statut === "en_attente" && (await relancesDe(echu.id)).find((x) => x.id === relance.id)?.autorise_par === idDe("accueil"), JSON.stringify(okA.data || okA.error));
  const encore = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  verifier("ré-autoriser → deja_autorise, sans doublon", encore.data?.deja_autorise === true);
  const modifApres = await accueil.rpc("modifier_relance_travail", { p_relance_id: relance.id, p_sujet: "X", p_texte: "Y" });
  verifier("plus de modification après autorisation (statut)", modifApres.data?.ok === false && modifApres.data.raison === "statut");
}

// D. Réservation et résultat.
console.log("D. Réservation, blocage, résultat");
{
  // Le texte change EN BASE après l'autorisation (par la clé de service, pour
  // simuler une dérive) : la réservation doit le mettre de côté.
  await admin.from("relances_travaux").update({ texte: "texte modifié après autorisation" }).eq("id", relance.id);
  const r1 = await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId] });
  const etat1 = (await relancesDe(echu.id)).find((x) => x.id === relance.id);
  verifier("message modifié après validation → bloqué, non réservé", !r1.error && r1.data.length === 0 && etat1.statut === "bloque" && /message a changé/.test(etat1.derniere_erreur || ""), JSON.stringify(r1.data || r1.error) + " " + etat1.statut);
  const reA = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  verifier("revalidation à la main → en_attente", reA.data?.ok === true);
  const [r2, r3] = await Promise.all([
    admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId] }),
    admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId] }),
  ]);
  const prises = [...(r2.data || []), ...(r3.data || [])];
  verifier("deux réservations simultanées → une seule prise", prises.length === 1 && prises[0].id === relance.id, `${prises.length}`);
  verifier("la ligne réservée porte sujet, texte, destinataire, garage", prises[0]?.sujet && prises[0]?.texte && prises[0]?.destinataire === client.email && prises[0]?.expediteur_nom);
  const r4 = await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId] });
  verifier("envoi_en_cours n'est jamais repris par une réservation suivante", (r4.data || []).length === 0);
  await admin.rpc("terminer_relance_travail", { p_id: relance.id, p_resultat: "a_reprendre", p_motif: "refus du fournisseur (simulé)" });
  verifier("a_reprendre → en_attente, tentative comptée", (await relancesDe(echu.id)).find((x) => x.id === relance.id)?.statut === "en_attente" && (await relancesDe(echu.id)).find((x) => x.id === relance.id)?.tentatives === 1);
  const r5 = await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId] });
  verifier("reprise : réservée à nouveau", (r5.data || []).length === 1);
  await admin.rpc("terminer_relance_travail", { p_id: relance.id, p_resultat: "envoye", p_motif: "transport simulé (recette) : aucun message réel n'est parti" });
  const fin = (await relancesDe(echu.id)).find((x) => x.id === relance.id);
  verifier("résultat : envoye, avec le motif « simulé »", fin.statut === "envoye" && fin.envoye === true && /simulé/.test(fin.derniere_erreur || ""));
  // Clôture après envoi : rien à annuler (déjà envoyée), et une relance
  // préparée pour un autre travail se ferait annuler.
  await dirigeant.from("travaux_differes").update({ statut: "recupere" }).eq("id", echu.id);
  const p5 = await preparer();
  verifier("clôture d'un travail dont la relance est partie : rien ne bouge", !(p5.data || []).some((x) => x.travail_id === echu.id));
  const { data: t2 } = await dirigeant.from("travaux_differes").insert({ garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, intervention: "À annuler (recette)", niveau: "normal", statut: "a_relancer", date_relance: jour(-3), source: "manuel" }).select("id").single();
  await preparer();
  await dirigeant.from("travaux_differes").update({ statut: "refus_definitif" }).eq("id", t2.id);
  const p6 = await preparer();
  verifier("refus définitif → la relance à_relire est annulée", p6.data?.some((x) => x.action === "annulee" && x.travail_id === t2.id) && (await relancesDe(t2.id))[0]?.statut === "annulee", JSON.stringify(p6.data));
  const ann = await accueil.rpc("annuler_relance_travail", { p_relance_id: relance.id, p_motif: "test" });
  verifier("annuler une relance envoyée → refus (statut)", ann.data?.ok === false && ann.data.raison === "statut");
}

// Nettoyage des travaux de recette (les relances suivent en cascade).
for (const t of [...travaux]) await dirigeant.from("travaux_differes").delete().eq("id", t.id);
await admin.from("travaux_differes").delete().eq("garage_id", garageId).ilike("intervention", "%(recette)%");
console.log(`\n${ok}/${total} contrôles au vert.`);
process.exit(ok === total ? 0 : 1);
