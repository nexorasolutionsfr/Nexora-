// Jeu de données pour la recette « constat → devis » et « modèles de travaux »
// — Supabase TEST seul.
//
// Mêmes garde-fous que jeu-atelier.mjs : refus hors projet Test, adresses en
// `.invalid`, purge bornée à un garage dont le nom commence par « PROTO Constat ».
//
// Ce que le jeu pose, et pourquoi :
//   - un garage A « PROTO Constat » avec un dirigeant, un accueil actif, un
//     mécanicien affecté et un accueil RÉVOQUÉ (adhésion inactive) ;
//   - une voiture immatriculée BA-101-AA — la même plaque que la 208 de
//     « PROTO Atelier 2026-09-13-08h38 » : deux garages, une plaque ;
//   - un rendez-vous du jour sur cette voiture, à l'atelier (diagnostic) ;
//   - un contrôle NON verrouillé avec trois constats : un « dommage » avec
//     photo, un « à valider avec le client » soumis et REFUSÉ par le client,
//     un « à surveiller » sans photo ; plus un point OK ;
//   - un second contrôle, verrouillé (finalisé), sur la même voiture, avec un
//     constat « à valider » validé par le client ;
//   - un devis en attente déjà existant sur la voiture, avec une ligne
//     chiffrée, pour le cas « compléter un devis existant » ;
//   - un devis accepté (verrouillé) sur la voiture, pour le cas « document
//     verrouillé » ;
//   - un catalogue de prestations, dont une sans prix.
//
// Usage :
//   node scripts/recette/jeu-constat-devis.mjs creer
//   node scripts/recette/jeu-constat-devis.mjs etat
//   node scripts/recette/jeu-constat-devis.mjs purger <garage_id>
//
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

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

const HORODATAGE = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "h");
const NOM_GARAGE = `PROTO Constat ${HORODATAGE} — données fictives`;
const SUFFIXE = HORODATAGE.replace(/[^0-9a-z]/gi, "");
const EMAIL_DIRIGEANT = `recette.constat.${SUFFIXE}@nexora-recette.invalid`;
const EMAIL_ACCUEIL = `recette.constat.accueil.${SUFFIXE}@nexora-recette.invalid`;
const EMAIL_MECANO = `recette.constat.meca.${SUFFIXE}@nexora-recette.invalid`;
const EMAIL_REVOQUE = `recette.constat.revoque.${SUFFIXE}@nexora-recette.invalid`;

async function exigerOk(libelle, promesse) {
  const { data, error } = await promesse;
  if (error) {
    console.error(`ÉCHEC ${libelle} :`, error.message || error);
    process.exit(1);
  }
  return data;
}

async function utilisateur(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => u.email === email) || null;
}

async function creerUtilisateur(email) {
  const existant = await utilisateur(email);
  if (existant) return existant;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) { console.error("ÉCHEC utilisateur :", error.message); process.exit(1); }
  return data.user;
}

async function sessionDe(email) {
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) { console.error("ÉCHEC lien :", error.message); process.exit(1); }
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: err2 } = await anon.auth.verifyOtp({ email, token: data.properties.email_otp, type: "email" });
  if (err2) { console.error("ÉCHEC session :", err2.message); process.exit(1); }
  return anon;
}

function creneau(joursDecalage, heureDebut, dureeMinutes = 60) {
  const d = new Date();
  d.setDate(d.getDate() + joursDecalage);
  d.setHours(heureDebut, 0, 0, 0);
  const f = new Date(d.getTime() + dureeMinutes * 60_000);
  return { date_debut: d.toISOString(), date_fin: f.toISOString() };
}

