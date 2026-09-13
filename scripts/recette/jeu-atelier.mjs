// Jeu de données fictif pour la recette de l'écran Atelier — Supabase TEST seul.
//
// POURQUOI UN SCRIPT PLUTÔT QU'UNE SÉRIE DE CLICS
//
// L'écran Atelier se juge sur des situations qu'on ne rencontre pas en
// cliquant : une voiture bloquée depuis avant-hier, un devis dont l'envoi
// est incertain, un véhicule sans plaque, un nom qui déborde de sa colonne.
// Les recomposer à la main à chaque recette coûte une heure et on en oublie
// toujours un. Ici, ils sont écrits une fois et rejouables.
//
// TROIS GARDE-FOUS, DANS CET ORDRE
//   1. refus de démarrer si l'URL Supabase ne vise pas le projet Test ;
//   2. toutes les adresses client sont en `.invalid` — un envoi accidentel
//      ne peut atteindre personne, le domaine n'existe pas par norme (RFC 2606) ;
//   3. `purger` ne touche qu'un garage désigné par son identifiant, et
//      refuse tout garage dont le nom ne commence pas par « PROTO Atelier ».
//
// UN JEU DE RECETTE NE SE SUPPRIME PAS ENTIÈREMENT — ET C'EST VOULU
//
// Mesuré le 13 septembre 2026, en tentant de le faire :
//   — `devis_check_immuabilite` interdit de supprimer OU de modifier un devis
//     dont le statut n'est ni `brouillon` ni `en_attente`. Un devis accepté
//     ou refusé est définitif, pour tout le monde ;
//   — `ordres_reparation` n'accorde `DELETE` à aucun rôle applicatif : ni
//     `authenticated`, ni `service_role`. Un ordre de réparation ne se
//     supprime pas depuis l'application.
// Ces deux règles sont des protections juridiques, pas des oublis. On ne les
// contourne pas. Conséquence assumée : dès qu'un garage de recette a porté un
// devis accepté ou un ordre, il reste sur Test. `creer` fabrique donc à chaque
// fois un garage horodaté distinct plutôt que de réécrire le même, et `purger`
// annonce ce qu'il n'a pas pu supprimer au lieu de le passer sous silence.
//
// Usage :
//   node scripts/recette/jeu-atelier.mjs creer
//   node scripts/recette/jeu-atelier.mjs etat
//   node scripts/recette/jeu-atelier.mjs purger <garage_id>
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

// `ordres_reparation` est fermée à la clé de service — c'est un durcissement
// voulu du projet, pas un oubli : aucune clé d'API ne doit pouvoir écrire un
// ordre de réparation. On ne le contourne pas. Ce client-ci ouvre une vraie
// session du dirigeant de recette et écrit donc sous RLS, exactement comme
// l'écran le ferait. Les triggers d'intégrité s'appliquent à l'identique.
async function clientDuDirigeant(email) {
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) { console.error("ÉCHEC lien dirigeant :", error.message); process.exit(1); }
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: err2 } = await anon.auth.verifyOtp({
    email, token: data.properties.email_otp, type: "email",
  });
  if (err2) { console.error("ÉCHEC session dirigeant :", err2.message); process.exit(1); }
  return anon;
}

/** La même session, retrouvée à partir du garage plutôt que de l'adresse —
 *  `purger` reçoit un identifiant de garage, pas le compte qui va avec. */
async function clientDuDirigeantDe(garageId) {
  const { data: membre } = await db.from("garage_membres")
    .select("user_id").eq("garage_id", garageId).eq("role", "dirigeant").eq("actif", true).maybeSingle();
  if (!membre) { console.error("REFUS : ce garage n'a plus de dirigeant actif."); process.exit(2); }
  const { data } = await db.auth.admin.getUserById(membre.user_id);
  const email = data?.user?.email;
  if (!email?.endsWith("@nexora-recette.invalid")) {
    console.error("REFUS : le dirigeant de ce garage n'est pas un compte de recette.");
    process.exit(2);
  }
  return clientDuDirigeant(email);
}

