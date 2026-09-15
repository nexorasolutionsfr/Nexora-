// Recette SERVEUR de « constat → devis » — Supabase TEST seul.
//
// Ce que l'écran ne peut pas prouver, on le prouve ici, par de vraies
// sessions (jamais par la clé de service pour les gestes métier) :
//   1. deux appels SIMULTANÉS avec le même identifiant de reprise → une seule
//      reprise, aucune ligne en double ;
//   2. les mêmes points, un autre identifiant → « déjà repris », rien d'ajouté ;
//   3. un point refusé par le client → signalé, jamais inclus ;
//   4. un devis verrouillé (accepté) → refus explicite ;
//   5. un dirigeant d'un AUTRE garage → refus ;
//   6. un accueil RÉVOQUÉ → refus ;
//   7. le mécanicien → refus (pas de chiffrage pour ce rôle) ;
//   8. chiffrage incomplet → ni jeton, ni autorisation d'envoi, ni lecture
//      publique, ni réponse par jeton ; et l'empreinte du devis change ;
//   9. un contrôle verrouillé se reprend (lecture seule du constat) ;
//  10. un constat d'un autre véhicule ne se colle pas sur un devis.
//
// Usage : node scripts/recette/constat-devis-serveur.mjs <garage_id>
//
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
if (!garageId) { console.error("Usage : constat-devis-serveur.mjs <garage_id>"); process.exit(1); }

let total = 0, ok = 0;
function verifier(libelle, condition, detail = "") {
  total += 1;
  if (condition) { ok += 1; console.log(`  ✔ ${libelle}`); }
  else console.log(`  ✖ ${libelle}${detail ? " — " + detail : ""}`);
}

async function session(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = anonClient();
  const { error: e2 } = await c.auth.verifyOtp({ email, token: data.properties.email_otp, type: "email" });
  if (e2) throw e2;
  return c;
}

// --- Le jeu -----------------------------------------------------------------
const { data: garage } = await admin.from("garages").select("id, nom_garage").eq("id", garageId).single();
if (!garage?.nom_garage?.startsWith("PROTO Constat")) { console.error("REFUS : pas un garage « PROTO Constat »."); process.exit(2); }
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const { data: membres } = await admin.from("garage_membres").select("user_id, role, actif").eq("garage_id", garageId);
const emailDe = (role, actif = true) => users.users.find((u) => u.id === membres.find((m) => m.role === role && m.actif === actif)?.user_id)?.email;
const dirigeant = await session(emailDe("dirigeant"));
const revoque = await session(emailDe("accueil", false));
const mecano = await session(emailDe("mecanicien"));
// L'autre garage : PROTO Atelier, dirigeant.
const { data: autre } = await admin.from("garages").select("id, owner_user_id").ilike("nom_garage", "PROTO Atelier 2026-09-13-08h38%").single();
const autreDirigeant = autre ? await session(users.users.find((u) => u.id === autre.owner_user_id).email) : null;

const { data: inspections } = await admin.from("inspections").select("id, verrouille_le, vehicule_id, rendez_vous_id").eq("garage_id", garageId).order("created_at");
const ouverte = inspections.find((i) => !i.verrouille_le);
const verrouillee = inspections.find((i) => i.verrouille_le);
const { data: points } = await admin.from("inspections_points").select("id, libelle, etat, decision_client").eq("inspection_id", ouverte.id);
const dommage = points.find((p) => p.etat === "dommage");
const refuse = points.find((p) => p.decision_client === "refuse");
const surveiller = points.find((p) => p.etat === "a_surveiller");
const { data: pointsVerrou } = await admin.from("inspections_points").select("id").eq("inspection_id", verrouillee.id);
const { data: devisAccepte } = await admin.from("devis").select("id").eq("garage_id", garageId).eq("statut", "accepte").limit(1).single();
const rdvId = ouverte.rendez_vous_id;

