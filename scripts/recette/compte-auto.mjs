// Comptes automobilistes de recette Nexora Auto — base TEST uniquement.
//
//   node scripts/recette/compte-auto.mjs creer
//   node scripts/recette/compte-auto.mjs lien <adresse> [http://localhost:3114/auto]
//
// `creer` : compte confirmé d'office (aucun e-mail envoyé), adresse en
// `.invalid`, marqué `espace: "auto"`. Aucun mot de passe n'est affiché.
// `lien` : suit un lien de connexion à usage unique côté serveur et affiche
// l'adresse locale qui ouvre la session dans le navigateur. Le lien Supabase
// lui-même n'est jamais ouvert dans le navigateur : il ne sert qu'une fois.
//
// Variables lues dans .env.local : NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Refus de démarrer hors de la base Test.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";

function lireEnv() {
  const env = { ...process.env };
  try {
    for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
      const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // .env.local absent : on s'en tient à l'environnement.
  }
  return env;
}

const env = lireEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [commande, adresse, retour = "http://localhost:3114/auto"] = process.argv.slice(2);

if (commande === "creer") {
  const horodatage = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const email = `recette.auto.${horodatage}@nexora-recette.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Recette-${randomBytes(12).toString("base64url")}`,
    email_confirm: true,
    user_metadata: { espace: "auto" },
  });
  if (error) {
    console.error("Échec :", error.message);
    process.exit(1);
  }
  console.log(`Compte créé : ${email} (${data.user.id})`);
} else if (commande === "lien" && adresse) {
  if (!adresse.endsWith("@nexora-recette.invalid")) {
    console.error("Refus : seuls les comptes @nexora-recette.invalid sont servis par ce script.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: adresse, options: { redirectTo: retour } });
  if (error) {
    console.error("Échec :", error.message);
    process.exit(1);
  }
  const reponse = await fetch(data.properties.action_link, { redirect: "manual" });
  const destination = reponse.headers.get("location");
  if (!destination || !destination.includes("access_token=")) {
    console.error("Le lien n'a pas ouvert de session :", destination);
    process.exit(1);
  }
  console.log(destination);
} else {
  console.error("Usage : node scripts/recette/compte-auto.mjs creer | lien <adresse> [retour]");
  process.exit(1);
}