const PREFIXE_GARAGE = "PROTO Atelier";
// Horodaté : un jeu de recette ne se supprime pas entièrement (voir l'en-tête),
// donc on n'essaie pas de réécrire le même garage — on en nomme un nouveau.
//
// Les trois comptes portent le même repère. Sans cela, un compte se
// retrouverait membre de deux garages de recette et `current_garage_id()`,
// qui prend le premier de `mes_garages_ouverts()`, ouvrirait l'ancien.
const REPERE = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "h");
const NOM_GARAGE = `${PREFIXE_GARAGE} ${REPERE} — données fictives`;
const SUFFIXE_COMPTE = REPERE.replace(/[^0-9a-z]/gi, "").toLowerCase();
const EMAIL_DIRIGEANT = `recette.proto.atelier.${SUFFIXE_COMPTE}@nexora-recette.invalid`;
const EMAIL_ACCUEIL = `recette.proto.atelier.accueil.${SUFFIXE_COMPTE}@nexora-recette.invalid`;
const EMAIL_MECANO = `recette.proto.atelier.meca.${SUFFIXE_COMPTE}@nexora-recette.invalid`;

function creneau(joursDecalage, heureDebut, dureeMinutes = 60) {
  const d = new Date();
  d.setDate(d.getDate() + joursDecalage);
  d.setHours(heureDebut, 0, 0, 0);
  const f = new Date(d.getTime() + dureeMinutes * 60000);
  return { date_debut: d.toISOString(), date_fin: f.toISOString() };
}

async function exigerOk(libelle, promesse) {
  const { data, error } = await promesse;
  if (error) {
    console.error(`ÉCHEC ${libelle} :`, error.message);
    process.exit(1);
  }
  return data;
}

async function garagesProto() {
  const { data } = await db.from("garages").select("id, nom_garage, created_at")
    .like("nom_garage", `${PREFIXE_GARAGE}%`).order("created_at", { ascending: false });
  return data || [];
}

async function garageProtoLePlusRecent() {
  return (await garagesProto())[0] || null;
}

async function utilisateur(email) {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => u.email === email) || null;
}

async function creerUtilisateur(email) {
  const existant = await utilisateur(email);
  if (existant) return existant;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) { console.error(`ÉCHEC création compte ${email} :`, error.message); process.exit(1); }
  return data.user;
}

// ---------------------------------------------------------------------------

