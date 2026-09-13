// Trois journées à éprouver sur l'écran Aujourd'hui — Supabase TEST seul.
//
// POURQUOI UN SECOND JEU
//
// `jeu-atelier.mjs` fabrique une journée habituelle : quinze rendez-vous,
// quelques blocages, de quoi juger l'Atelier. Aujourd'hui se juge aussi sur
// ce qu'il fait quand il n'y a RIEN — et c'est là qu'un écran ment le plus
// facilement, en montrant un cadre vide qui ressemble à une panne. Il faut
// donc trois situations de plus, et de vrais garages sur Test : le prototype
// les simulait, l'écran intégré lit la base.
//
//   chargee  — une journée dense, pour voir la liste déborder et se replier
//   vide     — un garage installé, des clients, mais rien aujourd'hui
//   nouveau  — un garage qui vient d'ouvrir : aucun client
//
// MÊMES GARDE-FOUS QUE `jeu-atelier.mjs`
//   1. refus de démarrer si l'URL Supabase ne vise pas le projet Test ;
//   2. toutes les adresses en `.invalid` — RFC 2606, aucun envoi ne peut
//      atteindre qui que ce soit ;
//   3. `purger` refuse tout garage dont le nom ne commence pas par
//      « PROTO Aujourdhui ».
//
// Usage :
//   node scripts/recette/jeu-aujourdhui.mjs creer
//   node scripts/recette/jeu-aujourdhui.mjs etat
//   node scripts/recette/jeu-aujourdhui.mjs purger <garage_id>
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

const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PREFIXE = "PROTO Aujourdhui";
const REPERE = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "h");
const SUFFIXE = REPERE.replace(/[^0-9a-z]/gi, "").toLowerCase();

function creneau(jours, heure, minutes = 60) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(heure, 0, 0, 0);
  return { date_debut: d.toISOString(), date_fin: new Date(d.getTime() + minutes * 60000).toISOString() };
}

async function exigerOk(libelle, promesse) {
  const { data, error } = await promesse;
  if (error) { console.error(`ÉCHEC ${libelle} :`, error.message); process.exit(1); }
  return data;
}

async function creerUtilisateur(email) {
  const { data: liste } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existant = (liste?.users || []).find((u) => u.email === email);
  if (existant) return existant;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) { console.error(`ÉCHEC compte ${email} :`, error.message); process.exit(1); }
  return data.user;
}

/** Un garage, son dirigeant, et l'accès ouvert sans limite de durée —
 *  `acces_motif = 'illimite'`, sinon la recette suivante tombe sur un écran
 *  « votre essai est terminé » sans rapport avec Aujourd'hui. */
async function creerGarage(cle, libelle) {
  const email = `recette.aujourdhui.${cle}.${SUFFIXE}@nexora-recette.invalid`;
  const dirigeant = await creerUtilisateur(email);
  const garage = await exigerOk(`garage ${cle}`, db.from("garages").insert({
    nom_garage: `${PREFIXE} ${cle.toUpperCase()} ${REPERE} — ${libelle}`,
    email, telephone: "0100000000",
    owner_user_id: dirigeant.id, acces_motif: "illimite",
  }).select().single());
  await exigerOk(`membre ${cle}`, db.from("garage_membres").insert({
    garage_id: garage.id, user_id: dirigeant.id, role: "dirigeant",
  }));
  return { garage, email };
}

// ---------------------------------------------------------------------------

