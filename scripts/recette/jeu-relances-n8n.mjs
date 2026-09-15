// Jeu pour la chaîne n8n des relances — Supabase TEST seul.
//
// Pose, dans le garage de recette, cinq travaux différés échus, chacun avec
// un client dont l'adresse pilote le faux fournisseur du workflow Test :
//   succes   client.succes.n8n@nexora-recette.invalid     → accepté (simulé)
//   echec    echec.transport@nexora-recette.invalid       → échec certain → à reprendre
//   incert   incertain.transport@nexora-recette.invalid   → issue incertaine → rien n'est clos
//   report   client.report.n8n@nexora-recette.invalid     → autorisé puis REPORTÉ avant le passage
//   annule   client.annule.n8n@nexora-recette.invalid     → relance annulée depuis le dashboard
// Toutes les adresses sont en `.invalid` : rien ne peut partir.
//
// Usage :
//   node scripts/recette/jeu-relances-n8n.mjs creer <garage_id>
//   node scripts/recette/jeu-relances-n8n.mjs etat  <garage_id>
//   node scripts/recette/jeu-relances-n8n.mjs autoriser <garage_id> <cle…>   (session accueil)
//   node scripts/recette/jeu-relances-n8n.mjs reporter  <garage_id> <cle>    (session dirigeant)

import { admin, garageDeRecette, session, utilisateurs } from "./outils-recette.mjs";

const [commande, garageId, ...cles] = process.argv.slice(2);
if (!commande || !garageId) { console.error("Usage : creer|etat|autoriser|reporter <garage_id> [cles]"); process.exit(1); }
const garage = await garageDeRecette(garageId);

const JEU = {
  succes: { nom: "Recette n8n — succès", email: "client.succes.n8n@nexora-recette.invalid", plaque: "N8-001-OK", intervention: "Courroie d'accessoires à remplacer (n8n)" },
  echec: { nom: "Recette n8n — échec", email: "echec.transport@nexora-recette.invalid", plaque: "N8-002-KO", intervention: "Amortisseurs arrière fatigués (n8n)" },
  incert: { nom: "Recette n8n — incertain", email: "incertain.transport@nexora-recette.invalid", plaque: "N8-003-IN", intervention: "Liquide de frein à purger (n8n)" },
  report: { nom: "Recette n8n — report", email: "client.report.n8n@nexora-recette.invalid", plaque: "N8-004-RP", intervention: "Balais d'essuie-glace (n8n)" },
  annule: { nom: "Recette n8n — annulation", email: "client.annule.n8n@nexora-recette.invalid", plaque: "N8-005-AN", intervention: "Filtre d'habitacle (n8n)" },
};
const jour = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

async function lignesDuJeu() {
  const { data: clients } = await admin.from("clients").select("id, email").eq("garage_id", garageId).in("email", Object.values(JEU).map((j) => j.email));
  const parEmail = Object.fromEntries((clients || []).map((c) => [c.email, c.id]));
  const res = {};
  for (const [cle, j] of Object.entries(JEU)) {
    const clientId = parEmail[j.email];
    if (!clientId) continue;
    const { data: t } = await admin.from("travaux_differes").select("id, statut, date_relance").eq("client_id", clientId).eq("intervention", j.intervention).maybeSingle();
    const { data: r } = t ? await admin.from("relances_travaux").select("id, statut, tentatives, envoye, echeance, derniere_erreur, motif, updated_at").eq("travail_differe_id", t.id).order("created_at") : { data: [] };
    res[cle] = { clientId, email: j.email, travail: t, relances: r || [] };
  }
  return res;
}

if (commande === "creer") {
  const users = await utilisateurs();
  const dirigeant = await session(users.find((u) => u.id === garage.owner_user_id).email);
  for (const [cle, j] of Object.entries(JEU)) {
    let { data: c } = await admin.from("clients").select("id").eq("garage_id", garageId).eq("email", j.email).maybeSingle();
    if (!c) ({ data: c } = await admin.from("clients").insert({ garage_id: garageId, nom: j.nom, email: j.email, telephone: null, est_professionnel: false }).select("id").single());
    let { data: v } = await admin.from("vehicules").select("id").eq("garage_id", garageId).eq("immatriculation", j.plaque).maybeSingle();
    if (!v) ({ data: v } = await admin.from("vehicules").insert({ garage_id: garageId, client_id: c.id, marque: "Renault", modele: "Mégane", immatriculation: j.plaque }).select("id").single());
    const { data: t } = await admin.from("travaux_differes").select("id").eq("client_id", c.id).eq("intervention", j.intervention).maybeSingle();
    if (!t) {
      const { error } = await dirigeant.from("travaux_differes").insert({ garage_id: garageId, client_id: c.id, vehicule_id: v.id, intervention: j.intervention, niveau: "normal", statut: "a_relancer", date_relance: jour(-1), source: "manuel" });
      if (error) { console.error(cle, error.message); process.exit(1); }
    }
    console.log(`${cle} prêt`);
  }
} else if (commande === "autoriser") {
  const users = await utilisateurs();
  const { data: m } = await admin.from("garage_membres").select("user_id").eq("garage_id", garageId).eq("role", "accueil").eq("actif", true).limit(1).single();
  const accueil = await session(users.find((u) => u.id === m.user_id).email);
  const etat = await lignesDuJeu();
  for (const cle of cles) {
    const r = etat[cle]?.relances.find((x) => ["a_relire", "bloque"].includes(x.statut));
    if (!r) { console.log(`${cle} : aucune relance à autoriser`); continue; }
    const { data, error } = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: r.id, p_destinataire: etat[cle].email });
    console.log(`${cle} : ${error ? error.message : JSON.stringify(data)}`);
  }
} else if (commande === "reporter") {
  const users = await utilisateurs();
  const dirigeant = await session(users.find((u) => u.id === garage.owner_user_id).email);
  const etat = await lignesDuJeu();
  for (const cle of cles) {
    const { error } = await dirigeant.from("travaux_differes").update({ date_relance: jour(20) }).eq("id", etat[cle].travail.id);
    console.log(`${cle} : ${error ? error.message : "reporté de 20 jours"}`);
  }
} else if (commande === "etat") {
  const etat = await lignesDuJeu();
  for (const [cle, e] of Object.entries(etat)) {
    const r = e.relances.map((x) => `${x.statut}${x.tentatives ? `×${x.tentatives}` : ""}${x.envoye ? " (envoye)" : ""}${x.derniere_erreur ? ` « ${x.derniere_erreur.slice(0, 60)} »` : ""}${x.motif ? ` [${x.motif.slice(0, 50)}]` : ""}`).join(" | ") || "—";
    console.log(`${cle.padEnd(7)} travail ${e.travail?.statut} ${e.travail?.date_relance} → ${r}`);
  }
}
