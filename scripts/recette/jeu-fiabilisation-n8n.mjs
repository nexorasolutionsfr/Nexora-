// Jeu de recette de la fiabilisation n8n du socle d'envois — Supabase TEST.
//
// Un garage NEUF « PROTO Constat N8N … », des clients aux adresses
// @nexora-recette.invalid qui pilotent le serveur SMTP contrôlé (accepte.,
// temporaire., definitif., coupure., lent.). Les notifications sont armées par
// les VRAIES fonctions d'autorisation, avec une vraie session du dirigeant :
// jeton, destinataire et empreinte posés comme en Production.
//
// Aucune file d'un autre garage n'est lue ni écrite : les workflows de recette
// sont bornés à ce garage (p_garages) et ce script ne filtre que sur lui.
//
// Usage :
//   node scripts/recette/jeu-fiabilisation-n8n.mjs creer
//   node scripts/recette/jeu-fiabilisation-n8n.mjs armer <garage> <devis|factures|atelier|proposition> <prefixe> [nombre]
//   node scripts/recette/jeu-fiabilisation-n8n.mjs etat <garage> [depuis ISO]
import { admin, creerUtilisateur, garageDeRecette, session } from "./outils-recette.mjs";

const [, , commande, ...args] = process.argv;
const ok = (libelle, { data, error }) => { if (error) { console.error(`ÉCHEC ${libelle} :`, error.message); process.exit(1); } return data; };
const t = Date.now();

async function dirigeantDe(G) {
  const g = await garageDeRecette(G);
  const { data: u } = await admin.auth.admin.getUserById(g.owner_user_id);
  return session(u.user.email);
}

async function clientVoiture(d, G, prefixe, i) {
  const email = `${prefixe}.${t}.${i}@nexora-recette.invalid`;
  const c = ok("client", await d.from("clients").insert({ garage_id: G, nom: `Client ${prefixe} ${i}`, email }).select().single());
  // Immatriculation unique par garage : aléatoire (deux lancements dans la même
  // centaine de millisecondes se sont déjà heurtés).
  const lettres = () => Array.from({ length: 2 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const v = ok("véhicule", await d.from("vehicules").insert({ garage_id: G, client_id: c.id, marque: "Renault", modele: "Clio", immatriculation: `${lettres()}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}-${lettres()}` }).select().single());
  return { c, v };
}

const ARMER = {
  async devis(d, G, { c, v }) {
    const dv = ok("devis", await d.from("devis").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, montant_ht: 0, montant_ttc: 0, statut: "en_attente" }).select().single());
    ok("ligne", await d.from("devis_lignes").insert({ devis_id: dv.id, garage_id: G, type: "main_oeuvre", libelle: "Vidange", quantite: 1, prix_unitaire_ht: 80, taux_tva: 20, position: 0 }));
    const a = await d.rpc("autoriser_envoi_devis", { p_devis_id: dv.id, p_destinataire: c.email });
    if (!a.data?.ok) throw new Error("autorisation devis : " + JSON.stringify(a.data || a.error));
    return (await admin.from("notifications_devis").select("id, statut").eq("devis_id", dv.id).eq("statut", "en_attente").single()).data;
  },
  async factures(d, G, { c, v }) {
    const f = ok("facture", await d.from("factures").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, montant_ht: 100, montant_ttc: 120, statut: "a_payer", lignes: [{ libelle: "Vidange", quantite: 1, prix_unitaire_ht: 100, taux_tva: 20 }] }).select().single());
    const a = await d.rpc("autoriser_envoi_facture", { p_facture_id: f.id, p_destinataire: c.email });
    if (!a.data?.ok) throw new Error("autorisation facture : " + JSON.stringify(a.data || a.error));
    return (await admin.from("notifications_factures").select("id, statut").eq("facture_id", f.id).eq("statut", "en_attente").single()).data;
  },
  async atelier(d, G, { c, v }) {
    const debut = new Date(Date.now() - 3600e3).toISOString();
    const r = ok("rendez-vous", await d.from("rendez_vous").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, date_debut: debut, date_fin: new Date().toISOString(), statut: "confirme", source: "manuel" }).select().single());
    ok("prêt", await d.from("rendez_vous").update({ statut_atelier: "pret" }).eq("id", r.id));
    const a = await d.rpc("autoriser_envoi_atelier", { p_rendez_vous_id: r.id, p_destinataire: c.email });
    if (!a.data?.ok) throw new Error("autorisation atelier : " + JSON.stringify(a.data || a.error));
    return (await admin.from("notifications_atelier").select("id, statut").eq("rendez_vous_id", r.id).eq("statut", "en_attente").single()).data;
  },
  async proposition(d, G, { c, v }) {
    // Aucune fonction d'autorisation n'existe pour cette file : la ligne naît
    // d'un changement de proposition. On la place en attente par le service,
    // sur ce garage de recette seulement.
    // Comme en Production (15 sept. : 3 propositions, toutes avec prestation et véhicule).
    const pr = ok("prestation", await admin.from("prestations").insert({ garage_id: G, nom: "Révision (recette)", duree_minutes: 60 }).select().single());
    const dem = ok("demande", await admin.from("demandes").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id }).select().single());
    const debut = new Date(Date.now() + 86400e3);
    const p = ok("proposition", await admin.from("propositions_rdv").insert({ garage_id: G, demande_id: dem.id, client_id: c.id, vehicule_id: v.id, prestation_id: pr.id, date_debut_proposee: debut.toISOString(), date_fin_proposee: new Date(+debut + 3600e3).toISOString(), statut: "en_attente" }).select().single());
    return ok("notification", await admin.from("notifications_proposition").insert({ proposition_id: p.id, type: "reschedule", statut: "en_attente", envoye: false }).select("id, statut").single());
  },
};

