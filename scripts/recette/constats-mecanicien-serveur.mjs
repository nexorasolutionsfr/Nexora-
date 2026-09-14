// Recette SERVEUR du parcours mécanicien : constat et photo — Supabase TEST.
//
// Le mécanicien affecté documente sa fiche ; l'accueil reprend le constat au
// devis. Et tout ce qui doit rester fermé le reste, en base :
// fiche non affectée, autre garage, adhésion révoquée (effet immédiat),
// contrôle verrouillé, fiche terminée, stockage hors périmètre, lecture
// directe des tables, suppression d'une photo.
//
// Usage : node scripts/recette/constats-mecanicien-serveur.mjs <garage_id>

import { randomUUID } from "node:crypto";
import { BUCKET, admin, compteur, creerUtilisateur, garageDeRecette, imagePng, session, utilisateurs } from "./outils-recette.mjs";

const garageId = process.argv[2];
if (!garageId) { console.error("Usage : constats-mecanicien-serveur.mjs <garage_id>"); process.exit(1); }
const garage = await garageDeRecette(garageId);
const { verifier, bilan } = compteur();

const users = await utilisateurs();
const emailDe = (id) => users.find((u) => u.id === id)?.email;
const { data: membres } = await admin.from("garage_membres").select("id, user_id, role, actif, mecanicien_id").eq("garage_id", garageId);
const mecaMembre = membres.find((m) => m.role === "mecanicien" && m.actif);
const dirigeant = await session(emailDe(garage.owner_user_id));
const accueil = await session(emailDe(membres.find((m) => m.role === "accueil" && m.actif).user_id));
const karim = await session(emailDe(mecaMembre.user_id));

const { data: vBA } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).eq("immatriculation", "BA-101-AA").single();
const { data: vBC } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).eq("immatriculation", "BC-303-CC").single();
const { data: rdvs } = await admin.from("rendez_vous").select("id, vehicule_id, client_id, statut_atelier, date_debut").eq("garage_id", garageId);
const rdvJour = rdvs.find((r) => r.vehicule_id === vBA.id && r.statut_atelier === "diagnostic");
const rdvAncien = rdvs.find((r) => r.vehicule_id === vBA.id && r.statut_atelier === "restitue");
const rdvLong = rdvs.find((r) => r.vehicule_id === vBC.id);

// --- Les fiches : créées une fois par le dirigeant, sous sa session ---------
async function fiche(rdv, mecanicienId) {
  const { data: exist } = await dirigeant.from("ordres_reparation").select("id, mecanicien_id, statut").eq("rendez_vous_id", rdv.id).maybeSingle();
  if (exist) {
    if (exist.mecanicien_id !== mecanicienId) await dirigeant.from("ordres_reparation").update({ mecanicien_id: mecanicienId }).eq("id", exist.id);
    return exist.id;
  }
  const { data, error } = await dirigeant.from("ordres_reparation").insert({
    garage_id: garageId, rendez_vous_id: rdv.id, vehicule_id: rdv.vehicule_id, client_id: rdv.client_id,
    mecanicien_id: mecanicienId, statut: "confirme",
  }).select("id").single();
  if (error) { console.error("fiche :", error.message); process.exit(1); }
  return data.id;
}

// Un second mécanicien, qui sera révoqué pendant la recette.
const suffixe = garage.nom_garage.match(/(\d{4}-\d{2}-\d{2}-\d{2}h\d{2})/)?.[1]?.replace(/[^0-9h]/g, "") || "x";
const emailParti = `recette.constat.meca-parti.${suffixe}@nexora-recette.invalid`;
const parti = await creerUtilisateur(emailParti);
let { data: ficheParti } = await admin.from("mecaniciens").select("id").eq("garage_id", garageId).eq("nom", "Mécanicien parti (recette)").maybeSingle();
if (!ficheParti) ({ data: ficheParti } = await admin.from("mecaniciens").insert({ garage_id: garageId, nom: "Mécanicien parti (recette)", couleur: "#94A3B8", actif: true }).select("id").single());
await admin.from("garage_membres").delete().eq("garage_id", garageId).eq("user_id", parti.id);
const { data: membreParti, error: eMP } = await admin.from("garage_membres").insert({ garage_id: garageId, user_id: parti.id, role: "mecanicien", mecanicien_id: ficheParti.id }).select("id").single();
if (eMP) { console.error("membre parti :", eMP.message); process.exit(1); }