async function creer() {
  const faits = [];

  // ---- 1. NOUVEAU : rien du tout. L'écran doit proposer un premier geste,
  //         pas afficher un tableau de bord vide.
  {
    const { garage, email } = await creerGarage("nouveau", "garage qui vient d'ouvrir");
    faits.push({ situation: "nouveau garage", garage: garage.id, email, rdv: 0, clients: 0 });
  }

  // ---- 2. VIDE : un garage installé — des clients, des voitures, un passé —
  //         mais rien aujourd'hui. C'est une journée calme, pas une panne.
  {
    const { garage, email } = await creerGarage("vide", "installe, rien aujourd'hui");
    const clients = await exigerOk("clients vide", db.from("clients").insert([
      { garage_id: garage.id, nom: "Léa Vidal", email: "lea.vidal@nexora-recette.invalid", telephone: "0611223344", est_professionnel: false },
      { garage_id: garage.id, nom: "Marc Ollivier", email: "marc.ollivier@nexora-recette.invalid", telephone: "0655667788", est_professionnel: false },
    ]).select());
    const vehicules = await exigerOk("véhicules vide", db.from("vehicules").insert([
      { garage_id: garage.id, client_id: clients[0].id, marque: "Renault", modele: "Twingo", annee: 2018, immatriculation: "CA-101-AA", kilometrage: 62000 },
      { garage_id: garage.id, client_id: clients[1].id, marque: "Peugeot", modele: "308", annee: 2017, immatriculation: "CB-202-BB", kilometrage: 94000 },
    ]).select());
    // Deux visites terminées il y a longtemps : le garage a un passé, et
    // pourtant aujourd'hui ne montre rien. C'est exactement le cas à éprouver.
    await exigerOk("rdv passés vide", db.from("rendez_vous").insert([
      { garage_id: garage.id, client_id: clients[0].id, vehicule_id: vehicules[0].id, statut: "termine", source: "manuel", statut_atelier: "restitue", ...creneau(-24, 9, 60) },
      { garage_id: garage.id, client_id: clients[1].id, vehicule_id: vehicules[1].id, statut: "termine", source: "manuel", statut_atelier: "restitue", ...creneau(-11, 14, 90) },
    ]));
    faits.push({ situation: "journée vide", garage: garage.id, email, rdv: 0, clients: 2 });
  }

  // ---- 3. CHARGÉE : de quoi faire déborder la liste des priorités. Le but
  //         est de voir ce que devient « Voir toutes », et qu'aucun cas
  //         urgent ne disparaisse derrière le repli.
  {
    const { garage, email } = await creerGarage("chargee", "journee dense");
    const meca = await exigerOk("mécaniciens chargée", db.from("mecaniciens").insert([
      { garage_id: garage.id, nom: "Karim B.", couleur: "#3D6BE0", actif: true },
      { garage_id: garage.id, nom: "Sofia M.", couleur: "#7C3AED", actif: true },
    ]).select());

    const noms = ["Amel Ziani", "Bruno Carret", "Chloé Dumas", "David Lenoir", "Emma Roux",
                  "Farid Benali", "Gaëlle Simon", "Hugo Martel", "Inès Lopez", "Julien Petit",
                  "Karine Aubry", "Loïc Vasseur", "Maya Tounsi", "Noé Gérard"];
    const clients = await exigerOk("clients chargée", db.from("clients").insert(
      noms.map((nom, i) => ({
        garage_id: garage.id, nom,
        // Un client sans adresse, pour que « Prévenir le client » ait un cas
        // où il doit refuser proprement plutôt que proposer un envoi vide.
        email: i === 5 ? null : `${nom.toLowerCase().replace(/[^a-z]/g, ".")}@nexora-recette.invalid`,
        telephone: "06" + String(10000000 + i * 111111).slice(0, 8),
        est_professionnel: false,
      }))).select());

    const vehicules = await exigerOk("véhicules chargée", db.from("vehicules").insert(
      clients.map((cl, i) => ({
        garage_id: garage.id, client_id: cl.id,
        marque: ["Peugeot", "Renault", "Citroën", "Toyota", "Ford", "Opel", "Fiat"][i % 7],
        modele: ["208", "Clio", "C3", "Yaris", "Focus", "Corsa", "500"][i % 7],
        annee: 2014 + (i % 9),
        immatriculation: `DA-${String(101 + i).padStart(3, "0")}-AA`,
        kilometrage: 40000 + i * 9000,
      }))).select());

    // Quatorze rendez-vous aujourd'hui, répartis sur toutes les étapes : des
    // arrivées, des voitures en cours, des blocages, des prêtes.
    const etapes = ["a_venir", "a_venir", "a_venir", "a_venir",
                    "depose", "diagnostic", "intervention", "intervention",
                    "attente_client", "attente_piece",
                    "pret", "pret", "pret", "restitue"];
    await exigerOk("rdv chargée", db.from("rendez_vous").insert(
      etapes.map((etape, i) => ({
        garage_id: garage.id,
        client_id: clients[i].id,
        vehicule_id: vehicules[i].id,
        statut: etape === "restitue" ? "termine" : "confirme",
        source: "manuel",
        statut_atelier: etape,
        mecanicien_id: i % 3 === 0 ? null : meca[i % 2].id,
        // Les arrivées s'étalent sur la journée ; les deux premières sont
        // déjà passées, pour éprouver « attendue à 8 h, pas encore là ».
        ...creneau(etape === "intervention" || etape === "attente_piece" ? -1 : 0, 8 + (i % 10), 60),
      }))));

    faits.push({ situation: "journée chargée", garage: garage.id, email, rdv: 14, clients: clients.length });
  }

  console.log("\nTrois garages de recette créés sur Test :\n");
  for (const f of faits) {
    console.log(`  ${f.situation.padEnd(16)} ${f.garage}`);
    console.log(`  ${"".padEnd(16)} ${f.email}`);
    console.log(`  ${"".padEnd(16)} ${f.clients} client(s), ${f.rdv} rendez-vous aujourd'hui\n`);
  }
}

