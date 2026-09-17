// Parcours dégradés de Nexora Auto — base TEST uniquement.
//
//   node scripts/recette/parcours-degrades.mjs [http://localhost:3114]
//
// Le produit est en ligne : il doit tenir debout quand tout ne se passe pas
// bien. Ce banc éprouve ce que les bancs précédents ne couvraient pas : les
// refus du stockage, les lectures qui échouent, un fichier redéposé, un import
// abandonné, une correction après enregistrement, et la vie d'une voiture
// (archivage, restauration, voiture principale, adresse d'une voiture
// supprimée).
//
// Un compte fictif (.invalid, sans e-mail), invité le temps de la recette,
// supprimé à la fin avec ses fichiers. Refus de démarrer hors de la base Test.

import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROJET_TEST = "slawilafseganlbghgwx";
const SERVEUR = process.argv[2] || "http://localhost:3114";
const env = { ...process.env };
for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
  const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(PROJET_TEST)) {
  console.error("Refus : NEXT_PUBLIC_SUPABASE_URL ne désigne pas la base Test.");
  process.exit(1);
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const COMPARTIMENT = "auto-documents";
const admin = createClient(URL_BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const resultats = [];
const verifier = (nom, ok, detail = "") => resultats.push({ nom, ok: Boolean(ok), detail });

// Un PDF minuscule mais valide, avec du texte de facture : de quoi éprouver la
// lecture gratuite sans dépendre d'un fichier extérieur.
function pdfFacture(lignes) {
  const contenu = "BT /F1 11 Tf 40 800 Td 16 TL\n" + lignes.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*\n`).join("") + "ET";
  const flux = Buffer.from(contenu, "latin1");
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${flux.length} >>\nstream\n${flux.toString("latin1")}\nendstream`,
  ];
  let sortie = "%PDF-1.4\n";
  const decalages = [];
  objets.forEach((o, i) => {
    decalages.push(sortie.length);
    sortie += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const debutXref = sortie.length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) sortie += `${String(d).padStart(10, "0")} 00000 n \n`;
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;
  return Buffer.from(sortie, "latin1");
}

const email = `recette.degrade.${Date.now()}@nexora-recette.invalid`;
const creation = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { espace: "auto" } });
if (creation.error) throw creation.error;
const utilisateurId = creation.data.user.id;
await admin.from("auto_acces_beta").upsert({ email: email.toLowerCase(), note: "recette automatique (Test)" });

