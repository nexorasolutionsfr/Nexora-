// Recette SERVEUR des modèles de travaux — Supabase TEST seul.
//
// Sous de vraies sessions :
//   1. le dirigeant crée un modèle à trois lignes (une sans prix) ;
//   2. l'accueil le lit, mais ne peut ni le modifier ni en créer ;
//   3. le mécanicien ne voit rien ;
//   4. insertion dans un devis modifiable : lignes copiées, la ligne sans prix
//      arrive « Prix à renseigner », deux appels simultanés = une insertion ;
//   5. modifier le modèle ensuite ne change pas le devis ; une nouvelle
//      insertion (autre identifiant) copie la nouvelle version ;
//   6. devis verrouillé → refus ; modèle archivé → refus ; autre garage → refus ;
//   7. « enregistrer ce devis comme modèle » : dirigeant oui, accueil non ; une
//      ligne « à renseigner » donne un prix NULL ; rien d'autre n'est copié.
//
// Usage : node scripts/recette/modeles-travaux-serveur.mjs <garage_id>
//
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(RACINE + "/.env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes("slawilafseganlbghgwx")) { console.error("REFUS : pas le projet Test."); process.exit(2); }
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const garageId = process.argv[2];
if (!garageId) { console.error("Usage : modeles-travaux-serveur.mjs <garage_id>"); process.exit(1); }

let total = 0, ok = 0;
const verifier = (libelle, cond, detail = "") => { total++; if (cond) { ok++; console.log(`  ✔ ${libelle}`); } else console.log(`  ✖ ${libelle}${detail ? " — " + detail : ""}`); };

async function session(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = anonClient();
  const { error: e2 } = await c.auth.verifyOtp({ email, token: data.properties.email_otp, type: "email" });
  if (e2) throw e2;
  return c;
}

const { data: garage } = await admin.from("garages").select("id, nom_garage").eq("id", garageId).single();
if (!garage?.nom_garage?.startsWith("PROTO Constat")) { console.error("REFUS : pas un garage « PROTO Constat »."); process.exit(2); }
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const { data: membres } = await admin.from("garage_membres").select("user_id, role, actif").eq("garage_id", garageId);
const emailDe = (role, actif = true) => users.users.find((u) => u.id === membres.find((m) => m.role === role && m.actif === actif)?.user_id)?.email;
const dirigeant = await session(emailDe("dirigeant"));
const accueil = await session(emailDe("accueil"));
const mecano = await session(emailDe("mecanicien"));
const { data: autre } = await admin.from("garages").select("id, owner_user_id").ilike("nom_garage", "PROTO Atelier 2026-09-13-08h38%").single();
const autreDirigeant = autre ? await session(users.users.find((u) => u.id === autre.owner_user_id).email) : null;

const { data: vehicule } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).eq("immatriculation", "BA-101-AA").single();
const { data: devisAccepte } = await admin.from("devis").select("id").eq("garage_id", garageId).eq("statut", "accepte").limit(1).single();
const lignesDe = async (devisId) => (await dirigeant.from("devis_lignes").select("id, libelle, prix_unitaire_ht, prix_a_renseigner, modele_id, insertion_id, inspection_point_id, position").eq("devis_id", devisId).order("position")).data || [];
const nouveauDevis = async () => (await dirigeant.from("devis").insert({ garage_id: garageId, client_id: vehicule.client_id, vehicule_id: vehicule.id, montant_ht: 0, montant_ttc: 0, statut: "en_attente" }).select("id").single()).data;

console.log(`Garage ${garage.nom_garage}\n`);