const TABLES = {
  devis: ["notifications_devis", "devis_id", "devis"],
  factures: ["notifications_factures", "facture_id", "factures"],
  atelier: ["notifications_atelier", "rendez_vous_id", "rendez_vous"],
  proposition: ["notifications_proposition", "proposition_id", "propositions_rdv"],
};

if (commande === "creer") {
  const email = `recette.n8n.${t}@nexora-recette.invalid`;
  const u = await creerUtilisateur(email);
  const g = ok("garage", await admin.from("garages").insert({ nom_garage: `PROTO Constat N8N ${t}`, email, telephone: "0100000000", owner_user_id: u.id, acces_motif: "illimite" }).select().single());
  ok("membre", await admin.from("garage_membres").insert({ garage_id: g.id, user_id: u.id, role: "dirigeant" }));
  console.log(g.id);
} else if (commande === "armer") {
  const [G, file, prefixe, nombre = "1"] = args;
  if (!ARMER[file] || !/^[a-z]+$/.test(prefixe || "")) { console.error("armer <garage> <file> <prefixe> [nombre]"); process.exit(2); }
  const d = await dirigeantDe(G);
  for (let i = 1; i <= Number(nombre); i++) {
    const n = await ARMER[file](d, G, await clientVoiture(d, G, prefixe, i));
    console.log(`${file} ${n.id} ${n.statut} ${prefixe}`);
  }
} else if (commande === "etat") {
  const [G, depuis] = args;
  await garageDeRecette(G);
  const lignes = [];
  for (const [file, [table, cle, docs]] of Object.entries(TABLES)) {
    const ids = (await admin.from(docs).select("id").eq("garage_id", G)).data.map((x) => x.id);
    if (!ids.length) continue;
    const rows = (await admin.from(table).select(`id, ${cle}, statut, tentatives, envoye, derniere_erreur, created_at`).in(cle, ids).order("created_at")).data;
    for (const r of rows) lignes.push({ file, id: r.id, statut: r.statut, tentatives: r.tentatives, envoye: r.envoye, derniere_erreur: (r.derniere_erreur || "").slice(0, 110) });
  }
  console.table(lignes);
  let q = admin.from("erreurs_automatisation").select("categorie, workflow_nom, execution_id, noeud, notification_file, notification_id, occurrences, intervention_requise, message, derniere_le").like("workflow_nom", "%RECETTE fiabilisation%").order("derniere_le");
  if (depuis) q = q.gte("derniere_le", depuis);
  const inc = (await q).data || [];
  console.table(inc.map((i) => ({ ...i, message: (i.message || "").slice(0, 90), notification_id: i.notification_id?.slice(0, 8) || null })));
} else {
  console.error("commande : creer | armer | etat");
  process.exit(2);
}