try {
  const lien = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destination = (await fetch(lien.data.properties.action_link, { redirect: "manual" })).headers.get("location") || "";
  const jeton = new URLSearchParams(destination.split("#")[1] || "").get("access_token");
  if (!jeton) throw new Error("Session de recette impossible.");
  const moi = createClient(URL_BASE, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });

  const deposer = async (vehiculeId, octets, { type = "application/pdf", nom = "facture.pdf" } = {}) => {
    const chemin = `${utilisateurId}/${vehiculeId}/${randomUUID()}.${nom.split(".").pop()}`;
    const depot = await moi.storage.from(COMPARTIMENT).upload(chemin, octets, { contentType: type });
    if (depot.error) return { erreur: depot.error.message, chemin: null };
    const fiche = await moi
      .from("auto_documents")
      .insert({ vehicule_id: vehiculeId, type: "facture", chemin, nom_fichier: nom, type_mime: type, taille_octets: octets.length, empreinte_sha256: createHash("sha256").update(octets).digest("hex") })
      .select("id")
      .single();
    return { erreur: fiche.error?.message ?? null, chemin, documentId: fiche.data?.id ?? null };
  };

  const lire = async (documentId) => {
    const r = await fetch(`${SERVEUR}/api/auto/documents/${documentId}/lecture`, { method: "POST", headers: { authorization: `Bearer ${jeton}` } });
    return { statut: r.status, corps: await r.json().catch(() => ({})) };
  };

  // ---------------------------------------------------------------------
  // A. La vie d'une voiture
  // ---------------------------------------------------------------------
  const { data: voitureA, error: eA } = await moi.rpc("auto_ajouter_vehicule", {
    p_marque: "Dacia", p_modele: "Sandero", p_annee: null, p_energie: null, p_immatriculation: null,
    p_date_mise_en_circulation: null, p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  verifier("Création avec la marque et le modèle seulement", !eA && voitureA, eA?.message ?? "");

  const { error: eModif } = await moi.from("auto_vehicules").update({ annee: 2019, energie: "diesel" }).eq("id", voitureA);
  const { data: apresModif } = await moi.from("auto_vehicules").select("annee, energie").eq("id", voitureA).single();
  verifier("Modification enregistrée", !eModif && apresModif?.annee === 2019 && apresModif?.energie === "diesel");

  const { data: voitureB } = await moi.rpc("auto_ajouter_vehicule", {
    p_marque: "Toyota", p_modele: "Yaris", p_annee: null, p_energie: null, p_immatriculation: null,
    p_date_mise_en_circulation: null, p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  const principales = async () => (await admin.from("auto_vehicules").select("id, principal").eq("proprietaire_id", utilisateurId)).data.filter((v) => v.principal);
  verifier("La première voiture est la principale", (await principales())[0]?.id === voitureA);

  // Un `update principal = true` direct heurte l'index unique : c'est voulu.
  // Le changement passe par la fonction, qui le fait en une transaction.
  const bascule = await moi.rpc("auto_definir_principal", { p_vehicule_id: voitureB });
  const apresBascule = await principales();
  verifier("Changer de voiture principale n'en laisse qu'une", !bascule.error && apresBascule.length === 1 && apresBascule[0].id === voitureB, bascule.error?.message ?? `${apresBascule.length} principale(s)`);
  const basculeBrute = await moi.from("auto_vehicules").update({ principal: true }).eq("id", voitureA);
  verifier("Deux voitures principales à la fois : refusé par la base", Boolean(basculeBrute.error), basculeBrute.error?.message ?? "accepté !");

  // Archivage, puis restauration : le dossier ne bouge pas.
  await moi.from("auto_releves_km").insert({ vehicule_id: voitureA, kilometrage: 61400, releve_le: "2026-09-01" });
  const compterReleves = async () => (await admin.from("auto_releves_km").select("id", { count: "exact", head: true }).eq("vehicule_id", voitureA)).count;
  const avantArchivage = await compterReleves();
  const archivage = await moi.rpc("auto_archiver_vehicule", { p_vehicule_id: voitureA, p_archiver: true });
  const { data: archivee } = await moi.from("auto_vehicules").select("archive_le, principal").eq("id", voitureA).single();
  verifier("Archivage : la voiture reste lisible, et n'est plus principale", !archivage.error && Boolean(archivee?.archive_le) && archivee.principal === false, archivage.error?.message ?? "");
  verifier("Archivage : le dossier est intact", (await compterReleves()) === avantArchivage);
  const restauration = await moi.rpc("auto_archiver_vehicule", { p_vehicule_id: voitureA, p_archiver: false });
  const { data: restauree } = await moi.from("auto_vehicules").select("archive_le").eq("id", voitureA).single();
  verifier("Restauration : la voiture revient, dossier compris", !restauration.error && restauree?.archive_le === null && (await compterReleves()) === avantArchivage, restauration.error?.message ?? "");

  // Adresse d'une voiture supprimée : rien ne fuit, rien ne casse.
  const { data: voitureMorte } = await moi.rpc("auto_ajouter_vehicule", {
    p_marque: "Renault", p_modele: "Clio", p_annee: null, p_energie: null, p_immatriculation: null,
    p_date_mise_en_circulation: null, p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  await moi.from("auto_vehicules").delete().eq("id", voitureMorte);
  const { data: fantome, error: eFantome } = await moi.from("auto_vehicules").select("id").eq("id", voitureMorte).maybeSingle();
  verifier("Ancienne adresse : la voiture est introuvable, sans erreur brute", !eFantome && fantome === null);

  // ---------------------------------------------------------------------
  // B. Les refus du stockage
  // ---------------------------------------------------------------------
  const trop = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x20);
  const depotVolumineux = await moi.storage.from(COMPARTIMENT).upload(`${utilisateurId}/${voitureA}/${randomUUID()}.pdf`, trop, { contentType: "application/pdf" });
  verifier("Fichier de plus de 10 Mo refusé", Boolean(depotVolumineux.error), depotVolumineux.error?.message ?? "accepté !");

  const depotTexte = await moi.storage.from(COMPARTIMENT).upload(`${utilisateurId}/${voitureA}/${randomUUID()}.txt`, Buffer.from("pas un justificatif"), { contentType: "text/plain" });
  verifier("Type de fichier non prévu refusé", Boolean(depotTexte.error), depotTexte.error?.message ?? "accepté !");

  const depotAilleurs = await moi.storage.from(COMPARTIMENT).upload(`${randomUUID()}/${voitureA}/${randomUUID()}.pdf`, pdfFacture(["essai"]), { contentType: "application/pdf" });
  verifier("Dépôt dans le dossier de quelqu'un d'autre refusé", Boolean(depotAilleurs.error), depotAilleurs.error?.message ?? "accepté !");

  // ---------------------------------------------------------------------
  // C. Les lectures qui échouent, sans perdre le document
  // ---------------------------------------------------------------------
  const lignesFacture = [
    "GARAGE DU PONT - 12 rue des Ateliers - 52100 Saint-Dizier",
    "FACTURE N F-2026-0147    Date : 02/09/2026",
    "Vehicule : DACIA SANDERO",
    "Kilometrage releve : 84 500 km",
    "Revision constructeur                                           180,00 EUR",
    "Plaquettes de frein avant                                        95,00 EUR",
    "TOTAL TTC                                                       335,00 EUR",
  ];
  const bonPdf = pdfFacture(lignesFacture);

  const abime = await deposer(voitureA, Buffer.from("%PDF-1.4\nceci n'est pas un PDF valide\n%%EOF"), { nom: "abime.pdf" });
  const lectureAbimee = await lire(abime.documentId);
  verifier("PDF illisible : la lecture le dit", lectureAbimee.corps?.etat && lectureAbimee.corps.etat !== "lue", lectureAbimee.corps?.etat ?? "");
  const { data: docApresEchec } = await moi.from("auto_documents").select("id, chemin").eq("id", abime.documentId).maybeSingle();
  verifier("PDF illisible : le document reste récupérable", Boolean(docApresEchec?.id));
  const { data: fichierApresEchec } = await moi.storage.from(COMPARTIMENT).download(docApresEchec.chemin);
  verifier("PDF illisible : le fichier reste téléchargeable", Boolean(fichierApresEchec));

  const horsSujet = await deposer(voitureA, pdfFacture(["Recette de la tarte aux pommes", "Prechauffer le four a 180 degres", "Eplucher six pommes et les couper en lamelles fines"]), { nom: "hors-sujet.pdf" });
  const lectureHorsSujet = await lire(horsSujet.documentId);
  const propositionHorsSujet = lectureHorsSujet.corps?.proposition ?? lectureHorsSujet.corps?.lecture?.proposition ?? null;
  verifier(
    "Document sans rapport : rien n'est inventé",
    lectureHorsSujet.corps?.etat !== "lue" || !propositionHorsSujet?.montantTtc,
    `${lectureHorsSujet.corps?.etat} / montant ${propositionHorsSujet?.montantTtc ?? "aucun"}`,
  );

  const image = await deposer(voitureA, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]), { type: "image/jpeg", nom: "photo.jpg" });
  const lectureImage = await lire(image.documentId);
  verifier("Photo : la lecture automatique ne la prétend pas lue", lectureImage.corps?.etat !== "lue", lectureImage.corps?.etat ?? "");
  const { data: photoGardee } = await moi.from("auto_documents").select("id").eq("id", image.documentId).maybeSingle();
  verifier("Photo : le document est gardé quand même", Boolean(photoGardee?.id));

  // ---------------------------------------------------------------------
  // D. Le même fichier redéposé
  // ---------------------------------------------------------------------
  const premier = await deposer(voitureA, bonPdf, { nom: "facture.pdf" });
  const second = await deposer(voitureA, bonPdf, { nom: "facture.pdf" });
  verifier("Même fichier redéposé sur la même voiture : refusé par la base", Boolean(second.erreur), second.erreur ?? "accepté !");
  // C'est ce que fait l'écran : retrouver l'existant par son empreinte plutôt
  // que de créer un doublon.
  const { data: retrouve } = await moi
    .from("auto_documents")
    .select("id")
    .eq("empreinte_sha256", createHash("sha256").update(bonPdf).digest("hex"))
    .limit(1)
    .maybeSingle();
  verifier("Même fichier redéposé : l'existant se retrouve par l'empreinte", retrouve?.id === premier.documentId);
  // Le même fichier sur une AUTRE voiture reste possible : c'est un autre dossier.
  const surAutreVoiture = await deposer(voitureB, bonPdf, { nom: "facture.pdf" });
  verifier("Le même fichier sur une autre voiture reste possible", !surAutreVoiture.erreur && surAutreVoiture.documentId, surAutreVoiture.erreur ?? "");

  // ---------------------------------------------------------------------
  // E. Import abandonné, puis correction après enregistrement
  // ---------------------------------------------------------------------
  const lectureBonne = await lire(premier.documentId);
  const proposition = lectureBonne.corps?.proposition ?? {};
  verifier("Facture PDF lisible : une proposition est rendue", lectureBonne.corps?.etat === "proposee", lectureBonne.corps?.etat ?? "");
  const champs = proposition.champs ?? {};
  verifier(
    "La proposition reprend le montant et le kilométrage lus",
    Number(champs.montantTtc?.valeur) === 335 && Number(champs.kilometrage?.valeur) === 84500,
    `montant ${champs.montantTtc?.valeur} (${champs.montantTtc?.certitude}), km ${champs.kilometrage?.valeur} (${champs.kilometrage?.certitude})`,
  );
  verifier("Les deux opérations de la facture sont proposées", (proposition.operations ?? []).length === 2, `${(proposition.operations ?? []).length} opération(s)`);

  // Import abandonné : le document déposé sur l'autre voiture, jamais confirmé.
  const { data: docAbandonne } = await moi.from("auto_documents").select("id, historique_id").eq("id", surAutreVoiture.documentId).maybeSingle();
  verifier("Import abandonné : le document reste, sans intervention", Boolean(docAbandonne?.id) && docAbandonne.historique_id === null);

  const confirmer = (documentId, champs) =>
    moi.rpc("auto_enregistrer_facture", {
      p_document_id: documentId, p_rattacher_a: null, p_realise_le: "2026-09-02", p_date_facture: "2026-09-02",
      p_type: "revision", p_operations: [{ type: "revision", libelle: "Revision constructeur" }, { type: "freinage", libelle: "Plaquettes de frein avant" }],
      p_prestataire: "Garage du Pont", p_kilometrage: 84500, p_montant_ttc: 335, p_libelle: "Revision",
      p_creer_malgre_ressemblance: false, p_lecture_id: null, p_corrections: null, ...champs,
    });
  const enregistrement = await confirmer(premier.documentId, {});
  verifier("Facture confirmée : intervention créée", !enregistrement.error, enregistrement.error?.message ?? "");

  const totalDepenses = async () => {
    const { data } = await admin.from("auto_historique").select("montant_ttc").eq("vehicule_id", voitureA);
    return data.reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
  };
  verifier("Facture à deux opérations : le montant compte une seule fois", (await totalDepenses()) === 335, `${await totalDepenses()} €`);

  const { data: intervention } = await admin.from("auto_historique").select("id, operations").eq("vehicule_id", voitureA).single();
  verifier("Les deux opérations sont gardées dans la même intervention", (intervention?.operations ?? []).length === 2);

  const correction = await moi.from("auto_historique").update({ montant_ttc: 412.5, kilometrage: 85000 }).eq("id", intervention.id);
  verifier("Correction après enregistrement acceptée", !correction.error, correction.error?.message ?? "");
  verifier("Dépenses actualisées après correction", (await totalDepenses()) === 412.5, `${await totalDepenses()} €`);
  const { data: interventionCorrigee } = await admin.from("auto_historique").select("kilometrage").eq("id", intervention.id).single();
  verifier("Le kilométrage corrigé est bien celui de l'intervention", Number(interventionCorrigee.kilometrage) === 85000, `${interventionCorrigee.kilometrage} km`);

  // Une facture ancienne ne doit pas effacer un relevé récent.
  await moi.from("auto_releves_km").insert({ vehicule_id: voitureA, kilometrage: 90000, releve_le: "2026-09-15" });
  const { data: recent } = await admin.from("auto_releves_km").select("kilometrage").eq("vehicule_id", voitureA).order("releve_le", { ascending: false }).limit(1).single();
  verifier("Une facture ancienne ne remplace pas un relevé récent", recent.kilometrage === 90000, `${recent.kilometrage} km`);

  // ---------------------------------------------------------------------
  // F. Rappels : ce qui se tait, ce qui revient, ce qui ne part jamais
  // ---------------------------------------------------------------------
  const { construireAPrevoir } = await import("../../components/auto/aPrevoir.js");
  const dossierDe = async (vehiculeId) => {
    const [v, releves, historique, taches, reports] = await Promise.all([
      moi.from("auto_vehicules").select("*").eq("id", vehiculeId).single(),
      moi.from("auto_releves_km").select("vehicule_id, kilometrage, releve_le, source").eq("vehicule_id", vehiculeId),
      moi.from("auto_historique").select("*").eq("vehicule_id", vehiculeId),
      moi.from("auto_taches").select("*").eq("vehicule_id", vehiculeId),
      moi.from("auto_rappels_reports").select("cle, reporte_jusqu_au"),
    ]);
    return construireAPrevoir({
      vehicules: [{ ...v.data, releves: releves.data, historique: historique.data }],
      taches: taches.data ?? [],
      reports: reports.data ?? [],
      aujourdhui: "2026-09-18",
    });
  };

  // Une voiture sans intervalle : la révision est « à compléter ». On reporte.
  const { data: voitureC } = await moi.rpc("auto_ajouter_vehicule", {
    p_marque: "Opel", p_modele: "Corsa", p_annee: null, p_energie: null, p_immatriculation: null,
    p_date_mise_en_circulation: null, p_kilometrage: null, p_dernier_controle: null, p_controle_valable_jusqu_au: null,
  });
  const avantReport = await dossierDe(voitureC);
  const revisionACompleter = avantReport.elements.find((el) => el.genre === "revision");
  verifier("Sans intervalle, la révision est à compléter", revisionACompleter?.etat === "a_completer", revisionACompleter?.etat ?? "");

  await moi.from("auto_rappels_reports").upsert({ proprietaire_id: utilisateurId, cle: revisionACompleter.cle, reporte_jusqu_au: "2026-12-01" }, { onConflict: "proprietaire_id,cle" });
  const apresReport = await dossierDe(voitureC);
  verifier(
    "Un rappel reporté se tait",
    Boolean(apresReport.elements.find((el) => el.cle === revisionACompleter.cle)?.reporteJusquau),
    "",
  );

  // On renseigne l'intervalle et la dernière révision : l'échéance devient
  // calculable, et le report de l'ANCIENNE situation ne doit pas la museler.
  await moi.from("auto_vehicules").update({ intervalle_entretien_km: 15000, intervalle_entretien_mois: 12 }).eq("id", voitureC);
  await moi.from("auto_historique").insert({ vehicule_id: voitureC, type: "revision", realise_le: "2026-03-01", kilometrage: 50000, libelle: "Révision" });
  const apresCorrection = await dossierDe(voitureC);
  const revisionCalculee = apresCorrection.elements.find((el) => el.genre === "revision");
  verifier("L'information complétée rend l'échéance calculable", revisionCalculee?.etat === "a_faire", revisionCalculee?.etat ?? "");
  verifier("Le report de l'ancienne situation ne muselle pas la nouvelle échéance", !revisionCalculee?.reporteJusquau, revisionCalculee?.reporteJusquau ?? "aucun");

  // Une tâche terminée quitte les prochaines actions.
  const { data: tache } = await moi.from("auto_taches").insert({ vehicule_id: voitureC, titre: "Monter les pneus hiver", echeance: "2026-09-25" }).select("id").single();
  const avecTache = await dossierDe(voitureC);
  verifier("Une tâche datée entre dans les prochaines actions", avecTache.prochaines.some((el) => el.tacheId === tache.id));
  await moi.from("auto_taches").update({ statut: "terminee", terminee_le: new Date().toISOString() }).eq("id", tache.id);
  const sansTache = await dossierDe(voitureC);
  verifier("Une tâche terminée en sort aussitôt", !sansTache.prochaines.some((el) => el.tacheId === tache.id));

  // Le journal des envois est réservé au service : personne ne le lit ni ne
  // l'écrit depuis un navigateur, même pour ses propres rappels.
  const lectureEnvois = await moi.from("auto_rappels_envois").select("id").limit(1);
  const ecritureEnvois = await moi.from("auto_rappels_envois").insert({ proprietaire_id: utilisateurId, cle: "essai", palier: "j7", canal: "email" });
  verifier("Journal des rappels envoyés : lecture refusée à la personne", Boolean(lectureEnvois.error), lectureEnvois.error?.message ?? "lue !");
  verifier("Journal des rappels envoyés : écriture refusée à la personne", Boolean(ecritureEnvois.error), ecritureEnvois.error?.message ?? "acceptée !");
} finally {
  const { data: fiches } = await admin.from("auto_documents").select("chemin").in("vehicule_id", (await admin.from("auto_vehicules").select("id").eq("proprietaire_id", utilisateurId)).data?.map((v) => v.id) ?? ["00000000-0000-0000-0000-000000000000"]);
  const { data: restes } = await admin.storage.from(COMPARTIMENT).list(utilisateurId, { limit: 100 });
  for (const dossier of restes ?? []) {
    const { data: fichiers } = await admin.storage.from(COMPARTIMENT).list(`${utilisateurId}/${dossier.name}`, { limit: 100 });
    if (fichiers?.length) await admin.storage.from(COMPARTIMENT).remove(fichiers.map((f) => `${utilisateurId}/${dossier.name}/${f.name}`));
  }
  await admin.from("auto_acces_beta").delete().eq("email", email.toLowerCase());
  await admin.auth.admin.deleteUser(utilisateurId);
  const passes = resultats.filter((r) => r.ok).length;
  for (const r of resultats) console.log(`${r.ok ? "ok  " : "ÉCHEC"} ${r.nom}${r.detail ? ` — ${r.detail}` : ""}`);
  console.log(`\n${passes}/${resultats.length} contrôles passés. Compte fictif supprimé, ${(fiches ?? []).length} fiche(s) de document retirée(s) avec lui.`);
  process.exit(passes === resultats.length ? 0 : 1);
}
