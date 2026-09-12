// Accès aux comptes synthétiques de recette — Supabase TEST uniquement.
//
// Pourquoi ce fichier existe : les trois rôles de recette n'ont pas de mot de
// passe. On entre par un lien de connexion à usage unique, produit par la clé
// de service de Test. Cette clé n'est PAS dans ce fichier : elle est lue dans
// le `.env.local` du worktree qui contient ce script, et ce `.env.local` n'est
// pas versionné.
//
// Trois garde-fous, dans cet ordre :
//   1. refus de démarrer si l'URL Supabase ne vise pas le projet Test ;
//   2. refus de toute adresse qui n'est pas `…@nexora-recette.invalid` ;
//   3. lecture seule, sauf la production du lien lui-même.
//
// Usage :
//   node scripts/recette/acces-test.mjs lien <email> [port]
//   node scripts/recette/acces-test.mjs comptes
//   node scripts/recette/acces-test.mjs file <garage_id>
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
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("REFUS : aucune clé de service dans le .env.local de ce worktree.");
  process.exit(2);
}

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SYNTHETIQUE = /^recette\.[a-z0-9.-]+@nexora-recette\.invalid$/;
const [commande, arg, arg2] = process.argv.slice(2);

if (commande === "lien") {
  if (!SYNTHETIQUE.test(arg || "")) {
    console.error("REFUS : adresse hors du domaine synthétique nexora-recette.invalid");
    process.exit(2);
  }
  const port = arg2 || "3111";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: arg,
    options: { redirectTo: `http://localhost:${port}/dashboard` },
  });
  if (error) {
    console.error("ERREUR :", error.message);
    process.exit(1);
  }
  const lien = data.properties.action_link;
  console.log(lien);
  if (!lien.includes(`localhost%3A${port}`) && !lien.includes(`localhost:${port}`)) {
    console.error(
      `\nNote : Supabase n'a pas retenu le port ${port} (adresse de retour non autorisée).` +
        `\nOuvrez le lien tel quel, puis remplacez le port par ${port} dans la barre d'adresse :` +
        `\nle fragment qui porte la session se transplante d'un port à l'autre.`
    );
  }
} else if (commande === "comptes") {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("ERREUR :", error.message);
    process.exit(1);
  }
  const synthetiques = data.users.filter((u) => SYNTHETIQUE.test(u.email || ""));
  for (const u of synthetiques) {
    const { data: g } = await admin.from("garages").select("id, nom_garage").eq("owner_user_id", u.id);
    const { data: m } = await admin.from("garage_membres").select("garage_id, role").eq("user_id", u.id);
    console.log(
      [
        u.email,
        (g || []).map((x) => `propriétaire de « ${x.nom_garage} » (${x.id})`).join(", "),
        (m || []).map((x) => `${x.role} sur ${x.garage_id}`).join(", "),
      ]
        .filter(Boolean)
        .join(" — ")
    );
  }
} else if (commande === "file") {
  const { data: g } = await admin.from("garages").select("id, nom_garage").eq("id", arg || "").maybeSingle();
  if (!g) {
    console.error("REFUS : garage inconnu");
    process.exit(2);
  }
  const { data: devis } = await admin.from("devis").select("id").eq("garage_id", g.id);
  const ids = (devis || []).map((d) => d.id);
  const { data: notifs } = ids.length
    ? await admin
        .from("notifications_devis")
        .select("id, statut, envoye, destinataire_valide, created_at")
        .in("devis_id", ids)
        .order("created_at")
    : { data: [] };
  console.log(JSON.stringify({ garage: g, notifications: notifs || [] }, null, 1));
} else {
  console.log("usage : lien <email> [port] | comptes | file <garage_id>");
}
