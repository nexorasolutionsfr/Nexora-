// Ouvrir Nexora Auto (base TEST) sur un vrai téléphone, sur le même Wi-Fi.
//
//   node scripts/recette/telephone.mjs <adresse @nexora-recette.invalid> [port] [--afficher-lien]
//
// Le serveur local doit tourner sur le Mac (par défaut le build de
// production, port 3115 : configuration « nexora-auto-production »). Le
// script affiche l'adresse du Mac sur le réseau local et un QR code qui ouvre
// directement une session sur ce compte de recette (valable une heure). Rien
// ne passe par un service extérieur : téléphone → Mac → base Test.
//
// L'adresse est en http : le navigateur du téléphone n'y offre pas certaines
// fonctions réservées aux pages sûres ; l'application s'en passe
// (lib/auto/empreinte.js, lib/auto/identifiants.js).

import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const [adresse, port = "3115"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function lireEnv() {
  const env = { ...process.env };
  for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

if (!adresse?.endsWith("@nexora-recette.invalid")) {
  console.error("Usage : node scripts/recette/telephone.mjs <adresse @nexora-recette.invalid> [port]");
  process.exit(1);
}
const env = lireEnv();
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : la base n'est pas la base Test.");
  process.exit(1);
}

const candidates = Object.entries(networkInterfaces())
  .flatMap(([nom, liste]) => (liste ?? []).map((i) => ({ nom, ...i })))
  .filter((i) => i.family === "IPv4" && !i.internal)
  .sort((a, b) => (a.nom === "en0" ? -1 : b.nom === "en0" ? 1 : 0));
if (!candidates.length) {
  console.error("Aucune adresse réseau locale : le Mac est-il connecté au Wi-Fi ?");
  process.exit(1);
}
const base = `http://${candidates[0].address}:${port}`;

const etat = await fetch(`${base}/api/auto/lecture`).then((r) => r.ok).catch(() => false);
if (!etat) {
  console.error(`Le serveur ne répond pas sur ${base}. Démarrez-le (build de production, port ${port}) puis relancez.`);
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: adresse });
if (error) {
  console.error("Échec :", error.message);
  process.exit(1);
}
const destination = (await fetch(data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
const fragment = destination.split("#")[1];
if (!fragment?.includes("access_token=")) {
  console.error("Le lien n'a pas ouvert de session.");
  process.exit(1);
}
const lien = `${base}/auto#${fragment}`;

console.log(`\nNexora Auto (Test) sur ${base} — compte ${adresse}`);
console.log("Téléphone sur le même Wi-Fi que le Mac. Session valable une heure. Ne partagez pas ce code.\n");
console.log(await QRCode.toString(lien, { type: "terminal", small: true }));
if (process.argv.includes("--afficher-lien")) console.log(lien);
