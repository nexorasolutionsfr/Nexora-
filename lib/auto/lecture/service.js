// Lire une facture déjà déposée : le chemin complet, côté serveur.
//
// 1. Le document est lu AVEC LES DROITS DE LA PERSONNE (RLS) : on ne lit que
//    ses propres factures.
// 2. Une proposition déjà obtenue est rendue telle quelle : pas de nouvel
//    appel, sauf demande explicite (« relire »), dans la limite des tentatives.
// 3. Sans clé, sans budget ou en Production : « indisponible », la facture
//    reste conservée et se renseigne à la main.
// 4. Format, taille, pages : vérifiés avant tout appel.
// 5. Réservation sur le budget (fonction auto_lecture_reserver, verrou) :
//    tentatives par document, lectures par compte sur 24 h, budget d'essai.
// 6. Comptage des jetons (gratuit), puis lecture. Chaque tentative est
//    journalisée dans auto_lectures avec son coût estimé et son statut de
//    facturation, y compris en cas d'échec.
//
// Dépendances injectées pour les tests (service.test.js).

import { coutMicroUsd, reserveMicroUsd } from "./couts.js";
import { ErreurLecture } from "./anthropic.js";
import { LIMITES_LECTURE, compterPagesPdf, lisibleAutomatiquement } from "./limites.js";
import { normaliserProposition } from "./proposition.js";

const COMPARTIMENT = "auto-documents";

export async function lireFacture({
  documentId,
  utilisateurId,
  relire = false,
  configuration,
  clientPersonne,
  clientServeur,
  creerFournisseur,
  aujourdhui,
  limites = LIMITES_LECTURE,
  journal = console,
}) {
  const { data: document, error } = await clientPersonne
    .from("auto_documents")
    .select("id, vehicule_id, chemin, type_mime, taille_octets, historique_id, lecture")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return { etat: "echec", raison: "lecture_document" };
  if (!document) return { etat: "introuvable" };
  if (document.historique_id) return { etat: "deja_enregistree" };
  if (document.lecture && !relire) return { etat: "proposee", proposition: document.lecture, reprise: true };
  if (!configuration.disponible) return { etat: "indisponible", raison: configuration.raison };

  const avant = lisibleAutomatiquement({ typeMime: document.type_mime, taille: document.taille_octets, pages: 1 });
  if (!avant.lisible) return { etat: "illisible", raison: avant.raison };

  const telechargement = await clientPersonne.storage.from(COMPARTIMENT).download(document.chemin);
  if (telechargement.error || !telechargement.data) return { etat: "echec", raison: "fichier_introuvable" };
  const octets = new Uint8Array(await telechargement.data.arrayBuffer());
  const pages = document.type_mime === "application/pdf" ? compterPagesPdf(octets) : null;
  const verification = lisibleAutomatiquement({ typeMime: document.type_mime, taille: octets.byteLength, pages });
  if (!verification.lisible) return { etat: "illisible", raison: verification.raison };

  // Réserve : le pire cas permis par les limites, remplacé par le coût estimé.
  const reserve = reserveMicroUsd({ jetonsEntree: limites.jetonsEntreeMax, jetonsSortieMax: limites.jetonsSortieMax }, configuration.modele);
  const reservation = await clientServeur.rpc("auto_lecture_reserver", {
    p_proprietaire_id: utilisateurId,
    p_document_id: document.id,
    p_fournisseur: configuration.fournisseur,
    p_modele: configuration.modele,
    p_cout_reserve_micro_usd: reserve,
    p_budget_micro_usd: configuration.budgetMicroUsd,
    p_tentatives_max: limites.tentativesParDocument,
    p_lectures_24h_max: configuration.lecturesParCompte24h ?? limites.lecturesParCompte24h,
  });
  const ligne = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data;
  if (reservation.error || !ligne) return { etat: "echec", raison: "reservation" };
  if (ligne.refus) return { etat: "limite", raison: ligne.refus };
  const lectureId = ligne.lecture_id;

  async function terminer(champs) {
    const { error: erreurJournal } = await clientServeur
      .from("auto_lectures")
      .update({ ...champs, termine_le: new Date().toISOString() })
      .eq("id", lectureId);
    // La ligne reste « en_cours » : sa réserve continue de compter (prudence).
    if (erreurJournal) journal.error("[lecture] journal non mis à jour", lectureId, erreurJournal.message);
  }

  const fournisseur = creerFournisseur(configuration);
  const contenu = { typeMime: document.type_mime, base64: Buffer.from(octets).toString("base64") };

  try {
    const { jetonsEntree } = await fournisseur.compterJetons(contenu);
    if (jetonsEntree > limites.jetonsEntreeMax) {
      await terminer({ statut: "echec", facturation: "non_facturee", erreur: "document_trop_long", tokens_entree: jetonsEntree, cout_estime_micro_usd: 0 });
      return { etat: "illisible", raison: "longueur", lectureId };
    }

    const { brut, usage, dureeMs } = await fournisseur.lire(contenu);
    const proposition = {
      ...normaliserProposition(brut, { aujourdhui }),
      fournisseur: fournisseur.nom,
      modele: fournisseur.modele,
      lectureId,
      lueLe: new Date().toISOString(),
    };
    await terminer({
      statut: "reussie",
      facturation: "facturee",
      tokens_entree: usage?.input_tokens ?? null,
      tokens_sortie: usage?.output_tokens ?? null,
      cout_estime_micro_usd: coutMicroUsd(usage, fournisseur.modele),
      duree_ms: dureeMs,
    });
    const enregistrement = await clientPersonne.from("auto_documents").update({ lecture: proposition }).eq("id", document.id);
    if (enregistrement.error) journal.error("[lecture] proposition non conservée", document.id, enregistrement.error.message);
    return { etat: "proposee", proposition, lectureId };
  } catch (e) {
    const connue = e instanceof ErreurLecture;
    await terminer({
      statut: "echec",
      facturation: connue ? e.facturation : "inconnue",
      erreur: connue ? e.code : "erreur_interne",
      tokens_entree: e?.usage?.input_tokens ?? null,
      tokens_sortie: e?.usage?.output_tokens ?? null,
      cout_estime_micro_usd: connue && e.facturation === "non_facturee" ? 0 : e?.usage ? coutMicroUsd(e.usage, fournisseur.modele) : null,
    });
    if (!connue) journal.error("[lecture] erreur", e);
    return { etat: "echec", raison: connue ? e.code : "erreur_interne", lectureId };
  }
}