async function creer() {
  const dejaLa = await garagesProto();
  if (dejaLa.length) {
    console.log(`(${dejaLa.length} garage(s) PROTO Atelier déjà sur Test — on en ajoute un, voir l'en-tête.)`);
  }

  const dirigeant = await creerUtilisateur(EMAIL_DIRIGEANT);
  const accueil = await creerUtilisateur(EMAIL_ACCUEIL);
  const mecano = await creerUtilisateur(EMAIL_MECANO);

  // `acces_motif = 'illimite'` : la règle d'accès lit acces_fin/acces_motif,
  // jamais essai_fin (colonne morte). Sans ce motif, le garage de recette
  // expirerait au bout de 14 jours et la recette suivante buterait sur un
  // écran « votre essai est terminé » sans rapport avec l'atelier.
  const garage = await exigerOk("garage", db.from("garages").insert({
    nom_garage: NOM_GARAGE,
    email: EMAIL_DIRIGEANT,
    telephone: "0100000000",
    owner_user_id: dirigeant.id,
    acces_motif: "illimite",
  }).select().single());

  await exigerOk("membre dirigeant", db.from("garage_membres").insert({
    garage_id: garage.id, user_id: dirigeant.id, role: "dirigeant",
  }));

  const mecaniciens = await exigerOk("mécaniciens", db.from("mecaniciens").insert([
    { garage_id: garage.id, nom: "Karim B.", couleur: "#3D6BE0", actif: true },
    { garage_id: garage.id, nom: "Jean-Baptiste de La Rochefoucauld-Montmorency", couleur: "#0F766E", actif: true },
    { garage_id: garage.id, nom: "Sofia M.", couleur: "#7C3AED", actif: true },
  ]).select());
  const [karim, nomLong, sofia] = mecaniciens;

  await exigerOk("membre accueil", db.from("garage_membres").insert({
    garage_id: garage.id, user_id: accueil.id, role: "accueil",
  }));
  await exigerOk("membre mécanicien", db.from("garage_membres").insert({
    garage_id: garage.id, user_id: mecano.id, role: "mecanicien", mecanicien_id: karim.id,
  }));

  const prestations = await exigerOk("prestations", db.from("prestations").insert([
    { garage_id: garage.id, nom: "Révision complète", duree_minutes: 120, prix_ht: 180, categorie: "Entretien" },
    { garage_id: garage.id, nom: "Plaquettes de frein avant", duree_minutes: 90, prix_ht: 140, categorie: "Freinage" },
    { garage_id: garage.id, nom: "Diagnostic électronique", duree_minutes: 60, prix_ht: 60, categorie: "Diagnostic" },
    { garage_id: garage.id, nom: "Remplacement de l'embrayage sur boîte automatique à double embrayage", duree_minutes: 480, prix_ht: 1250, categorie: "Mécanique" },
    { garage_id: garage.id, nom: "Vidange", duree_minutes: 45, prix_ht: 70, categorie: "Entretien" },
  ]).select());
  const p = Object.fromEntries(prestations.map((x) => [x.nom, x.id]));

  // Les clients. Adresses toutes en .invalid — cf. garde-fou n°2.
  const clients = await exigerOk("clients", db.from("clients").insert([
    { garage_id: garage.id, nom: "Camille Perrin", email: "camille.perrin@nexora-recette.invalid", telephone: "0612345678", est_professionnel: false },
    { garage_id: garage.id, nom: "Étienne Vasseur", email: "etienne.vasseur@nexora-recette.invalid", telephone: "0698765432", est_professionnel: false },
    { garage_id: garage.id, nom: "Marie-Alexandrine de Kervasdoué-Lestrange", email: "ma.kervasdoue@nexora-recette.invalid", telephone: "+33711223344", est_professionnel: false },
    { garage_id: garage.id, nom: "Sonia Bahri", email: "sonia.bahri@nexora-recette.invalid", telephone: "0655443322", est_professionnel: false },
    { garage_id: garage.id, nom: "Transports Delaunay", email: "contact@nexora-recette.invalid", telephone: "0388990011", est_professionnel: true },
    { garage_id: garage.id, nom: "Yanis Cherif", email: null, telephone: null, est_professionnel: false },
    { garage_id: garage.id, nom: "Hélène Ngô", email: "helene.ngo@nexora-recette.invalid", telephone: "0744556677", est_professionnel: false },
    { garage_id: garage.id, nom: "Paul Ferrand", email: "paul.ferrand@nexora-recette.invalid", telephone: "0622334455", est_professionnel: false },
    { garage_id: garage.id, nom: "Nadia Lemoine", email: "nadia.lemoine@nexora-recette.invalid", telephone: "0766778899", est_professionnel: false },
    { garage_id: garage.id, nom: "Olivier Sanchez", email: "olivier.sanchez@nexora-recette.invalid", telephone: "0611998877", est_professionnel: false },
  ]).select());
  const c = Object.fromEntries(clients.map((x) => [x.nom, x.id]));

  const vehicules = await exigerOk("véhicules", db.from("vehicules").insert([
    { garage_id: garage.id, client_id: c["Camille Perrin"], marque: "Peugeot", modele: "208", annee: 2019, immatriculation: "BA-101-AA", kilometrage: 84000 },
    { garage_id: garage.id, client_id: c["Étienne Vasseur"], marque: "Renault", modele: "Clio IV", annee: 2016, immatriculation: "BB-202-BB", kilometrage: 132000 },
    { garage_id: garage.id, client_id: c["Marie-Alexandrine de Kervasdoué-Lestrange"], marque: "Volkswagen", modele: "Tiguan Allspace R-Line", annee: 2021, immatriculation: "BC-303-CC", kilometrage: 41000 },
    { garage_id: garage.id, client_id: c["Sonia Bahri"], marque: "Citroën", modele: "C3", annee: 2018, immatriculation: "BD-404-DD", kilometrage: 96000 },
    { garage_id: garage.id, client_id: c["Transports Delaunay"], marque: "Renault", modele: "Master", annee: 2020, immatriculation: "BE-505-EE", kilometrage: 210000 },
    // Véhicule sans plaque : cas réel (véhicule neuf non immatriculé, ou
    // fiche créée au téléphone). L'écran ne doit ni planter ni mentir.
    { garage_id: garage.id, client_id: c["Yanis Cherif"], marque: "Dacia", modele: "Sandero", annee: 2022, immatriculation: null, kilometrage: 22000 },
    // Marque manquante : la fiche a été ouverte avec la seule plaque.
    { garage_id: garage.id, client_id: c["Hélène Ngô"], marque: null, modele: null, annee: null, immatriculation: "BF-606-FF", kilometrage: null },
    { garage_id: garage.id, client_id: c["Paul Ferrand"], marque: "Toyota", modele: "Yaris", annee: 2017, immatriculation: "BG-707-GG", kilometrage: 118000 },
    { garage_id: garage.id, client_id: c["Nadia Lemoine"], marque: "Ford", modele: "Focus", annee: 2015, immatriculation: "BH-808-HH", kilometrage: 165000 },
    { garage_id: garage.id, client_id: c["Olivier Sanchez"], marque: "BMW", modele: "Série 1", annee: 2020, immatriculation: "BI-909-II", kilometrage: 58000 },
    { garage_id: garage.id, client_id: c["Camille Perrin"], marque: "Fiat", modele: "500", annee: 2014, immatriculation: "BJ-010-JJ", kilometrage: 143000 },
    { garage_id: garage.id, client_id: c["Sonia Bahri"], marque: "Opel", modele: "Corsa", annee: 2019, immatriculation: "BK-111-KK", kilometrage: 71000 },
  ]).select());
  const v = Object.fromEntries(vehicules.map((x) => [x.immatriculation || "SANS-PLAQUE", x.id]));

  // --- Les rendez-vous, un par situation à éprouver -------------------------
  const lignes = [
    // À recevoir — deux voitures attendues aujourd'hui, l'une non affectée.
    { cle: "BA-101-AA", cl: "Camille Perrin", presta: "Révision complète", etape: "a_venir", meca: karim.id, ...creneau(0, 8, 120) },
    { cle: "SANS-PLAQUE", cl: "Yanis Cherif", presta: "Vidange", etape: "a_venir", meca: null, ...creneau(0, 14, 45) },

    // En atelier — le travail avance.
    { cle: "BB-202-BB", cl: "Étienne Vasseur", presta: "Plaquettes de frein avant", etape: "depose", meca: karim.id, ...creneau(0, 9, 90) },
    { cle: "BF-606-FF", cl: "Hélène Ngô", presta: "Diagnostic électronique", etape: "diagnostic", meca: sofia.id, ...creneau(0, 10, 60) },
    { cle: "BC-303-CC", cl: "Marie-Alexandrine de Kervasdoué-Lestrange", presta: "Remplacement de l'embrayage sur boîte automatique à double embrayage", etape: "intervention", meca: nomLong.id, ...creneau(-1, 8, 480) },

    // En attente — rien n'avance, et il faut dire pourquoi.
    { cle: "BD-404-DD", cl: "Sonia Bahri", presta: "Diagnostic électronique", etape: "attente_client", meca: sofia.id, ...creneau(-1, 11, 60) },
    { cle: "BE-505-EE", cl: "Transports Delaunay", presta: "Révision complète", etape: "attente_piece", meca: karim.id, ...creneau(-2, 8, 120) },

    // Prêtes.
    { cle: "BG-707-GG", cl: "Paul Ferrand", presta: "Vidange", etape: "pret", meca: karim.id, ...creneau(0, 8, 45) },
    { cle: "BH-808-HH", cl: "Nadia Lemoine", presta: "Plaquettes de frein avant", etape: "pret", meca: sofia.id, ...creneau(-1, 15, 90) },

    // Restituée aujourd'hui — la facture reste à faire.
    { cle: "BI-909-II", cl: "Olivier Sanchez", presta: "Révision complète", etape: "restitue", meca: nomLong.id, ...creneau(0, 8, 120) },

    // Devis accepté, travaux pas encore lancés, et devis refusé.
    { cle: "BJ-010-JJ", cl: "Camille Perrin", presta: "Plaquettes de frein avant", etape: "a_venir", meca: null, ...creneau(0, 16, 90) },
    { cle: "BK-111-KK", cl: "Sonia Bahri", presta: "Diagnostic électronique", etape: "a_venir", meca: null, ...creneau(0, 17, 60) },

    // Plusieurs interventions pour un même véhicule : trois visites passées
    // sur la Clio, en plus de celle qui est à l'atelier aujourd'hui.
    { cle: "BB-202-BB", cl: "Étienne Vasseur", presta: "Vidange", etape: "restitue", meca: karim.id, statut: "termine", ...creneau(-45, 9, 45) },
    { cle: "BB-202-BB", cl: "Étienne Vasseur", presta: "Révision complète", etape: "restitue", meca: sofia.id, statut: "termine", ...creneau(-180, 9, 120) },
    { cle: "BB-202-BB", cl: "Étienne Vasseur", presta: "Diagnostic électronique", etape: "restitue", meca: karim.id, statut: "termine", ...creneau(-320, 14, 60) },
  ];

  const rdvs = await exigerOk("rendez-vous", db.from("rendez_vous").insert(lignes.map((l) => ({
    garage_id: garage.id,
    client_id: c[l.cl],
    vehicule_id: v[l.cle],
    prestation_id: p[l.presta],
    date_debut: l.date_debut,
    date_fin: l.date_fin,
    statut: l.statut || "confirme",
    source: "manuel",
    statut_atelier: l.etape,
    mecanicien_id: l.meca,
  }))).select());

  const parPlaque = (plaque, rang = 0) =>
    rdvs.filter((r) => r.vehicule_id === v[plaque]).sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut))[rang];

  // --- Devis : un accepté, un refusé, et trois états d'envoi ---------------
  const rdvAccepte = rdvs.find((r) => r.vehicule_id === v["BJ-010-JJ"]);
  const rdvRefuse = rdvs.find((r) => r.vehicule_id === v["BK-111-KK"]);
  const rdvAttenteClient = rdvs.find((r) => r.vehicule_id === v["BD-404-DD"]);
  const rdvIntervention = rdvs.find((r) => r.vehicule_id === v["BC-303-CC"]);
  const rdvPiece = rdvs.find((r) => r.vehicule_id === v["BE-505-EE"]);

  const devis = await exigerOk("devis", db.from("devis").insert([
    { garage_id: garage.id, client_id: c["Camille Perrin"], vehicule_id: v["BJ-010-JJ"], prestation_id: p["Plaquettes de frein avant"], montant_ht: 140, montant_ttc: 168, statut: "accepte", date_validation: new Date().toISOString() },
    { garage_id: garage.id, client_id: c["Sonia Bahri"], vehicule_id: v["BK-111-KK"], prestation_id: p["Diagnostic électronique"], montant_ht: 60, montant_ttc: 72, statut: "refuse" },
    // Envoi en attente : la ligne est en file, rien n'est parti.
    { garage_id: garage.id, client_id: c["Sonia Bahri"], vehicule_id: v["BD-404-DD"], prestation_id: p["Diagnostic électronique"], montant_ht: 320, montant_ttc: 384, statut: "en_attente" },
    // Envoi parti.
    { garage_id: garage.id, client_id: c["Transports Delaunay"], vehicule_id: v["BE-505-EE"], prestation_id: p["Révision complète"], montant_ht: 480, montant_ttc: 576, statut: "en_attente" },
    // Envoi incertain : le traitement a commencé sans confirmer la fin.
    { garage_id: garage.id, client_id: c["Marie-Alexandrine de Kervasdoué-Lestrange"], vehicule_id: v["BC-303-CC"], prestation_id: p["Remplacement de l'embrayage sur boîte automatique à double embrayage"], montant_ht: 1250, montant_ttc: 1500, statut: "accepte", date_validation: new Date().toISOString() },
  ]).select());
  const [devisAccepte, devisRefuse, devisEnAttenteEnvoi, devisEnvoye, devisIncertain] = devis;

  // Les déclencheurs de `devis` ont déjà créé une ligne de notification par
  // devis : on la met dans l'état voulu au lieu d'en ajouter une seconde,
  // sinon `etat_envoi_devis` (qui lit la plus récente) verrait la mauvaise.
  const etatVoulu = [
    [devisEnAttenteEnvoi.id, "en_attente"],
    [devisEnvoye.id, "envoye"],
    [devisIncertain.id, "envoi_en_cours"],
  ];
  for (const [devisId, statut] of etatVoulu) {
    const { data: existantes } = await db.from("notifications_devis").select("id").eq("devis_id", devisId).order("created_at", { ascending: false });
    if (existantes?.length) {
      await exigerOk(`notification ${statut}`, db.from("notifications_devis").update({ statut, envoye: statut === "envoye" }).eq("id", existantes[0].id));
      for (const autre of existantes.slice(1)) await db.from("notifications_devis").delete().eq("id", autre.id);
    } else {
      await exigerOk(`notification ${statut}`, db.from("notifications_devis").insert({ devis_id: devisId, type: "nouveau_devis", statut, envoye: statut === "envoye" }));
    }
  }

  // --- Ordres de réparation ------------------------------------------------
  // La base exige un devis ACCEPTÉ pour lier un devis à un ordre : c'est la
  // contrainte `ordres_reparation_check_integrite`, jamais contournée ici.
  const session = await clientDuDirigeant(EMAIL_DIRIGEANT);
  await exigerOk("ordre en cours", session.from("ordres_reparation").insert({
    garage_id: garage.id,
    rendez_vous_id: rdvIntervention.id,
    vehicule_id: v["BC-303-CC"],
    client_id: c["Marie-Alexandrine de Kervasdoué-Lestrange"],
    devis_id: devisIncertain.id,
    mecanicien_id: nomLong.id,
    statut: "confirme",
    notes_internes: "Embrayage commandé, montage en cours.",
  }));

  const rdvPret = rdvs.find((r) => r.vehicule_id === v["BG-707-GG"]);
  await exigerOk("ordre terminé", session.from("ordres_reparation").insert({
    garage_id: garage.id,
    rendez_vous_id: rdvPret.id,
    vehicule_id: v["BG-707-GG"],
    client_id: c["Paul Ferrand"],
    mecanicien_id: karim.id,
    statut: "termine",
  }));

  // Visite ancienne de la Clio, facturée et payée : de quoi remplir
  // « interventions précédentes » dans le dossier véhicule.
  const ancienneClio = parPlaque("BB-202-BB", 0);
  const ordreClio = await exigerOk("ordre ancien", session.from("ordres_reparation").insert({
    garage_id: garage.id,
    rendez_vous_id: ancienneClio.id,
    vehicule_id: v["BB-202-BB"],
    client_id: c["Étienne Vasseur"],
    mecanicien_id: karim.id,
    statut: "termine",
  }).select().single());

  await exigerOk("facture payée", session.from("factures").insert({
    garage_id: garage.id,
    client_id: c["Étienne Vasseur"],
    vehicule_id: v["BB-202-BB"],
    rendez_vous_id: ancienneClio.id,
    ordre_reparation_id: ordreClio.id,
    montant_ht: 70,
    montant_ttc: 84,
    statut: "payee",
    date_paiement: new Date().toISOString(),
  }));

  // Facture non réglée sur la voiture restituée du jour.
  const rdvRestitue = rdvs.find((r) => r.vehicule_id === v["BI-909-II"]);
  await exigerOk("facture en attente", session.from("factures").insert({
    garage_id: garage.id,
    client_id: c["Olivier Sanchez"],
    vehicule_id: v["BI-909-II"],
    rendez_vous_id: rdvRestitue.id,
    montant_ht: 180,
    montant_ttc: 216,
    statut: "en_attente",
  }));

  console.log(`Garage : ${garage.id}`);
  console.log(`Dirigeant  : ${EMAIL_DIRIGEANT}`);
  console.log(`Accueil    : ${EMAIL_ACCUEIL}`);
  console.log(`Mécanicien : ${EMAIL_MECANO} (fiche « ${karim.nom} »)`);
  console.log(`${vehicules.length} véhicules, ${rdvs.length} rendez-vous, ${devis.length} devis.`);
  console.log(`Rendez-vous devis accepté sans OR : ${rdvAccepte.id}`);
  console.log(`Rendez-vous devis refusé          : ${rdvRefuse.id}`);
  console.log(`Rendez-vous attente client        : ${rdvAttenteClient.id}`);
  console.log(`Rendez-vous attente pièce         : ${rdvPiece.id}`);
}