// 1. Création par le dirigeant.
console.log("1. Le dirigeant crée un modèle à trois lignes");
const { data: modele, error: eModele } = await dirigeant.from("modeles_travaux").insert({ garage_id: garageId, nom: `Plaquettes avant (recette ${Date.now()})` }).select("id, nom").single();
verifier("modèle créé", !eModele && modele?.id, eModele?.message);
const { error: eLignes } = await dirigeant.from("modeles_travaux_lignes").insert([
  { modele_id: modele.id, garage_id: garageId, type: "piece", libelle: "Jeu de plaquettes avant", quantite: 1, prix_unitaire_ht: 64, taux_tva: 20, position: 0 },
  { modele_id: modele.id, garage_id: garageId, type: "main_oeuvre", libelle: "Remplacement plaquettes avant", quantite: 1, prix_unitaire_ht: 89, taux_tva: 20, position: 1 },
  { modele_id: modele.id, garage_id: garageId, type: "piece", libelle: "Disques avant (selon usure)", quantite: 2, prix_unitaire_ht: null, taux_tva: 20, position: 2 },
]);
verifier("trois lignes, dont une sans prix", !eLignes, eLignes?.message);
{
  const { error } = await dirigeant.from("modeles_travaux_lignes").insert({ modele_id: modele.id, garage_id: autre?.id || garageId, type: "piece", libelle: "Hors garage", quantite: 1, taux_tva: 20, position: 9 });
  verifier("une ligne d'un autre garage sur ce modèle est refusée", Boolean(error), "acceptée");
}

// 2-3. Rôles.
console.log("2. L'accueil lit, ne modifie pas");
{
  const { data } = await accueil.from("modeles_travaux").select("id, modeles_travaux_lignes(id)").eq("id", modele.id);
  verifier("l'accueil voit le modèle et ses 3 lignes", data?.length === 1 && data[0].modeles_travaux_lignes.length === 3);
  const { data: maj } = await accueil.from("modeles_travaux").update({ nom: "Piraté" }).eq("id", modele.id).select("id");
  verifier("l'accueil ne modifie pas (0 ligne)", !maj || maj.length === 0);
  const { error: eCrea } = await accueil.from("modeles_travaux").insert({ garage_id: garageId, nom: "Accueil" });
  verifier("l'accueil ne crée pas", Boolean(eCrea));
}
console.log("3. Le mécanicien ne voit rien");
{
  const { data, error } = await mecano.from("modeles_travaux").select("id").eq("garage_id", garageId);
  verifier("0 modèle visible", (data || []).length === 0 && !error, error?.message);
}

// 4. Insertion, concurrence.
console.log("4. Insertion dans un devis, deux appels simultanés");
const devis = await nouveauDevis();
{
  const ins = randomUUID();
  const args = { p_insertion_id: ins, p_devis_id: devis.id, p_modele_id: modele.id, p_inspection_point_id: null };
  const [a, b] = await Promise.all([accueil.rpc("inserer_modele_dans_devis", args), accueil.rpc("inserer_modele_dans_devis", args)]);
  verifier("aucune erreur (l'accueil insère)", !a.error && !b.error, `${a.error?.message} / ${b.error?.message}`);
  verifier("une seule a inséré, l'autre dit « déjà jouée »", [a.data, b.data].filter((r) => r?.deja_jouee).length === 1);
  const lignes = await lignesDe(devis.id);
  verifier("3 lignes copiées, dans l'ordre", lignes.length === 3 && lignes.map((l) => l.libelle)[0] === "Jeu de plaquettes avant", `${lignes.length}`);
  verifier("la ligne sans prix arrive « Prix à renseigner » à 0, les autres avec leur prix", lignes.some((l) => l.prix_a_renseigner && Number(l.prix_unitaire_ht) === 0) && lignes.filter((l) => !l.prix_a_renseigner).length === 2);
  verifier("provenance posée (modele_id, insertion_id)", lignes.every((l) => l.modele_id === modele.id && l.insertion_id === ins));
  const { data: d } = await admin.from("devis").select("montant_ht").eq("id", devis.id).single();
  verifier("total partiel = 64 + 89 (la ligne à renseigner pèse 0)", Number(d.montant_ht) === 153, String(d.montant_ht));
}

