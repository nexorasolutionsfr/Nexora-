// Recette SERVEUR de la fiabilisation des envois (20260919001000) — Supabase TEST.
//
// Joue, avec de vraies sessions, sur un garage NEUF créé pour l'occasion
// (aucune file d'un autre garage n'est lue ni écrite : toutes les réservations
// sont bornées à ce garage, et à des lignes précises pour les relances) :
//
//   A. Empreinte du devis — autoriser l'envoi, changer un élément visible par
//      le client SANS changer le total ni le nombre de lignes, réserver :
//      la notification doit être mise de côté (libellé, constat, photo).
//      Témoin sans changement : réservée. Revalidation : réservée.
//      Devis accepté : photo ajoutée ensuite sans effet, accusé réservé.
//   B. Opposition du client aux relances — à l'autorisation, entre
//      l'autorisation et la réservation, à la préparation.
//
// Rien ne part : aucune exécution n8n, aucun transport. Les notifications
// réservées restent `envoi_en_cours` dans ce garage de recette (trace).
//
// Usage : node scripts/recette/fiabilisation-envois-serveur.mjs

import { randomUUID } from "node:crypto";
import { BUCKET, admin, compteur, creerUtilisateur, imagePng, session } from "./outils-recette.mjs";

const { verifier, bilan } = compteur();
const t = Date.now();
const EMAIL_DIRIGEANT = `recette.fiab.${t}@nexora-recette.invalid`;
const ok = (libelle, { data, error }) => { if (error) { console.error(`ÉCHEC ${libelle} :`, error.message); process.exit(1); } return data; };

// --- Garage neuf -------------------------------------------------------------
const u = await creerUtilisateur(EMAIL_DIRIGEANT);
const garage = ok("garage", await admin.from("garages").insert({ nom_garage: `PROTO Constat Fiabilisation ${t}`, email: EMAIL_DIRIGEANT, telephone: "0100000000", owner_user_id: u.id, acces_motif: "illimite" }).select().single());
ok("membre", await admin.from("garage_membres").insert({ garage_id: garage.id, user_id: u.id, role: "dirigeant" }));
const G = garage.id;
const dirigeant = await session(EMAIL_DIRIGEANT);
console.log(`Garage ${garage.nom_garage} (${G})\n`);

async function clientVoiture(n) {
  const c = ok("client", await dirigeant.from("clients").insert({ garage_id: G, nom: `Client fiab ${n}`, email: `client.fiab.${n}.${t}@nexora-recette.invalid` }).select().single());
  const v = ok("véhicule", await dirigeant.from("vehicules").insert({ garage_id: G, client_id: c.id, marque: "Peugeot", modele: "308", immatriculation: `FB-${String(n).padStart(3, "0")}-${String(t).slice(-2)}` }).select().single());
  return { c, v };
}

// Un devis en attente, une ligne reprise d'un constat photographié, une ligne à la main.
async function devisAvecConstat(n) {
  const { c, v } = await clientVoiture(n);
  const insp = ok("contrôle", await dirigeant.from("inspections").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, statut: "brouillon" }).select().single());
  const pt = ok("point", await dirigeant.from("inspections_points").insert({ inspection_id: insp.id, garage_id: G, categorie: "exterieur", libelle: "Plaquettes avant", etat: "dommage", commentaire: "Usées à 2 mm", soumis_client: false }).select().single());
  const chemin = `${G}/${insp.id}/${randomUUID()}.png`;
  ok("dépôt photo", await dirigeant.storage.from(BUCKET).upload(chemin, imagePng(120, 40, 40), { contentType: "image/png" }));
  ok("photo", await dirigeant.from("inspections_photos").insert({ inspection_id: insp.id, garage_id: G, point_id: pt.id, storage_path: chemin }));
  const d = ok("devis", await dirigeant.from("devis").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, montant_ht: 0, montant_ttc: 0, statut: "en_attente" }).select().single());
  const l1 = ok("ligne constat", await dirigeant.from("devis_lignes").insert({ devis_id: d.id, garage_id: G, type: "main_oeuvre", libelle: "Plaquettes avant", quantite: 1, prix_unitaire_ht: 90, taux_tva: 20, position: 0, inspection_point_id: pt.id, note_constat: "Usées à 2 mm" }).select().single());
  ok("ligne main", await dirigeant.from("devis_lignes").insert({ devis_id: d.id, garage_id: G, type: "piece", libelle: "Kit de fixation", quantite: 1, prix_unitaire_ht: 18, taux_tva: 20, position: 1 }));
  return { client: c, devis: d, ligne: l1, inspection: insp, point: pt };
}