const ordreJour = await fiche(rdvJour, mecaMembre.mecanicien_id);
const ordreAncien = await fiche(rdvAncien, mecaMembre.mecanicien_id);
const ordreLong = await fiche(rdvLong, ficheParti.id);

console.log(`Garage ${garage.nom_garage}\n`);

// 1. Lecture : le contrôle de la visite, sans données financières ni contact.
console.log("1. Lecture de ses constats");
const lecture = await karim.rpc("atelier_mes_constats", { p_ordre_id: ordreJour });
verifier("le mécanicien affecté lit le contrôle de sa fiche", !lecture.error && lecture.data?.controle?.id, lecture.error?.message);
const brut = JSON.stringify(lecture.data || {});
verifier("aucun prix, montant, e-mail ni téléphone dans la réponse", !/prix|montant|email|telephone|note_constat/i.test(brut));
verifier("peut ajouter (contrôle ouvert, fiche confirmée)", lecture.data?.peut_ajouter === true);
const controleId = lecture.data?.controle?.id;

// 2. Ajout d'un constat et d'une photo.
console.log("2. Constat + photo, puis relecture dans une nouvelle session");
const libelle = `Fuite de liquide de frein arrière (recette ${Date.now()})`;
const ajout = await karim.rpc("atelier_ajouter_constat", { p_ordre_id: ordreJour, p_libelle: libelle, p_etat: "dommage", p_commentaire: "Traces sous l'étrier arrière gauche.", p_categorie: "autre" });
verifier("constat enregistré sur le contrôle existant", !ajout.error && ajout.data?.inspection_id === controleId, ajout.error?.message);
const pointId = ajout.data?.point_id;
const chemin = `${garageId}/${controleId}/${randomUUID()}.png`;
const depot = await karim.storage.from(BUCKET).upload(chemin, imagePng(160, 60, 30), { contentType: "image/png" });
verifier("dépôt du fichier sous le contrôle de sa fiche", !depot.error, depot.error?.message);
const photo = await karim.rpc("atelier_ajouter_photo", { p_point_id: pointId, p_chemin: chemin });
verifier("photo enregistrée sur le constat", !photo.error && photo.data, photo.error?.message);
const encore = await karim.rpc("atelier_ajouter_photo", { p_point_id: pointId, p_chemin: chemin });
verifier("réenregistrer la même photo ne la duplique pas", !encore.error && encore.data === photo.data);
const karim2 = await session(emailDe(mecaMembre.user_id));
const relu = await karim2.rpc("atelier_mes_constats", { p_ordre_id: ordreJour });
const pointRelu = (relu.data?.points || []).find((p) => p.id === pointId);
verifier("après « rechargement » (nouvelle session) : constat et photo retrouvés", pointRelu?.libelle === libelle && pointRelu.photos.length === 1 && pointRelu.photos[0].chemin === chemin);
const signe = await karim2.storage.from(BUCKET).createSignedUrl(chemin, 60);
const image = signe.data?.signedUrl ? await fetch(signe.data.signedUrl) : null;
verifier("le mécanicien affiche sa photo (URL signée, 200 image/png)", image?.status === 200 && /image\/png/.test(image.headers.get("content-type") || ""), signe.error?.message);

