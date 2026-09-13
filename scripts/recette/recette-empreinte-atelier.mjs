// Recette « ce qui a été validé est ce qui part » — Test uniquement.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(RACINE + "/.env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("slawilafseganlbghgwx")) { console.error("REFUS : pas Test"); process.exit(2); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const GARAGE = "76147ea8-4071-4bf5-a135-969324c24c13";

async function session(email) {
  if (!email.endsWith("@nexora-recette.invalid")) process.exit(2);
  const { data: lien } = await db.auth.admin.generateLink({ type:"magiclink", email });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{persistSession:false} });
  await anon.auth.verifyOtp({ email, token: lien.properties.email_otp, type:"email" });
  return anon;
}
const dit = (n, ok, d="") => console.log(`${ok ? "OK  " : "ÉCHEC"} ${n}${d ? " — " + d : ""}`);
const notifs = async (rdvId) => (await db.from("notifications_atelier").select("id, statut, envoye, destinataire_valide, empreinte_document, derniere_erreur").eq("rendez_vous_id", rdvId).order("created_at")).data || [];
// `reserver_notifications` n'est accordée qu'à `service_role` : c'est le
// traitement n8n qui l'appelle, pas un utilisateur. On joue donc le vrai
// acteur, et on BORNE au garage de recette — leçon du 8 septembre : les
// workflows ne filtrent pas par garage, une exécution non bornée viderait
// les files de tous les garages de démonstration.
const reserver = () => db.rpc("reserver_notifications", { p_file: "atelier", p_limite: 10, p_garages: [GARAGE] });

const dirigeant = await session("recette.proto.atelier.2026091308h38@nexora-recette.invalid");

const { data: rdvs } = await db.from("rendez_vous").select("id, statut_atelier, client_id, vehicule_id, vehicules(immatriculation, marque)").eq("garage_id", GARAGE);
const cible = rdvs.find(r => r.vehicules?.immatriculation === "BG-707-GG");
const etatDepart = cible.statut_atelier;
const { data: cl } = await db.from("clients").select("email, nom").eq("id", cible.client_id).single();
const emailDepart = cl.email, nomDepart = cl.nom;
const { data: veh } = await db.from("vehicules").select("marque").eq("id", cible.vehicule_id).single();
const marqueDepart = veh.marque;
const nettoie = async () => { for (const n of await notifs(cible.id)) await db.from("notifications_atelier").delete().eq("id", n.id); };

async function autoriserPropre() {
  await nettoie();
  await db.from("rendez_vous").update({ statut_atelier: "intervention" }).eq("id", cible.id);
  await db.from("rendez_vous").update({ statut_atelier: "pret" }).eq("id", cible.id);
  const { data } = await dirigeant.rpc("autoriser_envoi_atelier", { p_rendez_vous_id: cible.id, p_destinataire: emailDepart });
  return data;
}

// 1. Référence : rien ne change, la réservation prend la ligne.
{
  await autoriserPropre();
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("rien n'a changé : la ligne est bien réservée", (data||[]).length === 1 && n[0].statut === "envoi_en_cours", n[0].statut);
}

// 2. Le MESSAGE change (nom du client) après autorisation.
{
  await autoriserPropre();
  await db.from("clients").update({ nom: nomDepart + " (renommé)" }).eq("id", cible.client_id);
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("le message a changé : bloqué, rien n'est parti",
      (data||[]).length === 0 && n[0].statut === "bloque" && /message a changé/.test(n[0].derniere_erreur || ""),
      n[0].derniere_erreur);
  dit("  …et le destinataire validé n'est pas écrasé", n[0].destinataire_valide === emailDepart, n[0].destinataire_valide);
  dit("  …et l'empreinte validée n'est pas écrasée", Boolean(n[0].empreinte_document));
  await db.from("clients").update({ nom: nomDepart }).eq("id", cible.client_id);
}

// 3. Le VÉHICULE change (marque) après autorisation.
{
  await autoriserPropre();
  await db.from("vehicules").update({ marque: "AutreMarque" }).eq("id", cible.vehicule_id);
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("le véhicule a changé : bloqué", (data||[]).length === 0 && n[0].statut === "bloque", n[0].derniere_erreur);
  await db.from("vehicules").update({ marque: marqueDepart }).eq("id", cible.vehicule_id);
}

