"use client";

import { useEffect, useRef } from "react";
import { X, Car, Phone, Mail, Wrench, ReceiptText, CalendarClock, ClipboardList, ArrowRight, AlertTriangle } from "lucide-react";
import { ACCENT, ACCENT_SOFT, NAVY } from "../garage-os/tokens";
import { construireDossierVehicule } from "./calculs";
import {
  STATUT_GLOBAL_LABEL,
  STATUT_GLOBAL_TONE,
  DEVIS_STATUT_LABEL,
  DEVIS_STATUT_TONE,
  FACTURE_STATUT_LABEL,
  FACTURE_STATUT_TONE,
  EVENEMENT_TYPE_LABEL,
} from "./vehicleCaseFileConstants";

const BADGE_TONES = {
  amber: { bg: "#FEF3E2", text: "#B45309" },
  green: { bg: "#E7F6EC", text: "#15803D" },
  slate: { bg: "#F1F5F9", text: "#475569" },
  red: { bg: "#FDECEC", text: "#B91C1C" },
};

function Badge({ children, tone = "slate" }) {
  const t = BADGE_TONES[tone] || BADGE_TONES.slate;
  return (
    <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-block" style={{ backgroundColor: t.bg, color: t.text }}>
      {children}
    </span>
  );
}

function formatDateHeure(valeur) {
  if (!valeur) return "";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function EvenementIcone({ type }) {
  if (type === "devis") return <ReceiptText size={15} color={ACCENT} />;
  if (type === "facture") return <ReceiptText size={15} color={ACCENT} />;
  return <CalendarClock size={15} color={ACCENT} />;
}

/**
 * Dossier Véhicule 360 — vue latérale (drawer) affichant, pour un véhicule
 * donné, l'état courant et l'historique déjà connus de Nexora : rendez-vous,
 * étape atelier, devis et factures. N'effectue aucune requête réseau : toutes
 * les données lui sont transmises déjà chargées par le dashboard.
 */
export default function VehicleCaseFileView({
  vehicule,
  client,
  rendezVous = [],
  devis = [],
  factures = [],
  workshopStages = [],
  onClose,
  onOuvrirAtelier,
  onOuvrirDevis,
  onOuvrirFactures,
  onOuvrirAgenda,
  onOuvrirInspections,
  onOuvrirRendezVous,
  inspectionsDisponibles = false,
}) {
  const fermerRef = useRef(null);

  useEffect(() => {
    fermerRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!vehicule) return null;

  const dossier = construireDossierVehicule({ vehicule, client, rendezVous, devis, factures });
  const etapeAtelierLabel = dossier.etapeAtelier
    ? workshopStages.find((s) => s.key === dossier.etapeAtelier.statut_atelier)?.label || dossier.etapeAtelier.statut_atelier
    : null;
  const etapeAtelierCouleur = dossier.etapeAtelier
    ? workshopStages.find((s) => s.key === dossier.etapeAtelier.statut_atelier)?.color || NAVY
    : null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`Dossier véhicule ${vehicule.immatriculation || ""}`}>
      <button
        type="button"
        aria-label="Fermer le dossier véhicule"
        onClick={onClose}
        className="flex-1 bg-slate-900/40 cursor-default"
      />
      <div className="w-full sm:max-w-[560px] h-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
              <Car size={19} color={ACCENT} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900 truncate">
                {vehicule.marque || vehicule.modele ? `${vehicule.marque || ""} ${vehicule.modele || ""}`.trim() : "Véhicule"}
                {vehicule.annee ? ` (${vehicule.annee})` : ""}
              </div>
              <div className="text-[13px] text-slate-500 truncate">{vehicule.immatriculation || "Immatriculation non renseignée"}</div>
            </div>
          </div>
          <button
            ref={fermerRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {dossier.donneesIncompletes.incomplet && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-amber-800">
                Fiche incomplète — {[...dossier.donneesIncompletes.champsManquantsVehicule, ...dossier.donneesIncompletes.champsManquantsClient].join(", ")} à compléter depuis la fiche client.
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[13px] font-medium text-slate-500">Client</div>
              <Badge tone={STATUT_GLOBAL_TONE[dossier.statutGlobal.cle] || "slate"}>
                {dossier.statutGlobal.cle === "atelier" ? etapeAtelierLabel : STATUT_GLOBAL_LABEL[dossier.statutGlobal.cle]}
              </Badge>
            </div>
            <div className="text-sm font-semibold text-slate-900 mt-1">{client?.nom || "Client non renseigné"}</div>
            {(client?.telephone || client?.email) && (
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {client?.telephone && (
                  <a href={`tel:${client.telephone.replace(/\s/g, "")}`} className="text-[12.5px] text-slate-600 flex items-center gap-1.5">
                    <Phone size={13} className="text-slate-400" /> {client.telephone}
                  </a>
                )}
                {client?.email && (
                  <a href={`mailto:${client.email}`} className="text-[12.5px] text-slate-600 flex items-center gap-1.5">
                    <Mail size={13} className="text-slate-400" /> {client.email}
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: NAVY }}>
            <div className="text-[12px] uppercase tracking-wide text-white/60">Prochaine action</div>
            <div className="text-[15px] font-semibold mt-1">{dossier.prochaineAction.label}</div>
            {dossier.prochaineAction.cible && (
              <button
                type="button"
                onClick={() => {
                  if (dossier.prochaineAction.cible === "atelier") onOuvrirAtelier?.();
                  if (dossier.prochaineAction.cible === "devis") onOuvrirDevis?.();
                  if (dossier.prochaineAction.cible === "agenda") onOuvrirAgenda?.();
                  if (dossier.prochaineAction.cible === "factures") onOuvrirFactures?.();
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-xl px-3 py-2"
                style={{ backgroundColor: ACCENT }}
              >
                Ouvrir <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onOuvrirRendezVous?.(dossier.prochainRendezVous || dossier.dernierRendezVous)}
              disabled={!dossier.prochainRendezVous && !dossier.dernierRendezVous}
              className="text-left bg-white rounded-2xl border border-slate-200 p-3.5 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="text-[12px] text-slate-500">{dossier.prochainRendezVous ? "Prochain rendez-vous" : "Dernier rendez-vous"}</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">
                {dossier.prochainRendezVous ? formatDateHeure(dossier.prochainRendezVous.date_debut) : dossier.dernierRendezVous ? formatDateHeure(dossier.dernierRendezVous.date_debut) : "Aucun rendez-vous"}
              </div>
            </button>

            <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
              <div className="text-[12px] text-slate-500 flex items-center gap-1.5"><Wrench size={12} /> Étape atelier</div>
              <div className="text-sm font-semibold mt-1" style={{ color: dossier.etapeAtelier ? etapeAtelierCouleur : "#94A3B8" }}>
                {dossier.etapeAtelier ? etapeAtelierLabel : "Aucun suivi atelier"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOuvrirDevis?.()}
              disabled={!dossier.aDevis}
              className="text-left bg-white rounded-2xl border border-slate-200 p-3.5 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="text-[12px] text-slate-500">Devis</div>
              {dossier.aDevis ? (
                <div className="mt-1">
                  <Badge tone={DEVIS_STATUT_TONE[devis[0]?.statut] || "slate"}>
                    {dossier.devisEnAttente ? DEVIS_STATUT_LABEL.en_attente : DEVIS_STATUT_LABEL[trierDernierStatut(devis)] || "Devis"}
                  </Badge>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-400 mt-1">Aucun devis</div>
              )}
            </button>

            <button
              type="button"
              onClick={() => onOuvrirFactures?.()}
              disabled={!dossier.aFacture}
              className="text-left bg-white rounded-2xl border border-slate-200 p-3.5 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="text-[12px] text-slate-500">Facture</div>
              {dossier.aFacture ? (
                <div className="mt-1">
                  <Badge tone={dossier.factureEnAttente ? FACTURE_STATUT_TONE.en_attente : FACTURE_STATUT_TONE.payee}>
                    {dossier.factureEnAttente ? FACTURE_STATUT_LABEL.en_attente : FACTURE_STATUT_LABEL.payee}
                  </Badge>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-400 mt-1">Aucune facture</div>
              )}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-900">Chronologie</div>
              {inspectionsDisponibles && (
                <button type="button" onClick={() => onOuvrirInspections?.()} className="text-[12px] font-medium flex items-center gap-1" style={{ color: ACCENT }}>
                  <ClipboardList size={13} /> Onglet Inspections
                </button>
              )}
            </div>
            {dossier.chronologie.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">
                Aucun événement enregistré pour ce véhicule pour l'instant.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {dossier.chronologie.map((evenement, index) => (
                  <div key={`${evenement.type}-${evenement.id || index}`} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
                      <EvenementIcone type={evenement.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">{evenement.titre || EVENEMENT_TYPE_LABEL[evenement.type]}</div>
                      <div className="text-[12px] text-slate-500">{formatDateHeure(evenement.date)}</div>
                    </div>
                    {evenement.statut && (
                      <Badge tone={toneEvenement(evenement)}>{libelleEvenement(evenement)}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function trierDernierStatut(devis) {
  if (!devis.length) return null;
  return [...devis].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.statut;
}

function toneEvenement(evenement) {
  if (evenement.type === "devis") return DEVIS_STATUT_TONE[evenement.statut] || "slate";
  if (evenement.type === "facture") return FACTURE_STATUT_TONE[evenement.statut] || "slate";
  return "slate";
}

function libelleEvenement(evenement) {
  if (evenement.type === "devis") return DEVIS_STATUT_LABEL[evenement.statut] || evenement.statut;
  if (evenement.type === "facture") return FACTURE_STATUT_LABEL[evenement.statut] || evenement.statut;
  return evenement.statut;
}