const notifNouveau = async (devisId) => (await admin.from("notifications_devis").select("id, statut, derniere_erreur").eq("devis_id", devisId).eq("type", "nouveau").order("created_at", { ascending: false }).limit(1).single()).data;
const reserverDevis = async () => ok("réservation devis", await admin.rpc("reserver_notifications", { p_file: "devis", p_limite: 50, p_garages: [G] }));
const autoriser = async (x) => dirigeant.rpc("autoriser_envoi_devis", { p_devis_id: x.devis.id, p_destinataire: x.client.email });

// --- A. Empreinte du devis ---------------------------------------------------
console.log("A. Un changement visible par le client, total et nombre de lignes inchangés");
const cas = {
  libelle: await devisAvecConstat(1),
  constat: await devisAvecConstat(2),
  photo: await devisAvecConstat(3),
  temoin: await devisAvecConstat(4),
};
for (const [nom, x] of Object.entries(cas)) {
  const a = await autoriser(x);
  if (!a.data?.ok) { console.error(`autorisation ${nom} :`, JSON.stringify(a.data || a.error)); process.exit(1); }
}
const totalAvant = (await admin.from("devis").select("montant_ttc").eq("id", cas.libelle.devis.id).single()).data.montant_ttc;
ok("renommer", await dirigeant.from("devis_lignes").update({ libelle: "Disques et plaquettes avant" }).eq("id", cas.libelle.ligne.id));
ok("constat", await dirigeant.from("devis_lignes").update({ note_constat: "Disque rayé, à remplacer aussi" }).eq("id", cas.constat.ligne.id));
const chemin2 = `${G}/${cas.photo.inspection.id}/${randomUUID()}.png`;
ok("dépôt photo 2", await dirigeant.storage.from(BUCKET).upload(chemin2, imagePng(40, 40, 160), { contentType: "image/png" }));
ok("photo 2", await dirigeant.from("inspections_photos").insert({ inspection_id: cas.photo.inspection.id, garage_id: G, point_id: cas.photo.point.id, storage_path: chemin2 }));
const totalApres = (await admin.from("devis").select("montant_ttc").eq("id", cas.libelle.devis.id).single()).data.montant_ttc;
verifier("le renommage ne change pas le total du devis", String(totalAvant) === String(totalApres), `${totalAvant} → ${totalApres}`);

const prises1 = (await reserverDevis()).map((r) => r.doc_id);
for (const nom of ["libelle", "constat", "photo"]) {
  const n = await notifNouveau(cas[nom].devis.id);
  verifier(`${nom} modifié après l'autorisation : notification mise de côté, pas réservée`, n.statut === "bloque" && !prises1.includes(cas[nom].devis.id), `${n.statut} — ${n.derniere_erreur || ""}`);
}
verifier("témoin sans changement : réservé normalement", prises1.includes(cas.temoin.devis.id) && (await notifNouveau(cas.temoin.devis.id)).statut === "envoi_en_cours");
verifier("rien d'autre n'est réservé que les devis de ce garage", prises1.every((id) => Object.values(cas).some((x) => x.devis.id === id)));

const re = await autoriser(cas.libelle);
verifier("le garage revalide le devis modifié", re.data?.ok === true && re.data.deja_autorise === false, JSON.stringify(re.data || re.error));
const prises2 = (await reserverDevis()).map((r) => r.doc_id);
verifier("après revalidation : réservé", prises2.includes(cas.libelle.devis.id));