const rpc = (client, args) => client.rpc("preparer_devis_depuis_constat", args);
// `empreinte_devis` n'est pas exposée à l'application (c'est la file qui la
// lit) : on la calcule sous le rôle de service, comme `reserver_notifications`.
const empreinte = async (devisId) => {
  const { data, error } = await admin.rpc("empreinte_devis", { p_devis_id: devisId });
  if (error) console.log("    empreinte :", error.message);
  return data;
};
// `devis_lignes` n'accorde rien à la clé de service : on lit sous session.
const lignesDe = async (devisId) => {
  const { data, error } = await dirigeant.from("devis_lignes").select("id, inspection_point_id, prix_a_renseigner, reprise_id").eq("devis_id", devisId);
  if (error) console.log("    lecture des lignes :", error.message);
  return data || [];
};

console.log(`Garage ${garage.nom_garage}\n`);

// 1. Concurrence : même identifiant, deux appels en même temps.
console.log("1. Deux appels simultanés, même identifiant de reprise");
{
  const reprise = randomUUID();
  const args = { p_reprise_id: reprise, p_inspection_id: ouverte.id, p_points: [dommage.id, surveiller.id], p_devis_id: null, p_rendez_vous_id: rdvId };
  const [a, b] = await Promise.all([rpc(dirigeant, args), rpc(dirigeant, args)]);
  verifier("aucune erreur", !a.error && !b.error, `${a.error?.message} / ${b.error?.message}`);
  const res = [a.data, b.data];
  verifier("les deux réponses pointent le même devis", res[0]?.devis_id && res[0].devis_id === res[1]?.devis_id);
  verifier("une seule des deux a créé (l'autre dit « déjà jouée »)", res.filter((r) => r?.deja_jouee).length === 1 && res.filter((r) => r?.devis_cree).length === 1);
  const lignes = await lignesDe(res[0].devis_id);
  verifier("exactement 2 lignes, toutes « Prix à renseigner »", lignes.length === 2 && lignes.every((l) => l.prix_a_renseigner), `${lignes.length} lignes`);
  const { data: reprises } = await admin.from("devis_reprises").select("id").eq("devis_id", res[0].devis_id);
  verifier("une seule reprise enregistrée", reprises.length === 1);
  const { data: d } = await admin.from("devis").select("rendez_vous_id, statut, vehicule_id").eq("id", res[0].devis_id).single();
  verifier("le devis créé est rattaché à la visite du contrôle", d.rendez_vous_id === rdvId && d.statut === "en_attente" && d.vehicule_id === ouverte.vehicule_id);
  const { data: notifs } = await admin.from("notifications_devis").select("statut").eq("devis_id", res[0].devis_id);
  verifier("sa notification est née désarmée (sans_lien), rien n'est armé", notifs.length === 1 && notifs[0].statut === "sans_lien", JSON.stringify(notifs));
  globalThis.devisCree = res[0].devis_id;

  // 2. Mêmes points, autre identifiant.
  console.log("2. Mêmes points, autre identifiant");
  const c = await rpc(dirigeant, { ...args, p_reprise_id: randomUUID(), p_devis_id: globalThis.devisCree });
  verifier("ok, 0 ligne créée, 2 « déjà reprises »", c.data?.ok && c.data.lignes_creees.length === 0 && c.data.deja_reprises.length === 2, JSON.stringify(c.data));
  verifier("toujours 2 lignes", (await lignesDe(globalThis.devisCree)).length === 2);

  // 3. Point refusé.
  console.log("3. Point refusé par le client");
  const r = await rpc(dirigeant, { ...args, p_reprise_id: randomUUID(), p_devis_id: globalThis.devisCree, p_points: [refuse.id] });
  verifier("signalé dans « refuses », rien d'ajouté", r.data?.ok && r.data.refuses.length === 1 && r.data.lignes_creees.length === 0, JSON.stringify(r.data));

  // 9. Contrôle verrouillé : ses points se reprennent (lecture).
  console.log("9. Contrôle verrouillé");
  const v = await rpc(dirigeant, { p_reprise_id: randomUUID(), p_inspection_id: verrouillee.id, p_points: pointsVerrou.map((p) => p.id), p_devis_id: globalThis.devisCree, p_rendez_vous_id: null });
  verifier("les constats d'un contrôle verrouillé se reprennent", v.data?.ok && v.data.lignes_creees.length === pointsVerrou.length, JSON.stringify(v.data || v.error));
}