async function etat() {
  const garages = await garagesProto();
  if (!garages.length) { console.log("Aucun garage PROTO Atelier."); return; }
  for (const garage of garages) {
    const { data } = await db.from("rendez_vous").select("statut_atelier").eq("garage_id", garage.id);
    const parEtape = {};
    for (const r of data || []) parEtape[r.statut_atelier || "(vide)"] = (parEtape[r.statut_atelier || "(vide)"] || 0) + 1;
    console.log(`${garage.id}  ${garage.nom_garage}`);
    console.log("   ", parEtape);
  }
}

/**
 * Supprime d'un garage de recette tout ce que le modèle accepte de perdre, et
 * dit le reste. Ne prétend jamais avoir fait table rase : un devis accepté ou
 * refusé, comme un ordre de réparation, sont définitifs (voir l'en-tête).
 */
async function purger(garageId) {
  if (!garageId) { console.error("Usage : purger <garage_id>"); process.exit(2); }
  const { data: garage } = await db.from("garages").select("id, nom_garage").eq("id", garageId).maybeSingle();
  if (!garage) { console.error("REFUS : garage introuvable."); process.exit(2); }
  if (!garage.nom_garage?.startsWith(PREFIXE_GARAGE)) {
    console.error(`REFUS : « ${garage.nom_garage} » n'est pas un garage PROTO Atelier.`);
    process.exit(2);
  }

  // Les files de notification d'abord : elles référencent devis/factures/rdv.
  const { data: devisIds } = await db.from("devis").select("id").eq("garage_id", garage.id);
  for (const d of devisIds || []) await db.from("notifications_devis").delete().eq("devis_id", d.id);
  const { data: rdvIds } = await db.from("rendez_vous").select("id").eq("garage_id", garage.id);
  for (const r of rdvIds || []) await db.from("notifications_atelier").delete().eq("rendez_vous_id", r.id);
  const { data: factIds } = await db.from("factures").select("id").eq("garage_id", garage.id);
  for (const f of factIds || []) await db.from("notifications_factures").delete().eq("facture_id", f.id);

  // Les devis se suppriment un par un, et sous la session du dirigeant.
  //
  // Un par un : un seul devis verrouillé dans un `delete` groupé fait échouer
  // la suppression de tous les autres.
  // Sous session : le trigger d'immuabilité appelle `devis_statut_modifiable`,
  // dont `service_role` n'a pas le droit d'exécution. Avec la clé de service,
  // même un devis parfaitement supprimable renvoie « permission denied for
  // function devis_statut_modifiable » — mesuré le 13 septembre 2026.
  const session = await clientDuDirigeantDe(garage.id);
  const restants = [];
  for (const d of devisIds || []) {
    const { error } = await session.from("devis").delete().eq("id", d.id);
    if (error) restants.push(`devis ${d.id} — ${error.message}`);
  }

  // L'ordre suit les clés étrangères : `garage_membres` référence
  // `mecaniciens`, `vehicules` référence `clients`.
  for (const table of ["factures", "rendez_vous", "vehicules", "clients", "prestations", "garage_membres", "mecaniciens"]) {
    const { error } = await db.from(table).delete().eq("garage_id", garage.id);
    if (error) restants.push(`${table} — ${error.message}`);
  }
  const { error } = await db.from("garages").delete().eq("id", garage.id);
  if (error) restants.push(`garages — ${error.message}`);

  if (restants.length === 0) {
    console.log(`Garage ${garage.id} entièrement supprimé.`);
    return;
  }
  console.log(`Garage ${garage.id} partiellement purgé. Ce que le modèle refuse de supprimer :`);
  for (const ligne of restants) console.log(`  - ${ligne}`);
}

const commande = process.argv[2];
if (commande === "creer") await creer();
else if (commande === "etat") await etat();
else if (commande === "purger") await purger(process.argv[3]);
else { console.error("Commandes : creer | etat | purger <garage_id>"); process.exit(2); }
