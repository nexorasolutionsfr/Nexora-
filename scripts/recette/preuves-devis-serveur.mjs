// Recette SERVEUR de la preuve photo sur le devis public — Supabase TEST.
//
// Joue la chaîne réelle : constat avec photo → devis → chiffrage → lien
// public → lecture anonyme → route de signature (serveur de dev local) →
// acceptation par le client → modification du constat et des photos après
// coup. Vérifie aussi ce qui ne doit PAS sortir : l'autre point photographié
// du même contrôle, son commentaire, les chemins de stockage, l'identifiant
// du contrôle, les notes internes.
//
// Usage : node scripts/recette/preuves-devis-serveur.mjs <garage_id> [port]

import { randomUUID } from "node:crypto";
import { BUCKET, admin, anonClient, compteur, garageDeRecette, imagePng, session, utilisateurs } from "./outils-recette.mjs";

const [garageId, port = "3000"] = process.argv.slice(2);
if (!garageId) { console.error("Usage : preuves-devis-serveur.mjs <garage_id> [port]"); process.exit(1); }
const garage = await garageDeRecette(garageId);
const { verifier, bilan } = compteur();
const users = await utilisateurs();
const dirigeant = await session(users.find((u) => u.id === garage.owner_user_id).email);
const anon = anonClient();
const ROUTE = `http://localhost:${port}/api/devis/preuves`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const appelRoute = async (corps) => {
  try {
    const r = await fetch(ROUTE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    return { status: r.status, corps: await r.json() };
  } catch (e) { return { status: 0, corps: { error: e.message } }; }
};

const { data: vBA } = await admin.from("vehicules").select("id").eq("garage_id", garageId).eq("immatriculation", "BA-101-AA").single();
const { data: rdv } = await admin.from("rendez_vous").select("id").eq("vehicule_id", vBA.id).eq("statut_atelier", "diagnostic").single();
const { data: controle } = await admin.from("inspections").select("id").eq("rendez_vous_id", rdv.id).is("verrouille_le", null).order("created_at", { ascending: false }).limit(1).single();

console.log(`Garage ${garage.nom_garage}\n`);

async function pointAvecPhoto(libelle, commentaire, couleur) {
  const { data: p, error } = await dirigeant.from("inspections_points").insert({ inspection_id: controle.id, garage_id: garageId, categorie: "exterieur", libelle, etat: "dommage", commentaire, soumis_client: false }).select("id").single();
  if (error) { console.error("point :", error.message); process.exit(1); }
  const chemin = `${garageId}/${controle.id}/${randomUUID()}.png`;
  const up = await dirigeant.storage.from(BUCKET).upload(chemin, imagePng(...couleur), { contentType: "image/png" });
  if (up.error) { console.error("dépôt :", up.error.message); process.exit(1); }
  const { data: ph, error: e2 } = await dirigeant.from("inspections_photos").insert({ inspection_id: controle.id, garage_id: garageId, point_id: p.id, storage_path: chemin }).select("id").single();
  if (e2) { console.error("photo :", e2.message); process.exit(1); }
  return { id: p.id, chemin, photoId: ph.id };
}
const t = Date.now();
const retenu = await pointAvecPhoto(`Bas de caisse enfoncé (recette ${t})`, "Choc côté conducteur, 15 cm.", [50, 70, 150]);
const ecarte = await pointAvecPhoto(`Rétroviseur rayé (recette ${t})`, "COMMENTAIRE-NON-PARTAGE", [30, 140, 60]);

const rep = await dirigeant.rpc("preparer_devis_depuis_constat", { p_reprise_id: randomUUID(), p_inspection_id: controle.id, p_points: [retenu.id], p_devis_id: null, p_rendez_vous_id: rdv.id });
const devisId = rep.data?.devis_id;
verifier("devis préparé depuis le seul point retenu", rep.data?.ok && rep.data.lignes_creees.length === 1, JSON.stringify(rep.data || rep.error));
const { data: lignes } = await dirigeant.from("devis_lignes").select("id").eq("devis_id", devisId);
await dirigeant.from("devis_lignes").update({ prix_unitaire_ht: 220, prix_a_renseigner: false }).eq("id", lignes[0].id);
await dirigeant.from("devis_lignes").insert({ devis_id: devisId, garage_id: garageId, type: "piece", libelle: "Kit de fixation", quantite: 1, prix_unitaire_ht: 18, taux_tva: 20, position: 1 });
const jeton = await dirigeant.rpc("creer_jeton_devis", { p_devis_id: devisId });
verifier("lien public créé une fois chiffré", !jeton.error && typeof jeton.data === "string", jeton.error?.message);
const token = jeton.data;

console.log("1. Lecture publique du devis en attente");
const l1 = await anon.rpc("lire_devis_par_jeton", { p_token: token });
const brut1 = JSON.stringify(l1.data);
const ligneConstat = l1.data?.lignes?.find((l) => l.preuve);
verifier("la ligne reprise porte sa preuve : constat + 1 identifiant opaque", ligneConstat?.preuve?.constat === "Choc côté conducteur, 15 cm." && ligneConstat.preuve.photos.length === 1 && UUID.test(ligneConstat.preuve.photos[0]), JSON.stringify(ligneConstat));
verifier("la ligne ajoutée à la main n'a pas de preuve", l1.data?.lignes?.filter((l) => !l.preuve).length === 1);
verifier("l'autre point du contrôle n'apparaît pas (photo, commentaire, libellé)", !brut1.includes(ecarte.photoId) && !brut1.includes("COMMENTAIRE-NON-PARTAGE") && !brut1.includes("Rétroviseur rayé"));
verifier("aucun chemin de stockage, identifiant de contrôle ou de garage, note interne, contact", !brut1.includes(`${garageId}/`) && !brut1.includes(controle.id) && !brut1.includes(garageId) && !/notes_internes|email|telephone|inspection_point_id|\.png/.test(brut1));
const anonDirect = await anon.rpc("chemins_preuves_devis", { p_token: token });
verifier("la correspondance identifiant → chemin est fermée à l'anonyme", Boolean(anonDirect.error));

console.log("2. Route /api/devis/preuves (serveur de dev local)");
const route = await appelRoute({ token });
const cles = Object.keys(route.corps?.urls || {});
verifier("jeton valide : 200, une seule URL, clé = l'identifiant de la ligne", route.status === 200 && cles.length === 1 && cles[0] === ligneConstat?.preuve?.photos?.[0], JSON.stringify(route));
const img = cles.length ? await fetch(route.corps.urls[cles[0]]) : null;
verifier("l'URL signée sert l'image retenue (200 image/png)", img?.status === 200 && /image\/png/.test(img.headers.get("content-type") || ""));
const faux = await appelRoute({ token: "0".repeat(64) });
verifier("jeton inconnu : rien signé", Object.keys(faux.corps?.urls || {}).length === 0);
const injection = await appelRoute({ token, photos: [ecarte.photoId], paths: [ecarte.chemin] });
verifier("identifiants ou chemins fournis par l'appelant ignorés", !Object.keys(injection.corps?.urls || {}).includes(ecarte.photoId) && Object.keys(injection.corps?.urls || {}).length === 1);

console.log("3. Acceptation par le client, puis changements côté garage");
const acc = await anon.rpc("repondre_devis_par_jeton", { p_token: token, p_reponse: "accepte" });
verifier("le client accepte depuis son lien", acc.data?.ok === true, JSON.stringify(acc.data));
const { data: figees } = await admin.from("devis_preuves").select("id, storage_path, devis_ligne_id").eq("devis_id", devisId);
verifier("la photo est figée sur la ligne au moment de la décision", figees.length === 1 && figees[0].storage_path === retenu.chemin && figees[0].devis_ligne_id === lignes[0].id);

await dirigeant.from("inspections_points").update({ commentaire: "COMMENTAIRE MODIFIÉ APRÈS ACCEPTATION", libelle: `Libellé modifié (recette ${t})` }).eq("id", retenu.id);
const nouvelle = `${garageId}/${controle.id}/${randomUUID()}.png`;
await dirigeant.storage.from(BUCKET).upload(nouvelle, imagePng(200, 200, 40), { contentType: "image/png" });
await dirigeant.from("inspections_photos").insert({ inspection_id: controle.id, garage_id: garageId, point_id: retenu.id, storage_path: nouvelle });
const l2 = await anon.rpc("lire_devis_par_jeton", { p_token: token });
const p2 = l2.data?.lignes?.find((l) => l.preuve)?.preuve;
verifier("constat modifié ensuite : le devis accepté montre toujours le texte d'origine", p2?.constat === "Choc côté conducteur, 15 cm.");
verifier("photo ajoutée ensuite : le devis accepté ne montre que la photo figée", p2?.photos?.length === 1 && p2.photos[0] === figees[0].id, JSON.stringify(p2));

const supprRow = await dirigeant.from("inspections_photos").delete().eq("storage_path", retenu.chemin).select("id");
verifier("supprimer la photo figée (table) → refusé", Boolean(supprRow.error) && /devis accepté ou refusé/.test(supprRow.error.message), supprRow.error?.message || JSON.stringify(supprRow.data));
await dirigeant.storage.from(BUCKET).remove([retenu.chemin]);
const encoreLa = await admin.storage.from(BUCKET).download(retenu.chemin);
verifier("supprimer la photo figée (stockage) → l'objet reste", !encoreLa.error && encoreLa.data);
const supprPoint = await dirigeant.from("inspections_points").delete().eq("id", retenu.id).select("id");
verifier("supprimer le point dont la photo est figée → refusé", Boolean(supprPoint.error), JSON.stringify(supprPoint.data));
const supprNouvelle = await dirigeant.from("inspections_photos").delete().eq("storage_path", nouvelle).select("id");
verifier("une photo non figée se supprime normalement", !supprNouvelle.error && supprNouvelle.data?.length === 1, supprNouvelle.error?.message);
await dirigeant.storage.from(BUCKET).remove([nouvelle]);

const route2 = await appelRoute({ token });
const cles2 = Object.keys(route2.corps?.urls || {});
const img2 = cles2.length ? await fetch(route2.corps.urls[cles2[0]]) : null;
verifier("après tout cela, la route signe exactement la photo figée, et elle s'affiche", cles2.length === 1 && cles2[0] === figees[0].id && img2?.status === 200);

await dirigeant.from("inspections_photos").delete().eq("point_id", ecarte.id);
await dirigeant.storage.from(BUCKET).remove([ecarte.chemin]);
await dirigeant.from("inspections_points").delete().eq("id", ecarte.id);
console.log(`\n(devis accepté ${devisId} conservé, jeton laissé actif pour la recette écran)`);
console.log(`Lien public : http://localhost:${port}/devis/${token}`);

process.exit(bilan() ? 0 : 1);