// 4. Le DESTINATAIRE change après autorisation.
{
  await autoriserPropre();
  await db.from("clients").update({ email: "autre.adresse@nexora-recette.invalid" }).eq("id", cible.client_id);
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("le destinataire a changé : bloqué avec son propre motif",
      (data||[]).length === 0 && n[0].statut === "bloque" && /destinataire a changé/.test(n[0].derniere_erreur || ""),
      n[0].derniere_erreur);
  dit("  …et l'adresse validée est conservée telle quelle", n[0].destinataire_valide === emailDepart, n[0].destinataire_valide);
  await db.from("clients").update({ email: emailDepart }).eq("id", cible.client_id);
}

// 5. La voiture n'est PLUS PRÊTE après autorisation.
{
  await autoriserPropre();
  await db.from("rendez_vous").update({ statut_atelier: "intervention" }).eq("id", cible.id);
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("la voiture n'est plus prête : bloquée, aucun envoi automatique",
      (data||[]).length === 0 && n[0].statut === "bloque" && /plus noté prêt/.test(n[0].derniere_erreur || ""),
      n[0].derniere_erreur);
}

// 5 bis. Une ligne bloquée ne se fait pas doubler par un nouveau cycle d'étape.
{
  const avant = await notifs(cible.id);
  await db.from("rendez_vous").update({ statut_atelier: "pret" }).eq("id", cible.id);
  const apres = await notifs(cible.id);
  dit("un nouveau passage à Prêt ne double pas la ligne bloquée",
      apres.length === avant.length && apres.length === 1, `${avant.length} → ${apres.length} ligne(s)`);
}

// 6. Revalidation : le geste manuel réarme, et rien d'autre.
{
  const avant = await notifs(cible.id);
  const { data: r1 } = await reserver();
  dit("une ligne bloquée ne se réarme pas toute seule", (r1||[]).length === 0 && (await notifs(cible.id))[0].statut === "bloque");
  const { data, error } = await dirigeant.rpc("autoriser_envoi_atelier", { p_rendez_vous_id: cible.id, p_destinataire: emailDepart });
  const n = await notifs(cible.id);
  dit("la revalidation à la main réarme la même ligne",
      data?.ok === true && n.length === 1 && n[0].id === avant[0].id && n[0].statut === "en_attente",
      error?.message || JSON.stringify(data) + " | lignes=" + n.length + " statut=" + n[0]?.statut);
}

// 7. Un envoi EN COURS n'est jamais remis en file.
{
  const n0 = await notifs(cible.id);
  await db.from("notifications_atelier").update({ statut: "envoi_en_cours" }).eq("id", n0[0].id);
  const { data } = await reserver();
  const n = await notifs(cible.id);
  dit("envoi en cours : ni réservé, ni rejoué", (data||[]).length === 0 && n[0].statut === "envoi_en_cours");
  // et même si le message change entre-temps
  await db.from("clients").update({ nom: nomDepart + " (bis)" }).eq("id", cible.client_id);
  const { data: d2 } = await reserver();
  dit("  …même si le message change entre-temps", (d2||[]).length === 0 && (await notifs(cible.id))[0].statut === "envoi_en_cours");
  await db.from("clients").update({ nom: nomDepart }).eq("id", cible.client_id);
}

// 8. Passage à Prêt sans autorisation : la réservation ne prend rien.
{
  await nettoie();
  await db.from("rendez_vous").update({ statut_atelier: "intervention" }).eq("id", cible.id);
  await db.from("rendez_vous").update({ statut_atelier: "pret" }).eq("id", cible.id);
  const n = await notifs(cible.id);
  const { data } = await reserver();
  dit("Prêt sans autorisation : la réservation ne prend rien",
      n.length === 1 && n[0].statut === "sans_lien" && (data||[]).length === 0);
}

await nettoie();
await db.from("rendez_vous").update({ statut_atelier: etatDepart }).eq("id", cible.id);
const { data: fin } = await db.from("clients").select("email, nom").eq("id", cible.client_id).single();
const { data: vfin } = await db.from("vehicules").select("marque").eq("id", cible.vehicule_id).single();
console.log(`\nRemis en état : BG-707-GG → ${etatDepart}, client « ${fin.nom} » <${fin.email}>, marque « ${vfin.marque} », file vidée.`);