// Une vraie image PNG, fabriquée ici : un aplat rouge sombre 96×64 avec une
// bande claire — assez pour qu'une vignette se voie, sans dépendance.
function imagePng(largeur = 96, hauteur = 64) {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const lignes = [];
  for (let y = 0; y < hauteur; y++) {
    const ligne = Buffer.alloc(1 + largeur * 3);
    for (let x = 0; x < largeur; x++) {
      const clair = y > hauteur * 0.4 && y < hauteur * 0.6;
      ligne[1 + x * 3] = clair ? 220 : 120;
      ligne[2 + x * 3] = clair ? 200 : 40;
      ligne[3 + x * 3] = clair ? 180 : 40;
    }
    lignes.push(ligne);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(lignes))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function garagesProto() {
  const { data } = await db.from("garages").select("id, nom_garage, created_at").ilike("nom_garage", "PROTO Constat%").order("created_at", { ascending: false });
  return data || [];
}

async function creer() {
  const dirigeant = await creerUtilisateur(EMAIL_DIRIGEANT);
  const accueil = await creerUtilisateur(EMAIL_ACCUEIL);
  const mecano = await creerUtilisateur(EMAIL_MECANO);
  const revoque = await creerUtilisateur(EMAIL_REVOQUE);

  const garage = await exigerOk("garage", db.from("garages").insert({
    nom_garage: NOM_GARAGE,
    email: EMAIL_DIRIGEANT,
    telephone: "0100000000",
    owner_user_id: dirigeant.id,
    acces_motif: "illimite",
  }).select().single());

  await exigerOk("membre dirigeant", db.from("garage_membres").insert({ garage_id: garage.id, user_id: dirigeant.id, role: "dirigeant" }));
  const [karim] = await exigerOk("mécaniciens", db.from("mecaniciens").insert([
    { garage_id: garage.id, nom: "Karim B.", couleur: "#3D6BE0", actif: true },
  ]).select());
  await exigerOk("membre accueil", db.from("garage_membres").insert({ garage_id: garage.id, user_id: accueil.id, role: "accueil" }));
  await exigerOk("membre mécanicien", db.from("garage_membres").insert({ garage_id: garage.id, user_id: mecano.id, role: "mecanicien", mecanicien_id: karim.id }));
  // L'accueil révoqué : adhésion créée puis fermée, comme le ferait l'écran.
  const membreRevoque = await exigerOk("membre à révoquer", db.from("garage_membres").insert({ garage_id: garage.id, user_id: revoque.id, role: "accueil" }).select().single());
  await exigerOk("révocation", db.from("garage_membres").update({ actif: false, revoked_at: new Date().toISOString() }).eq("id", membreRevoque.id));

  const prestations = await exigerOk("prestations", db.from("prestations").insert([
    { garage_id: garage.id, nom: "Plaquettes de frein avant", duree_minutes: 90, prix_ht: 140, categorie: "Freinage" },
    { garage_id: garage.id, nom: "Diagnostic électronique", duree_minutes: 60, prix_ht: 60, categorie: "Diagnostic" },
    // Sans prix : le catalogue est un catalogue de durées, pas de prix.
    { garage_id: garage.id, nom: "Remplacement pneu", duree_minutes: 30, prix_ht: null, categorie: "Pneus" },
    { garage_id: garage.id, nom: "Vidange", duree_minutes: 45, prix_ht: 70, categorie: "Entretien" },
  ]).select());
  const p = Object.fromEntries(prestations.map((x) => [x.nom, x.id]));

  const [client, clientLong] = await exigerOk("clients", db.from("clients").insert([
    { garage_id: garage.id, nom: "Claire Fontaine", email: "claire.fontaine@nexora-recette.invalid", telephone: "0612345678", est_professionnel: false },
    { garage_id: garage.id, nom: "Anne-Sophie de Montmorency-Laval-Beaumont", email: "as.montmorency@nexora-recette.invalid", telephone: "0698765432", est_professionnel: false },
  ]).select());

  const [vehicule, vehiculeLong] = await exigerOk("véhicules", db.from("vehicules").insert([
    // Même plaque que la 208 de PROTO Atelier : deux garages, une plaque.
    { garage_id: garage.id, client_id: client.id, marque: "Peugeot", modele: "308 SW", annee: 2018, immatriculation: "BA-101-AA", kilometrage: 91000 },
    { garage_id: garage.id, client_id: clientLong.id, marque: "Mercedes-Benz", modele: "Classe E All-Terrain 4MATIC", annee: 2021, immatriculation: "BC-303-CC", kilometrage: 38000 },
  ]).select());

  const [rdvJour, rdvAncien, rdvLong] = await exigerOk("rendez-vous", db.from("rendez_vous").insert([
    { garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, prestation_id: p["Diagnostic électronique"], ...creneau(0, 9, 60), statut: "confirme", source: "manuel", statut_atelier: "diagnostic", mecanicien_id: karim.id, notes: "Bruit au freinage depuis une semaine, voyant moteur allumé par intermittence." },
    { garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, prestation_id: p["Vidange"], ...creneau(-120, 9, 45), statut: "termine", source: "manuel", statut_atelier: "restitue", mecanicien_id: karim.id },
    { garage_id: garage.id, client_id: clientLong.id, vehicule_id: vehiculeLong.id, prestation_id: p["Plaquettes de frein avant"], ...creneau(0, 14, 90), statut: "confirme", source: "manuel", statut_atelier: "a_venir", mecanicien_id: null },
  ]).select());

  // --- Le contrôle ouvert, avec ses constats -------------------------------
  const controle = await exigerOk("contrôle ouvert", db.from("inspections").insert({
    garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, rendez_vous_id: rdvJour.id,
    kilometrage: 91250, niveau_carburant: "moitie", statut: "brouillon",
  }).select().single());

  const points = await exigerOk("points", db.from("inspections_points").insert([
    // Insertion groupée : PostgREST envoie NULL pour toute clé absente d'une
    // ligne dès qu'une autre la porte — `soumis_client` est donc posé partout.
    { inspection_id: controle.id, garage_id: garage.id, categorie: "pneus", libelle: "Plaquettes de frein avant", etat: "dommage", commentaire: "Usées à 2 mm, disque marqué. À remplacer avant restitution.", soumis_client: false },
    { inspection_id: controle.id, garage_id: garage.id, categorie: "exterieur", libelle: "Pare-brise", etat: "a_valider_client", commentaire: "Impact côté passager, hors champ de vision.", soumis_client: true },
    { inspection_id: controle.id, garage_id: garage.id, categorie: "pneus", libelle: "Pneu arrière droit", etat: "a_surveiller", commentaire: "Témoin d'usure atteint sur le bord extérieur.", soumis_client: false },
    { inspection_id: controle.id, garage_id: garage.id, categorie: "voyants", libelle: "Voyant moteur", etat: "ok", commentaire: null, soumis_client: false },
  ]).select());
  const [pointDommage, pointRefuse] = points;
  // Le client a refusé le pare-brise. La colonne `decision_client` n'est pas
  // bloquée par le verrou, et exige `soumis_client = true` (contrainte).
  await exigerOk("décision refus", db.from("inspections_points").update({ decision_client: "refuse", decision_le: new Date().toISOString() }).eq("id", pointRefuse.id));

  const chemin = `${garage.id}/${controle.id}/plaquettes-avant.png`;
  await exigerOk("photo", db.storage.from("inspections-photos").upload(chemin, imagePng(), { contentType: "image/png", upsert: true }));
  await exigerOk("photo enregistrée", db.from("inspections_photos").insert({ inspection_id: controle.id, garage_id: garage.id, point_id: pointDommage.id, storage_path: chemin }));

  // --- Le contrôle verrouillé, plus ancien, même voiture -------------------
  const controleVerrouille = await exigerOk("contrôle verrouillé", db.from("inspections").insert({
    garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, rendez_vous_id: rdvAncien.id,
    kilometrage: 84000, statut: "brouillon",
  }).select().single());
  const [pointValide] = await exigerOk("point validé", db.from("inspections_points").insert([
    { inspection_id: controleVerrouille.id, garage_id: garage.id, categorie: "pneus", libelle: "Pneus avant", etat: "a_valider_client", commentaire: "Usure asymétrique, géométrie à contrôler.", soumis_client: true },
  ]).select());
  await exigerOk("verrouillage", db.from("inspections").update({ statut: "valide", verrouille_le: new Date().toISOString() }).eq("id", controleVerrouille.id));
  await exigerOk("décision validé", db.from("inspections_points").update({ decision_client: "valide", decision_le: new Date().toISOString() }).eq("id", pointValide.id));

  // --- Devis existants -----------------------------------------------------
  const [devisEnAttente, devisAccepte] = await exigerOk("devis", db.from("devis").insert([
    { garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, prestation_id: p["Diagnostic électronique"], montant_ht: 0, montant_ttc: 0, statut: "en_attente" },
    { garage_id: garage.id, client_id: client.id, vehicule_id: vehicule.id, prestation_id: p["Vidange"], montant_ht: 70, montant_ttc: 84, statut: "en_attente" },
  ]).select());
  // `devis_lignes` n'accorde rien à la clé de service (20260904000100) : la
  // ligne s'écrit sous la session du dirigeant, comme l'écran le ferait.
  const session = await sessionDe(EMAIL_DIRIGEANT);
  await exigerOk("ligne du devis en attente", session.from("devis_lignes").insert({
    devis_id: devisEnAttente.id, garage_id: garage.id, type: "main_oeuvre", libelle: "Diagnostic électronique", quantite: 1, prix_unitaire_ht: 60, taux_tva: 20, position: 0, prestation_id: p["Diagnostic électronique"],
  }));
  // Le second devis est accepté APRÈS insertion : la transition en_attente →
  // accepte est la seule que l'immuabilité laisse passer — et sous session,
  // parce que le trigger appelle `devis_statut_modifiable`, fermée à la clé
  // de service.
  await exigerOk("acceptation", session.from("devis").update({ statut: "accepte", date_validation: new Date().toISOString(), reponse_origine: "garage" }).eq("id", devisAccepte.id));

  console.log(`Garage A : ${garage.id}`);
  console.log(`Dirigeant : ${EMAIL_DIRIGEANT}`);
  console.log(`Accueil   : ${EMAIL_ACCUEIL}`);
  console.log(`Mécanicien: ${EMAIL_MECANO}`);
  console.log(`Révoqué   : ${EMAIL_REVOQUE}`);
  console.log(`Véhicule BA-101-AA : ${vehicule.id} (client ${client.id})`);
  console.log(`Rendez-vous du jour : ${rdvJour.id}`);
  console.log(`Contrôle ouvert : ${controle.id} — dommage ${pointDommage.id}, refusé ${pointRefuse.id}, à surveiller ${points[2].id}, ok ${points[3].id}`);
  console.log(`Contrôle verrouillé : ${controleVerrouille.id} — point validé ${pointValide.id}`);
  console.log(`Devis en attente : ${devisEnAttente.id} ; devis accepté (verrouillé) : ${devisAccepte.id}`);
  console.log(`Véhicule au nom long : ${vehiculeLong.immatriculation} (${rdvLong.id})`);
}

async function etat() {
  for (const g of await garagesProto()) {
    const { count: d } = await db.from("devis").select("*", { count: "exact", head: true }).eq("garage_id", g.id);
    const { count: i } = await db.from("inspections").select("*", { count: "exact", head: true }).eq("garage_id", g.id);
    const { count: r } = await db.from("devis_reprises").select("*", { count: "exact", head: true }).eq("garage_id", g.id);
    console.log(`${g.id}  ${g.nom_garage}  devis=${d} contrôles=${i} reprises=${r}`);
  }
}

async function purger(garageId) {
  const { data: g } = await db.from("garages").select("id, nom_garage").eq("id", garageId).single();
  if (!g || !g.nom_garage.startsWith("PROTO Constat")) {
    console.error("REFUS : ce garage n'est pas un garage « PROTO Constat ».");
    process.exit(2);
  }
  const dire = (t, { error, count }) => console.log(`${t}: ${error ? "ÉCHEC — " + error.message : (count ?? "?") + " supprimé(s)"}`);

  // Les devis et leurs lignes passent par la session du dirigeant : la
  // suppression en cascade des lignes déclenche `devis_lignes_check_integrite`,
  // qui appelle `devis_statut_modifiable`, fermée à la clé de service. Un
  // devis accepté ou refusé ne se supprime pas (immuabilité) : il reste, et le
  // garage avec lui — c'est annoncé, pas contourné.
  const { data: garage } = await db.from("garages").select("owner_user_id").eq("id", garageId).single();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const proprietaire = (users?.users || []).find((u) => u.id === garage?.owner_user_id);
  const session = proprietaire ? await sessionDe(proprietaire.email) : null;
  dire("devis_reprises", await db.from("devis_reprises").delete({ count: "exact" }).eq("garage_id", garageId));
  if (session) {
    dire("devis_lignes", await session.from("devis_lignes").delete({ count: "exact" }).eq("garage_id", garageId));
    dire("devis (modifiables)", await session.from("devis").delete({ count: "exact" }).eq("garage_id", garageId).in("statut", ["brouillon", "en_attente"]));
  }
  const { data: rdvs } = await db.from("rendez_vous").select("id").eq("garage_id", garageId);
  const rdvIds = (rdvs || []).map((r) => r.id);
  if (rdvIds.length) {
    for (const t of ["confirmations_jetons", "confirmations_rappels_file", "notifications_atelier", "atelier_jetons"]) {
      dire(t, await db.from(t).delete({ count: "exact" }).in("rendez_vous_id", rdvIds));
    }
  }
  for (const t of ["inspections_photos", "inspections_points", "inspections_historique", "inspections_jetons", "inspections", "rendez_vous", "vehicules", "clients", "prestations", "garage_membres", "mecaniciens"]) {
    dire(t, await db.from(t).delete({ count: "exact" }).eq("garage_id", garageId));
  }
  const { error } = await db.from("garages").delete().eq("id", garageId);
  console.log(error ? `garage : conservé — ${error.message}` : "garage : supprimé");
}

const [commande, arg] = process.argv.slice(2);
if (commande === "creer") await creer();
else if (commande === "etat") await etat();
else if (commande === "purger" && arg) await purger(arg);
else { console.log("Usage : creer | etat | purger <garage_id>"); process.exit(1); }