console.log("A bis. Devis décidé : les protections de 000800 tiennent, l'accusé n'est pas mis de côté à tort");
const acc = await devisAvecConstat(5);
ok("accepter", await dirigeant.from("devis").update({ statut: "accepte" }).eq("id", acc.devis.id));
const accuse = (await admin.from("notifications_devis").select("id, statut").eq("devis_id", acc.devis.id).eq("type", "accepte").single()).data;
verifier("l'acceptation crée l'accusé, non envoyable", accuse?.statut === "sans_lien");
const aa = await autoriser(acc);
verifier("le garage autorise l'accusé", aa.data?.ok === true, JSON.stringify(aa.data || aa.error));
const chemin3 = `${G}/${acc.inspection.id}/${randomUUID()}.png`;
ok("dépôt photo 3", await dirigeant.storage.from(BUCKET).upload(chemin3, imagePng(20, 160, 60), { contentType: "image/png" }));
ok("photo après décision", await dirigeant.from("inspections_photos").insert({ inspection_id: acc.inspection.id, garage_id: G, point_id: acc.point.id, storage_path: chemin3 }));
const prises3 = await reserverDevis();
verifier("photo ajoutée après l'acceptation : l'accusé part quand même (preuve figée, empreinte stable)", prises3.some((r) => r.doc_id === acc.devis.id && r.type === "accepte"), JSON.stringify(prises3));
const figee = (await admin.from("devis_preuves").select("storage_path").eq("devis_id", acc.devis.id)).data;
const suppr = await dirigeant.from("inspections_photos").delete().eq("storage_path", figee?.[0]?.storage_path).select("id");
verifier("la photo figée reste protégée contre la suppression", Boolean(suppr.error), JSON.stringify(suppr.data));

// --- B. Opposition du client aux relances ------------------------------------
console.log("B. Opposition du client aux relances de travaux différés");
const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
async function travail(n) {
  const { c, v } = await clientVoiture(10 + n);
  const tr = ok("travail", await dirigeant.from("travaux_differes").insert({ garage_id: G, client_id: c.id, vehicule_id: v.id, intervention: `Pneus (fiab ${n})`, niveau: "normal", statut: "a_relancer", date_relance: hier, source: "manuel" }).select().single());
  return { c, tr };
}
const preparer = async (ids) => ok("préparation", await admin.rpc("preparer_relances_travaux", { p_garages: [G], p_travaux: ids }));
const relanceDe = async (trId) => (await admin.from("relances_travaux").select("id, statut, motif, derniere_erreur, tentatives").eq("travail_differe_id", trId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
const opposer = async (c) => dirigeant.rpc("revenue_recovery_enregistrer_permission", { p_garage_id: G, p_client_id: c.id, p_canal: "email", p_statut: "oppose", p_origine: "recette : le client a demandé à ne plus être relancé" });

const b1 = await travail(1);
await preparer([b1.tr.id]);
const r1 = await relanceDe(b1.tr.id);
const op1 = await opposer(b1.c);
verifier("l'opposition s'enregistre par la fonction existante (propriétaire)", !op1.error, op1.error?.message);
const au1 = await dirigeant.rpc("autoriser_envoi_relance_travail", { p_relance_id: r1.id, p_destinataire: b1.c.email });
verifier("autorisation refusée pour un client opposé", au1.data?.ok === false && au1.data.raison === "client_oppose", JSON.stringify(au1.data || au1.error));

const b2 = await travail(2);
await preparer([b2.tr.id]);
const r2 = await relanceDe(b2.tr.id);
const au2 = await dirigeant.rpc("autoriser_envoi_relance_travail", { p_relance_id: r2.id, p_destinataire: b2.c.email });
verifier("client sans opposition : autorisation acceptée", au2.data?.ok === true, JSON.stringify(au2.data || au2.error));
await opposer(b2.c);
const res2 = ok("réservation relance", await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [G], p_relances: [r2.id] }));
const r2b = await relanceDe(b2.tr.id);
verifier("opposition entre autorisation et réservation : rien réservé, relance mise de côté", res2.length === 0 && r2b.statut === "bloque" && /opposé/.test(r2b.derniere_erreur || ""), JSON.stringify(r2b));
const au2b = await dirigeant.rpc("autoriser_envoi_relance_travail", { p_relance_id: r2.id, p_destinataire: b2.c.email });
verifier("…et le garage ne peut pas la réautoriser", au2b.data?.raison === "client_oppose", JSON.stringify(au2b.data));

const b3 = await travail(3);
await opposer(b3.c);
const prep3 = await preparer([b3.tr.id]);
verifier("préparation : aucun brouillon pour un client opposé", !prep3.some((p) => p.action === "preparee") && !(await relanceDe(b3.tr.id)), JSON.stringify(prep3));
const prep1 = await preparer([b1.tr.id]);
const r1b = await relanceDe(b1.tr.id);
verifier("préparation : le brouillon existant d'un client opposé est annulé", prep1.some((p) => p.action === "annulee") && r1b.statut === "annulee" && /opposé/.test(r1b.motif || ""), JSON.stringify(r1b));

process.exit(bilan() ? 0 : 1);
