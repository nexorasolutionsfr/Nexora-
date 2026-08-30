import { SECTION_FIXE, SEUILS, SOURCES_REACTIVATION_AUTO } from "./cockpitConstants";

// Cockpit Opportunités V1 — dérivation pure des opportunités à partir des
// données déjà existantes. Aucune donnée n'est stockée ici : uniquement
// calculée à chaque rendu à partir de rappels_manques, demandes, rendez_vous,
// inspections, travaux_differes et clients. Les seuils viennent tous de
// cockpitConstants.js — aucun chiffre en dur, aucun score opaque.

const heuresDepuis = (dateStr, now) => (dateStr ? Math.floor((now.getTime() - new Date(dateStr).getTime()) / 3_600_000) : 0);
const joursDepuis = (dateStr, now) => (dateStr ? Math.floor((now.getTime() - new Date(dateStr).getTime()) / 86_400_000) : 0);
const joursAvant = (dateStr, now) => Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);

function isLikelyPhone(value) {
  if (!value) return false;
  const cleaned = value.replace(/[\s.\-()]/g, "");
  return /^\+?\d{6,15}$/.test(cleaned);
}

function depuisLabel(dateStr, now) {
  if (!dateStr) return "";
  const heures = heuresDepuis(dateStr, now);
  if (heures < 1) return "reçu à l'instant";
  if (heures < 24) return `reçu il y a ${heures}h`;
  const jours = Math.floor(heures / 24);
  return `reçu il y a ${jours} jour${jours > 1 ? "s" : ""}`;
}