async function etat() {
  const { data } = await db.from("garages").select("id, nom_garage, email")
    .like("nom_garage", `${PREFIXE}%`).order("created_at", { ascending: false });
  for (const g of data || []) {
    const { count: nbRdv } = await db.from("rendez_vous").select("id", { count: "exact", head: true }).eq("garage_id", g.id);
    const { count: nbCl } = await db.from("clients").select("id", { count: "exact", head: true }).eq("garage_id", g.id);
    console.log(`${g.id}  ${g.nom_garage}\n    ${nbCl} client(s), ${nbRdv} rendez-vous — ${g.email}`);
  }
  if (!data?.length) console.log("(aucun garage PROTO Aujourdhui sur Test)");
}

async function purger(garageId) {
  const { data: g } = await db.from("garages").select("id, nom_garage").eq("id", garageId).maybeSingle();
  if (!g) { console.error("REFUS : garage introuvable."); process.exit(2); }
  if (!g.nom_garage.startsWith(PREFIXE)) {
    console.error(`REFUS : « ${g.nom_garage} » n'est pas un garage de recette Aujourd'hui.`);
    process.exit(2);
  }
  for (const table of ["notifications_atelier"]) {
    const { data: rdv } = await db.from("rendez_vous").select("id").eq("garage_id", garageId);
    if (rdv?.length) await db.from(table).delete().in("rendez_vous_id", rdv.map((r) => r.id));
  }
  for (const table of ["rendez_vous", "vehicules", "clients", "mecaniciens", "garage_membres"]) {
    const { error } = await db.from(table).delete().eq("garage_id", garageId);
    if (error) console.log(`  ${table} : non supprimé (${error.message})`);
  }
  const { error } = await db.from("garages").delete().eq("id", garageId);
  console.log(error ? `garage non supprimé : ${error.message}` : `garage ${g.nom_garage} supprimé`);
}

const [, , commande, argument] = process.argv;
if (commande === "creer") await creer();
else if (commande === "etat") await etat();
else if (commande === "purger") await purger(argument);
else { console.error("Usage : creer | etat | purger <garage_id>"); process.exit(2); }