// 4. Devis verrouillé.
console.log("4. Devis accepté (verrouillé)");
{
  const r = await rpc(dirigeant, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [dommage.id], p_devis_id: devisAccepte.id, p_rendez_vous_id: null });
  verifier("refus explicite « devis_verrouille »", r.data?.ok === false && r.data.raison === "devis_verrouille", JSON.stringify(r.data || r.error));
  verifier("aucune reprise enregistrée sur ce devis", ((await admin.from("devis_reprises").select("id").eq("devis_id", devisAccepte.id)).data || []).length === 0);
}

// 5-7. Rôles.
console.log("5. Dirigeant d'un autre garage");
if (autreDirigeant) {
  const r = await rpc(autreDirigeant, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [dommage.id], p_devis_id: null, p_rendez_vous_id: null });
  verifier("refusé (accès)", Boolean(r.error) && /accès refusé|introuvable/i.test(r.error.message), r.error?.message || JSON.stringify(r.data));
} else console.log("  (PROTO Atelier introuvable : cas non joué)");
console.log("6. Accueil révoqué");
{
  const r = await rpc(revoque, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [dommage.id], p_devis_id: null, p_rendez_vous_id: null });
  verifier("refusé (accès)", Boolean(r.error) && /accès refusé|introuvable/i.test(r.error.message), r.error?.message || JSON.stringify(r.data));
}
console.log("7. Mécanicien");
{
  const r = await rpc(mecano, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [dommage.id], p_devis_id: null, p_rendez_vous_id: null });
  verifier("refusé (accès)", Boolean(r.error) && /accès refusé|introuvable/i.test(r.error.message), r.error?.message || JSON.stringify(r.data));
}