// Construit la liste brute des candidats (une entrée par source), avec leur
// section "naturelle" selon les règles métier — avant application du journal
// traiter/reporter/réactiver.
export function construireCandidats(ctx) {
  const {
    now,
    demandes = [],
    propositions = [],
    devisList = [],
    rappelsManques = [],
    rendezVous = [],
    travauxDifferes = [],
    clients = [],
    inspections = [],
    handlers = {},
  } = ctx;
  const { onSelectDemande, onSelectAppt, setView, onChangerStatutRappel, onMarquerContacteTravail, onReprogrammerTravail, onMarquerRecupereTravail, onCloturerRefusTravail, onOuvrirInspection, onToast } = handlers;

  const candidats = [];

  // ---- Demandes Gmail non traitées ------------------------------------------------
  const demandesOuvertes = demandes.filter((d) => d.statut === "nouveau" || d.statut === "infos_manquantes");
  for (const d of demandesOuvertes) {
    const urgente = d.urgence === "Élevée";
    candidats.push({
      key: `demande:${d.id}`,
      sourceType: "demande",
      sourceId: d.id,
      section: urgente ? "maintenant" : "aujourdhui",
      stripe: urgente ? "#DC2626" : "#3D6BE0",
      urgent: urgente,
      titre: `${d.statut === "infos_manquantes" ? "Informations à compléter" : "Nouvelle demande Gmail"} — ${d.clients?.nom || "Client"}`,
      meta: `${depuisLabel(d.created_at, now)} · ${d.motif || d.type_demande || "motif non précisé"}`,
      action: "Ouvrir la demande",
      onAction: () => onSelectDemande && onSelectDemande(d),
    });
  }

  // ---- Créneaux proposés en attente de validation ----------------------------------
  for (const p of propositions) {
    const retard = joursDepuis(p.created_at, now) >= SEUILS.propositionRetard.maintenantJours;
    candidats.push({
      key: `proposition:${p.id}`,
      sourceType: "proposition",
      sourceId: p.id,
      section: retard ? "maintenant" : "aujourdhui",
      stripe: retard ? "#DC2626" : "#3D6BE0",
      urgent: retard,
      titre: `Créneau en attente — ${p.client}`,
      meta: `${depuisLabel(p.created_at, now)} · ${p.prestation || "prestation non précisée"}`,
      action: "Ouvrir le créneau",
      onAction: () => setView && setView("valider"),
    });
  }

  // ---- Devis sans réponse -----------------------------------------------------------
  const devisIdsAvecTravailDiffere = new Set(travauxDifferes.map((t) => t.devis_id).filter(Boolean));
  const devisEnAttente = devisList.filter((d) => d.statut === "en_attente" && !devisIdsAvecTravailDiffere.has(d.id));
  for (const d of devisEnAttente) {
    const jours = joursDepuis(d.created_at, now);
    candidats.push({
      key: `devis:${d.id}`,
      sourceType: "devis",
      sourceId: d.id,
      section: "aujourdhui",
      stripe: "#B45309",
      urgent: false,
      titre: `Devis sans réponse depuis ${jours} jour${jours > 1 ? "s" : ""}`,
      meta: `${d.client} · ${d.prestation || "—"}`,
      amount: Number(d.montant_ttc || 0),
      action: "Ouvrir le devis",
      onAction: () => setView && setView("devis"),
    });
  }

  // ---- Relais Appels — rappels actifs ----------------------------------------------
  const rappelsActifs = rappelsManques.filter((r) => ["a_rappeler", "tentative_sans_reponse", "rdv_a_creer"].includes(r.statut));
  for (const r of rappelsActifs) {
    const telHref = isLikelyPhone(r.telephone) ? `tel:${r.telephone.replace(/[\s.\-()]/g, "")}` : null;
    const statusControl = {
      value: r.statut,
      onChange: (statut) => onChangerStatutRappel && onChangerStatutRappel(r.id, statut),
    };
    const estCreationRdv = r.statut === "rdv_a_creer";
    candidats.push({
      key: `rappel:${r.id}`,
      sourceType: "rappel",
      sourceId: r.id,
      section: r.urgent ? "maintenant" : "aujourdhui",
      stripe: r.urgent ? "#DC2626" : "#3D6BE0",
      urgent: !!r.urgent,
      suiviInterne: true,
      updatedAt: r.updated_at,
      titre: estCreationRdv
        ? `RDV à créer — ${r.telephone || "numéro non renseigné"}`
        : `${r.statut === "tentative_sans_reponse" ? "Rappel — sans réponse" : "Rappel à faire"} — ${r.telephone || "numéro non renseigné"}`,
      meta: `${depuisLabel(r.created_at, now)}${r.motif ? ` · ${r.motif}` : ""}`,
      action: estCreationRdv ? "Ouvrir l'agenda" : r.statut === "tentative_sans_reponse" ? "Réessayer" : "Rappeler",
      telHref: estCreationRdv ? null : telHref,
      onAction: estCreationRdv
        ? () => setView && setView("agenda")
        : telHref
          ? undefined
          : () => onToast && onToast("Aucun numéro reconnu pour cet appel."),
      statusControl,
    });
  }

  // ---- Confirmations RDV : report demandé + en attente jamais confirmé ------------
  for (const r of rendezVous) {
    if (r.statut_confirmation === "report_demande") {
      candidats.push({
        key: `rdv_confirmation:${r.id}`,
        sourceType: "rdv_confirmation",
        sourceId: r.id,
        section: SECTION_FIXE.rdvReportDemande,
        stripe: "#DC2626",
        urgent: true,
        titre: `Report demandé — ${r.client}`,
        meta: `${r.jour || ""} ${r.debut || ""} · ${r.prestation || "—"}${r.confirmation_repondu_at ? ` · ${depuisLabel(r.confirmation_repondu_at, now)}` : ""}`.trim(),
        action: "Voir le rendez-vous",
        onAction: () => onSelectAppt && onSelectAppt(r),
      });
      continue;
    }
    if (r.statut_confirmation === "en_attente_confirmation" && r.date_debut) {
      // Section fixe, sans palier ni filtre de date (aucune règle existante à
      // reprendre pour cette catégorie inédite) : voir SECTION_FIXE.rdvEnAttenteConfirmation.
      const joursRestants = joursAvant(r.date_debut, now);
      candidats.push({
        key: `rdv_confirmation:${r.id}`,
        sourceType: "rdv_confirmation",
        sourceId: r.id,
        section: SECTION_FIXE.rdvEnAttenteConfirmation,
        stripe: "#3D6BE0",
        urgent: false,
        titre: `Sans confirmation — ${r.client}`,
        meta: `${r.jour || ""} ${r.debut || ""} · ${r.prestation || "—"} · ${joursRestants <= 0 ? "rendez-vous passé sans réponse" : `dans ${joursRestants} jour${joursRestants > 1 ? "s" : ""}`}`.trim(),
        action: "Voir le rendez-vous",
        onAction: () => onSelectAppt && onSelectAppt(r),
      });
    }
  }

  // ---- Inspections en attente de décision client -----------------------------------
  const ENATTENTE = ["en_attente_client", "consulte", "partiellement_valide"];
  for (const i of inspections) {
    if (!ENATTENTE.includes(i.statut)) continue;
    // Section fixe (voir SECTION_FIXE.inspectionEnAttente) : aucune règle
    // temporelle existante à reprendre pour cette catégorie inédite.
    const heures = heuresDepuis(i.verrouille_le, now);
    const clientLabel = i.clients?.nom || i.client_nom_libre || "Client libre";
    const vehiculeLabel = i.vehicules ? `${i.vehicules.marque || ""} ${i.vehicules.modele || ""}`.trim() : i.vehicule_libelle_libre;
    candidats.push({
      key: `inspection:${i.id}`,
      sourceType: "inspection",
      sourceId: i.id,
      section: SECTION_FIXE.inspectionEnAttente,
      stripe: "#3D6BE0",
      urgent: false,
      updatedAt: i.updated_at,
      titre: `Inspection en attente — ${clientLabel}`,
      meta: `${vehiculeLabel ? `${vehiculeLabel} · ` : ""}partagée depuis ${heures < 24 ? `${heures}h` : `${Math.floor(heures / 24)} jour${Math.floor(heures / 24) > 1 ? "s" : ""}`}`,
      action: "Voir l'inspection",
      onAction: () => onOuvrirInspection && onOuvrirInspection(i.id),
    });
  }

  // ---- Travaux différés à récupérer (module gelé — logique reprise à l'identique) --
  const NIVEAU_RANG = { securite: 0, important: 1, normal: 2 };
  const travauxActifs = travauxDifferes.filter((t) => t.statut !== "recupere" && t.statut !== "refus_definitif" && new Date(t.date_relance) <= now);
  for (const t of travauxActifs) {
    const retardJours = joursDepuis(t.date_relance, now);
    const critique = t.niveau === "securite" || retardJours >= SEUILS.travailDiffereRetardCritique.jours;
    candidats.push({
      key: `travail_differe:${t.id}`,
      sourceType: "travail_differe",
      sourceId: t.id,
      section: critique ? "maintenant" : "aujourdhui",
      stripe: critique ? "#DC2626" : "#B45309",
      urgent: critique,
      suiviInterne: true,
      updatedAt: t.updated_at,
      titre: `${t.intervention}${t.niveau === "securite" ? " · sécurité" : ""}`,
      meta: `${t.clientNom}${t.vehiculeLabel ? ` · ${t.vehiculeLabel}` : ""} · reporté depuis ${retardJours} jour${retardJours > 1 ? "s" : ""}${t.statut === "contacte_en_attente" ? " · contacté, en attente" : ""}`,
      amount: t.montant_ttc ? Number(t.montant_ttc) : 0,
      action: "Ouvrir la fiche",
      onAction: () => setView && setView("clients"),
      statusControl: {
        value: t.statut === "planifie" ? "a_relancer" : t.statut,
        options: [
          { value: "a_relancer", label: "À relancer" },
          { value: "contacte_en_attente", label: "Contacté — en attente" },
          { value: "recupere", label: "Récupéré" },
          { value: "refus_definitif", label: "Refus définitif" },
        ],
        onChange: (statut) => {
          if (statut === "contacte_en_attente") onMarquerContacteTravail && onMarquerContacteTravail(t.id);
          else if (statut === "recupere") onMarquerRecupereTravail && onMarquerRecupereTravail(t.id);
          else if (statut === "refus_definitif") onCloturerRefusTravail && onCloturerRefusTravail(t.id);
        },
      },
      dateControl: { onChange: (date) => onReprogrammerTravail && onReprogrammerTravail(t.id, date) },
    });
  }

  // ---- Clients fidèles silencieux : retirée du Cockpit V1 -------------------------
  // clients.fidele n'existe pas dans le schéma réel (colonnes réelles : id, garage_id,
  // nom, email, telephone, created_at) et n'est écrit nulle part dans l'app — la
  // règle est structurellement morte (audit du 2026-08-30), pas seulement absente de
  // données de recette. Retirée plutôt que masquée par une donnée simulée.

  return candidats;
}

