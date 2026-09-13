// Les sources hors atelier, sur le garage de recette — Supabase TEST seul.
//
// POURQUOI
//
// La liste unique fusionne deux moteurs. Le second — rappels, demandes,
// inspections, travaux différés — n'avait aucune donnée sur Test : la recette
// ne pouvait donc pas voir la fusion, ni les doublons qu'elle évite. C'est
// exactement l'angle mort qui a laissé passer le défaut de Production.
//
// Trois garde-fous, comme les autres jeux : refus hors Test, adresses en
// `.invalid`, purge bornée au garage nommé.
//
//   node scripts/recette/jeu-sources-cockpit.mjs <garage_id>
//   node scripts/recette/jeu-sources-cockpit.mjs purger <garage_id>
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
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const PROJET_TEST = "slawilafseganlbghgwx";
if (!(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PROJET_TEST)) {
  console.error(`REFUS : ce worktree ne vise pas le projet Test (${PROJET_TEST}).`);
  process.exit(2);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const jours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const iso = (d) => d.toISOString();
const jour = (d) => d.toISOString().slice(0, 10);

async function verifierGarage(garageId) {
  const { data } = await db.from("garages").select("id, nom_garage").eq("id", garageId).maybeSingle();
  if (!data) { console.error("REFUS : garage introuvable."); process.exit(2); }
  if (!data.nom_garage.startsWith("PROTO")) {
    console.error(`REFUS : « ${data.nom_garage} » n'est pas un garage de recette.`);
    process.exit(2);
  }
  return data;
}

async function creer(garageId) {
  const g = await verifierGarage(garageId);
  const { data: clients } = await db.from("clients").select("id, nom").eq("garage_id", garageId).limit(3);
  if (!clients?.length) { console.error("REFUS : ce garage n'a aucun client."); process.exit(2); }
  const { data: devis } = await db.from("devis").select("id, client_id, vehicule_id").eq("garage_id", garageId).limit(1);

  // Deux rappels : un urgent, un ordinaire.
  await db.from("rappels_manques").insert([
    { garage_id: garageId, telephone: "0611002200", motif: "Bruit au freinage", statut: "a_rappeler", urgent: true },
    { garage_id: garageId, telephone: "0611003300", motif: "Demande de devis", statut: "tentative_sans_reponse", urgent: false },
  ]);

  // Un travail différé ÉCHU (doit être dans la liste) et un FUTUR (doit rester
  // dans le suivi, et rejoindre la liste à son échéance).
  await db.from("travaux_differes").insert([
    { garage_id: garageId, client_id: clients[0].id, devis_id: devis?.[0]?.id || null,
      intervention: "Disques arrière à remplacer", niveau: "important",
      date_relance: jour(jours(-3)), statut: "planifie", montant_ttc: 240 },
    { garage_id: garageId, client_id: clients[1]?.id || clients[0].id,
      intervention: "Amortisseurs — à revoir au prochain passage", niveau: "normal",
      date_relance: jour(jours(21)), statut: "planifie", montant_ttc: 480 },
  ]);

  // Une demande entrante non traitée.
  await db.from("demandes").insert([
    { garage_id: garageId, client_id: clients[0].id, statut: "nouveau",
      type_demande: "rendez_vous", motif: "Voyant moteur allumé", urgence: "Élevée", created_at: iso(jours(0)) },
  ]);

  // Une inspection partagée, en attente de décision client.
  await db.from("inspections").insert([
    { garage_id: garageId, client_id: clients[0].id, statut: "en_attente_client", verrouille_le: iso(jours(-2)) },
  ]);

  console.log(`\nSources ajoutées sur « ${g.nom_garage} » :`);
  console.log("  2 rappels (1 urgent) · 1 travail différé échu · 1 travail différé au " + jour(jours(21)));
  console.log("  1 demande urgente · 1 inspection en attente\n");
}

async function purger(garageId) {
  const g = await verifierGarage(garageId);
  for (const t of ["rappels_manques", "travaux_differes", "demandes", "inspections"]) {
    const { error } = await db.from(t).delete().eq("garage_id", garageId);
    console.log(`  ${t} : ${error ? `non supprimé (${error.message})` : "vidé"}`);
  }
  console.log(`(garage « ${g.nom_garage} » conservé)`);
}

const [, , a, b] = process.argv;
if (a === "purger") await purger(b);
else if (a) await creer(a);
else { console.error("Usage : <garage_id> | purger <garage_id>"); process.exit(2); }
