// Bêta privée Nexora Auto sur la base TEST : mode d'accès et adresses invitées.
//
//   node scripts/recette/beta.mjs etat
//   node scripts/recette/beta.mjs mode <ferme|beta|ouvert>
//   node scripts/recette/beta.mjs inviter <adresse> [note]
//   node scripts/recette/beta.mjs retirer <adresse>
//
// Inviter une adresse n'envoie RIEN : la personne crée ensuite son compte
// elle-même (écran « Créer votre compte »), ou se connecte si elle en a un.
// La liste n'est affichée qu'en nombre, jamais adresse par adresse, sauf
// `etat --adresses`. Refus hors de la base Test : en Production, ces
// réglages se font à la main, voir docs/architecture/nexora-auto-livraison.md.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const env = { ...process.env };
try {
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // .env.local absent : on s'en tient à l'environnement.
}
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [commande, valeur, ...reste] = process.argv.slice(2);
const sortir = (message) => {
  console.error(message);
  process.exit(1);
};

async function etat({ adresses = false } = {}) {
  const { data: p, error } = await admin.from("auto_acces_parametres").select("mode, updated_at").single();
  if (error) sortir(`Lecture impossible : ${error.message}`);
  const { data: invites } = await admin.from("auto_acces_beta").select("email, note, ajoute_le").order("ajoute_le");
  console.log(`Mode : ${p.mode} (depuis le ${p.updated_at.slice(0, 16).replace("T", " ")})`);
  console.log(`Adresses invitées : ${invites.length}`);
  if (adresses) for (const i of invites) console.log(`  ${i.email}${i.note ? ` — ${i.note}` : ""}`);
}

if (commande === "etat") {
  await etat({ adresses: valeur === "--adresses" });
} else if (commande === "mode" && ["ferme", "beta", "ouvert"].includes(valeur)) {
  const { error } = await admin.from("auto_acces_parametres").update({ mode: valeur }).eq("unique_ligne", true);
  if (error) sortir(`Échec : ${error.message}`);
  await etat();
} else if (commande === "inviter" && valeur) {
  const email = valeur.trim().toLowerCase();
  const { error } = await admin.from("auto_acces_beta").upsert({ email, note: reste.join(" ").slice(0, 200) || null });
  if (error) sortir(`Échec : ${error.message}`);
  console.log("Adresse invitée (aucun message envoyé).");
  await etat();
} else if (commande === "retirer" && valeur) {
  const { error } = await admin.from("auto_acces_beta").delete().eq("email", valeur.trim().toLowerCase());
  if (error) sortir(`Échec : ${error.message}`);
  console.log("Adresse retirée : le compte, s'il existe, garde ses données mais n'y accède plus.");
  await etat();
} else {
  sortir("Usage : etat [--adresses] | mode <ferme|beta|ouvert> | inviter <adresse> [note] | retirer <adresse>");
}