// 5. Modifier le modèle ne touche pas le devis.
console.log("5. Modifier le modèle ensuite");
{
  await dirigeant.from("modeles_travaux_lignes").update({ prix_unitaire_ht: 99 }).eq("modele_id", modele.id).eq("libelle", "Remplacement plaquettes avant");
  const lignes = await lignesDe(devis.id);
  verifier("le devis garde 89 € sur la main-d'œuvre", Number(lignes.find((l) => l.libelle === "Remplacement plaquettes avant").prix_unitaire_ht) === 89);
  const devis2 = await nouveauDevis();
  const r = await dirigeant.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devis2.id, p_modele_id: modele.id });
  const l2 = await lignesDe(devis2.id);
  verifier("une nouvelle insertion copie la nouvelle version (99 €)", r.data?.ok && Number(l2.find((l) => l.libelle === "Remplacement plaquettes avant")?.prix_unitaire_ht) === 99, JSON.stringify(r.data || r.error));
  // Insérer deux fois le même modèle avec deux identifiants : deux groupes, c'est voulu (deux jeux de plaquettes).
  const r2 = await dirigeant.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devis2.id, p_modele_id: modele.id });
  verifier("deux insertions distinctes = deux groupes (le doublon se contrôle par opération, pas par libellé)", r2.data?.ok && (await lignesDe(devis2.id)).length === 6);
  await dirigeant.from("devis").delete().eq("id", devis2.id);
}

// 6. Refus.
console.log("6. Refus");
{
  const r = await dirigeant.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devisAccepte.id, p_modele_id: modele.id });
  verifier("devis verrouillé → devis_verrouille", r.data?.ok === false && r.data.raison === "devis_verrouille", JSON.stringify(r.data || r.error));
  await dirigeant.from("modeles_travaux").update({ actif: false }).eq("id", modele.id);
  const r2 = await dirigeant.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devis.id, p_modele_id: modele.id });
  verifier("modèle archivé → modele_archive", r2.data?.ok === false && r2.data.raison === "modele_archive", JSON.stringify(r2.data || r2.error));
  verifier("l'archivage n'a rien changé au devis (toujours 3 lignes)", (await lignesDe(devis.id)).length === 3);
  await dirigeant.from("modeles_travaux").update({ actif: true }).eq("id", modele.id);
  if (autreDirigeant) {
    const r3 = await autreDirigeant.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devis.id, p_modele_id: modele.id });
    verifier("autre garage → refus", Boolean(r3.error) && /accès refusé|introuvable/i.test(r3.error.message), r3.error?.message || JSON.stringify(r3.data));
  }
  const r4 = await mecano.rpc("inserer_modele_dans_devis", { p_insertion_id: randomUUID(), p_devis_id: devis.id, p_modele_id: modele.id });
  verifier("mécanicien → refus", Boolean(r4.error), JSON.stringify(r4.data));
}

// 7. Enregistrer un devis comme modèle.
console.log("7. Enregistrer ce devis comme modèle");
{
  const rA = await accueil.rpc("enregistrer_devis_comme_modele", { p_devis_id: devis.id, p_nom: "Par l'accueil" });
  verifier("l'accueil est refusé", Boolean(rA.error), JSON.stringify(rA.data));
  const rD = await dirigeant.rpc("enregistrer_devis_comme_modele", { p_devis_id: devis.id, p_nom: `Depuis devis (recette ${Date.now()})` });
  verifier("le dirigeant obtient un identifiant de modèle", !rD.error && typeof rD.data === "string", rD.error?.message);
  const { data: m } = await dirigeant.from("modeles_travaux").select("nom, modeles_travaux_lignes(libelle, prix_unitaire_ht, position)").eq("id", rD.data).single();
  const lignes = (m?.modeles_travaux_lignes || []).sort((a, b) => a.position - b.position);
  verifier("3 lignes reprises, la ligne « à renseigner » a un prix NULL", lignes.length === 3 && lignes.find((l) => l.libelle.startsWith("Disques"))?.prix_unitaire_ht === null, JSON.stringify(lignes));
  const rV = await dirigeant.rpc("enregistrer_devis_comme_modele", { p_devis_id: devisAccepte.id, p_nom: "Depuis un devis accepté" });
  verifier("un devis accepté sans lignes → refus explicite « pas de lignes »", Boolean(rV.error) && /pas de lignes/.test(rV.error.message), rV.error?.message || "accepté");
  await dirigeant.from("modeles_travaux").delete().eq("id", rD.data);
}

await dirigeant.from("devis").delete().eq("id", devis.id);
await dirigeant.from("modeles_travaux").delete().eq("id", modele.id);
console.log(`\n${ok}/${total} contrôles au vert.`);
process.exit(ok === total ? 0 : 1);