// 8. Chiffrage incomplet.
console.log("8. Chiffrage incomplet");
{
  const devisId = globalThis.devisCree;
  const empreinteAvant = (await empreinte(devisId));
  const jeton = await dirigeant.rpc("creer_jeton_devis", { p_devis_id: devisId });
  verifier("creer_jeton_devis refuse (« Devis incomplet »)", Boolean(jeton.error) && /incomplet/i.test(jeton.error.message), jeton.error?.message || "jeton rendu");
  const { data: cl } = await admin.from("clients").select("email").eq("id", (await admin.from("devis").select("client_id").eq("id", devisId).single()).data.client_id).single();
  const aut = await dirigeant.rpc("autoriser_envoi_devis", { p_devis_id: devisId, p_destinataire: cl.email });
  verifier("autoriser_envoi_devis rend raison=chiffrage_incomplet", aut.data?.ok === false && aut.data.raison === "chiffrage_incomplet", JSON.stringify(aut.data || aut.error));
  const { data: notifs } = await admin.from("notifications_devis").select("statut").eq("devis_id", devisId);
  verifier("la notification reste sans_lien", notifs.every((n) => n.statut === "sans_lien"), JSON.stringify(notifs));

  // On chiffre tout, on obtient un jeton, on relit — puis on ajoute une ligne
  // à renseigner : la lecture publique se ferme, l'empreinte change.
  const lignes = await lignesDe(devisId);
  for (const l of lignes) {
    const { error } = await dirigeant.from("devis_lignes").update({ prix_unitaire_ht: 50, prix_a_renseigner: false }).eq("id", l.id);
    if (error) console.log("    chiffrage :", error.message);
  }
  verifier("après chiffrage, plus aucune ligne « à renseigner »", (await lignesDe(devisId)).every((l) => !l.prix_a_renseigner));
  const jeton2 = await dirigeant.rpc("creer_jeton_devis", { p_devis_id: devisId });
  verifier("creer_jeton_devis accepte une fois tout chiffré", !jeton2.error && typeof jeton2.data === "string", jeton2.error?.message);
  const lecture = await anonClient().rpc("lire_devis_par_jeton", { p_token: jeton2.data });
  verifier("lecture publique ok, lignes rendues", lecture.data?.ok === true && Array.isArray(lecture.data.lignes) && lecture.data.lignes.length === (await lignesDe(devisId)).length, JSON.stringify(lecture.data?.raison || lecture.error));
  const empreinteChiffree = (await empreinte(devisId));
  verifier("l'empreinte a changé entre « à renseigner » et « chiffré »", empreinteAvant && empreinteChiffree && empreinteAvant !== empreinteChiffree);
  // Une nouvelle reprise ajoute une ligne à 0 « à renseigner » : le jeton
  // existant ne montre plus rien.
  const ajout = await rpc(dirigeant, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [refuse.id, surveiller.id, dommage.id], p_devis_id: devisId, p_rendez_vous_id: null });
  verifier("nouvelle reprise : 0 créée (déjà présentes / refusée)", ajout.data?.ok && ajout.data.lignes_creees.length === 0, JSON.stringify(ajout.data || ajout.error));
  // On force donc l'état par l'éditeur (comme le ferait « laisser vide ») : une
  // ligne repasse « à renseigner » avec prix 0.
  const uneLigne = (await lignesDe(devisId))[0];
  const { error: eRet } = await dirigeant.from("devis_lignes").update({ prix_unitaire_ht: 0, prix_a_renseigner: true }).eq("id", uneLigne.id);
  verifier("une ligne peut repasser « à renseigner » (prix 0)", !eRet, eRet?.message);
  const lecture2 = await anonClient().rpc("lire_devis_par_jeton", { p_token: jeton2.data });
  verifier("la lecture publique refuse alors : chiffrage_incomplet", lecture2.data?.ok === false && lecture2.data.raison === "chiffrage_incomplet", JSON.stringify(lecture2.data));
  const rep = await anonClient().rpc("repondre_devis_par_jeton", { p_token: jeton2.data, p_reponse: "accepte" });
  verifier("la réponse par jeton refuse aussi : chiffrage_incomplet", rep.data?.ok === false && rep.data.raison === "chiffrage_incomplet", JSON.stringify(rep.data));
  const empreinteApres = (await empreinte(devisId));
  verifier("l'empreinte change à nouveau (l'envoi autorisé serait mis de côté)", empreinteApres !== empreinteChiffree);
  const { error: eContrainte } = await dirigeant.from("devis_lignes").update({ prix_unitaire_ht: 12, prix_a_renseigner: true }).eq("id", uneLigne.id);
  verifier("contrainte : « à renseigner » avec un prix ≠ 0 est refusé", Boolean(eContrainte) && /prix_a_renseigner_zero/.test(eContrainte.message), eContrainte?.message);
  await dirigeant.rpc("revoquer_jeton_devis", { p_devis_id: devisId });
}

// 10. Constat d'un autre véhicule.
console.log("10. Constat d'un autre véhicule que celui du devis");
{
  const { data: autreVehicule } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).neq("id", ouverte.vehicule_id).limit(1).single();
  const { data: devisAutre, error: eIns } = await dirigeant.from("devis").insert({ garage_id: garageId, client_id: autreVehicule.client_id, vehicule_id: autreVehicule.id, montant_ht: 0, montant_ttc: 0, statut: "en_attente" }).select("id").single();
  if (eIns) console.log("    insertion :", eIns.message);
  const r = await rpc(dirigeant, { p_reprise_id: randomUUID(), p_inspection_id: ouverte.id, p_points: [dommage.id], p_devis_id: devisAutre?.id, p_rendez_vous_id: null });
  verifier("refus « vehicule_different »", r.data?.ok === false && r.data.raison === "vehicule_different", JSON.stringify(r.data || r.error));
  const { error: eLigne } = await dirigeant.from("devis_lignes").insert({ devis_id: devisAutre.id, garage_id: garageId, type: "piece", libelle: "Test", quantite: 1, prix_unitaire_ht: 1, taux_tva: 20, position: 0, inspection_point_id: dommage.id });
  verifier("trigger : une ligne ne peut pas pointer un constat d'un autre véhicule", Boolean(eLigne) && /autre vehicule/.test(eLigne.message), eLigne?.message || "ligne acceptée");
  await dirigeant.from("devis").delete().eq("id", devisAutre.id);
}

console.log(`\n${ok}/${total} contrôles au vert.`);
process.exit(ok === total ? 0 : 1);