// 3. Ce qui reste fermé au mécanicien affecté.
console.log("3. Refus pour le mécanicien affecté");
const nonAffectee = await karim.rpc("atelier_ajouter_constat", { p_ordre_id: ordreLong, p_libelle: "X", p_etat: "dommage" });
verifier("fiche affectée à un autre → refus", Boolean(nonAffectee.error) && /accès refusé/.test(nonAffectee.error.message), nonAffectee.error?.message);
const lectureAutre = await karim.rpc("atelier_mes_constats", { p_ordre_id: ordreLong });
verifier("lecture d'une fiche non affectée → refus", Boolean(lectureAutre.error));
const verrouille = await karim.rpc("atelier_ajouter_constat", { p_ordre_id: ordreAncien, p_libelle: "X", p_etat: "dommage" });
verifier("contrôle verrouillé → refus explicite, pas de second contrôle", Boolean(verrouille.error) && /Contrôle finalisé/.test(verrouille.error.message), verrouille.error?.message);
const { data: controlesAncien } = await admin.from("inspections").select("id").eq("rendez_vous_id", rdvAncien.id);
verifier("toujours un seul contrôle sur la visite verrouillée", controlesAncien.length === 1);
const lectureAncien = await karim.rpc("atelier_mes_constats", { p_ordre_id: ordreAncien });
verifier("le contrôle verrouillé se lit, sans ajout possible", lectureAncien.data?.peut_ajouter === false && lectureAncien.data?.motif === "controle_verrouille");
const cheminVerrou = `${garageId}/${controlesAncien[0].id}/${randomUUID()}.png`;
const depotVerrou = await karim.storage.from(BUCKET).upload(cheminVerrou, imagePng(), { contentType: "image/png" });
verifier("dépôt sous un contrôle verrouillé → refusé par le stockage", Boolean(depotVerrou.error), "accepté");
const { data: autreInsp } = await admin.from("inspections").select("id, garage_id").neq("garage_id", garageId).limit(1).single();
const cheminAutre = `${autreInsp.garage_id}/${autreInsp.id}/${randomUUID()}.png`;
const depotAutre = await karim.storage.from(BUCKET).upload(cheminAutre, imagePng(), { contentType: "image/png" });
verifier("dépôt dans le dossier d'un autre garage → refusé", Boolean(depotAutre.error), "accepté");
const cheminHorsForme = `${garageId}/${controleId}/photo.png`;
const depotForme = await karim.storage.from(BUCKET).upload(cheminHorsForme, imagePng(), { contentType: "image/png" });
verifier("dépôt sous un nom non conforme → refusé", Boolean(depotForme.error), "accepté");
const photoAutreChemin = await karim.rpc("atelier_ajouter_photo", { p_point_id: pointId, p_chemin: cheminAutre });
verifier("enregistrer un chemin d'un autre contrôle → refusé", Boolean(photoAutreChemin.error) && /chemin non conforme|accès refusé/.test(photoAutreChemin.error.message), photoAutreChemin.error?.message);
const photoFantome = await karim.rpc("atelier_ajouter_photo", { p_point_id: pointId, p_chemin: `${garageId}/${controleId}/${randomUUID()}.png` });
verifier("enregistrer une photo jamais déposée → refusé", Boolean(photoFantome.error) && /introuvable/.test(photoFantome.error.message), photoFantome.error?.message);
const { data: lecturesDirectes } = await karim.from("inspections_points").select("id").eq("garage_id", garageId);
verifier("lecture directe des tables : rien", (lecturesDirectes || []).length === 0);
const insertDirect = await karim.from("inspections_points").insert({ inspection_id: controleId, garage_id: garageId, categorie: "autre", libelle: "direct", etat: "dommage", soumis_client: false });
verifier("écriture directe dans les tables : refusée", Boolean(insertDirect.error));
await karim.storage.from(BUCKET).remove([chemin]);
const toujours = await admin.storage.from(BUCKET).download(chemin);
verifier("le mécanicien ne supprime pas une photo du stockage", !toujours.error && toujours.data);
const { data: devisVisibles } = await karim.from("devis").select("id").eq("garage_id", garageId);
verifier("aucun devis lisible par le mécanicien", (devisVisibles || []).length === 0);

// 4. Autre garage.
console.log("4. Mécanicien d'un autre garage");
const { data: autreGarage } = await admin.from("garages").select("id").ilike("nom_garage", "PROTO Atelier 2026-09-13-08h38%").single();
const { data: autreMeca } = await admin.from("garage_membres").select("user_id").eq("garage_id", autreGarage.id).eq("role", "mecanicien").eq("actif", true).limit(1).single();
const etranger = await session(emailDe(autreMeca.user_id));
const refusEtranger = await etranger.rpc("atelier_ajouter_constat", { p_ordre_id: ordreJour, p_libelle: "X", p_etat: "dommage" });
verifier("constat sur la fiche d'un autre garage → refus", Boolean(refusEtranger.error) && /accès refusé/.test(refusEtranger.error.message));
const signeEtranger = await etranger.storage.from(BUCKET).createSignedUrl(chemin, 60);
verifier("photo d'un autre garage : pas d'URL signée", !signeEtranger.data?.signedUrl);