// Applique le journal opportunites_actions : détermine, pour chaque candidat,
// s'il est visible ou masqué (et pourquoi), sans jamais modifier ni supprimer
// l'historique — seule la ligne la plus récente par source fait foi.
export function appliquerActions(candidats, actions, now) {
  const dernierParCle = new Map();
  for (const a of actions) {
    const cle = `${a.source_type}:${a.source_id}`;
    const existant = dernierParCle.get(cle);
    if (!existant || new Date(a.created_at) > new Date(existant.created_at)) {
      dernierParCle.set(cle, a);
    }
  }

  const visibles = [];
  const masquees = [];

  for (const c of candidats) {
    const derniere = dernierParCle.get(c.key);
    if (!derniere) {
      visibles.push(c);
      continue;
    }
    if (derniere.action === "reactiver") {
      visibles.push(c);
      continue;
    }
    // Réapparition automatique : uniquement pour les sources listées dans
    // SOURCES_REACTIVATION_AUTO, et seulement si leur updated_at (réel,
    // déjà utilisé ailleurs dans l'app) est postérieur à la dernière action.
    // Pour toute autre source, aucune réapparition automatique n'est tentée.
    const activiteReelleRecente =
      SOURCES_REACTIVATION_AUTO.includes(c.sourceType) && c.updatedAt && new Date(c.updatedAt) > new Date(derniere.created_at);
    if (activiteReelleRecente) {
      visibles.push(c);
      continue;
    }
    if (derniere.action === "traite") {
      masquees.push({ ...c, masquageAction: derniere });
      continue;
    }
    if (derniere.action === "reporte") {
      if (derniere.masquer_jusqu_au && new Date(derniere.masquer_jusqu_au) > now) {
        masquees.push({ ...c, masquageAction: derniere });
      } else {
        visibles.push(c);
      }
      continue;
    }
    visibles.push(c);
  }

  return { visibles, masquees };
}

export function deriveOpportunites(ctx) {
  const now = ctx.now || new Date();
  const candidats = construireCandidats({ ...ctx, now });
  const { visibles, masquees } = appliquerActions(candidats, ctx.actions || [], now);

  const sections = { maintenant: [], aujourdhui: [], a_planifier: [] };
  for (const v of visibles) {
    (sections[v.section] || sections.a_planifier).push(v);
  }
  // Tri interne : urgent d'abord, puis les plus anciennes en tête (déjà dans l'ordre de construction pour la plupart).
  for (const key of Object.keys(sections)) {
    sections[key].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
  }

  masquees.sort((a, b) => new Date(b.masquageAction.created_at) - new Date(a.masquageAction.created_at));

  return {
    sections,
    masquees,
    compteurs: {
      maintenant: sections.maintenant.length,
      aujourdhui: sections.aujourdhui.length,
      a_planifier: sections.a_planifier.length,
    },
  };
}