// 5. Révocation : effet immédiat.
console.log("5. Adhésion révoquée");
const partiSession = await session(emailParti);
const [c1, c2] = await Promise.all([
  partiSession.rpc("atelier_ajouter_constat", { p_ordre_id: ordreLong, p_libelle: "Rayure portière (recette)", p_etat: "a_surveiller" }),
  partiSession.rpc("atelier_ajouter_constat", { p_ordre_id: ordreLong, p_libelle: "Rétroviseur fêlé (recette)", p_etat: "dommage" }),
]);
verifier("actif : deux constats simultanés acceptés", !c1.error && !c2.error, `${c1.error?.message} / ${c2.error?.message}`);
const { data: controlesLong } = await admin.from("inspections").select("id").eq("rendez_vous_id", rdvLong.id);
verifier("deux ajouts simultanés sur une visite sans contrôle → un seul contrôle créé", controlesLong.length === 1, `${controlesLong.length}`);
await admin.from("garage_membres").update({ actif: false, revoked_at: new Date().toISOString() }).eq("id", membreParti.id);
const apresRevocation = await partiSession.rpc("atelier_ajouter_constat", { p_ordre_id: ordreLong, p_libelle: "X", p_etat: "dommage" });
verifier("révoqué, même session : refus immédiat", Boolean(apresRevocation.error) && /accès refusé/.test(apresRevocation.error.message));
const lectureRevoque = await partiSession.rpc("atelier_mes_constats", { p_ordre_id: ordreLong });
verifier("révoqué : lecture refusée", Boolean(lectureRevoque.error));
const cheminLong = `${garageId}/${controlesLong[0].id}/${randomUUID()}.png`;
const depotRevoque = await partiSession.storage.from(BUCKET).upload(cheminLong, imagePng(), { contentType: "image/png" });
verifier("révoqué : dépôt refusé par le stockage", Boolean(depotRevoque.error));

// 6. L'accueil : le stockage lui est ouvert (défaut corrigé), et il reprend le constat.
console.log("6. L'accueil lit la photo et reprend le constat au devis");
const signeAccueil = await accueil.storage.from(BUCKET).createSignedUrl(chemin, 60);
verifier("l'accueil signe la photo du mécanicien (était refusé avant 20260919000700)", Boolean(signeAccueil.data?.signedUrl), signeAccueil.error?.message);
const cheminAccueil = `${garageId}/${controleId}/${randomUUID()}.png`;
const depotAccueil = await accueil.storage.from(BUCKET).upload(cheminAccueil, imagePng(40, 90, 160), { contentType: "image/png" });
verifier("l'accueil dépose une photo dans son garage", !depotAccueil.error, depotAccueil.error?.message);
if (!depotAccueil.error) await accueil.storage.from(BUCKET).remove([cheminAccueil]);
const reprise = await accueil.rpc("preparer_devis_depuis_constat", { p_reprise_id: randomUUID(), p_inspection_id: controleId, p_points: [pointId], p_devis_id: null, p_rendez_vous_id: rdvJour.id });
verifier("« Préparer le devis » reprend le constat du mécanicien", reprise.data?.ok === true && reprise.data.lignes_creees.length === 1, JSON.stringify(reprise.data || reprise.error));
const { data: ligne } = await accueil.from("devis_lignes").select("libelle, note_constat, prix_a_renseigner, inspection_point_id").eq("devis_id", reprise.data?.devis_id).single();
verifier("ligne : libellé et précision du mécanicien, « Prix à renseigner »", ligne?.libelle === libelle && ligne?.note_constat === "Traces sous l'étrier arrière gauche." && ligne?.prix_a_renseigner === true && ligne?.inspection_point_id === pointId);

// 7. Fiche terminée.
console.log("7. Fiche terminée");
await dirigeant.from("ordres_reparation").update({ statut: "termine" }).eq("id", ordreLong);
await admin.from("garage_membres").update({ actif: true, revoked_at: null }).eq("id", membreParti.id);
const partiReactive = await session(emailParti);
const surTerminee = await partiReactive.rpc("atelier_ajouter_constat", { p_ordre_id: ordreLong, p_libelle: "X", p_etat: "dommage" });
verifier("fiche terminée → refus explicite", Boolean(surTerminee.error) && /terminée/.test(surTerminee.error.message), surTerminee.error?.message);
await admin.from("garage_membres").update({ actif: false, revoked_at: new Date().toISOString() }).eq("id", membreParti.id);

process.exit(bilan() ? 0 : 1);
