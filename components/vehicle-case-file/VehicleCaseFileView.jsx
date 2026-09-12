"use client";

import { useEffect, useRef, useState } from "react";
import { X, Car, Phone, Mail, ArrowRight, AlertTriangle, ChevronDown } from "lucide-react";
import { ACCENT, ACCENT_SOFT, NAVY } from "../garage-os/tokens";
import { construireDossierVehicule } from "./calculs";
import { libelleQuiAgit } from "../atelier/filVehicule";
import {
  DEVIS_STATUT_LABEL,
  DEVIS_STATUT_TONE,
  FACTURE_STATUT_LABEL,
  FACTURE_STATUT_TONE,
} from "./vehicleCaseFileConstants";

// « Ouvrir » ne dit pas quoi. Chaque destination a son libellé.
const LIBELLE_ACTION = {
  atelier: "Ouvrir la fiche atelier",
  devis: "Ouvrir le devis",
  agenda: "Voir le rendez-vous",
  factures: "Ouvrir la facture",
  ordres_reparation: "Ouvrir la fiche atelier",
};

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
  ordresReparation = [],
  factures = [],
  workshopStages = [],
  onClose,
  onOuvrirAtelier,
  onOuvrirDevis,
  onOuvrirFactures,
  onOuvrirAgenda,
  onOuvrirInspections,
  onOuvrirRendezVous,
  onOuvrirOrdresReparation,
  inspectionsDisponibles = false,
}) {
  const fermerRef = useRef(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  useEffect(() => {
    fermerRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!vehicule) return null;

  const dossier = construireDossierVehicule({ vehicule, client, rendezVous, devis, ordresReparation, factures });
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
              <Badge tone={dossier.fil.contradiction ? "amber" : "slate"}>{dossier.fil.etat}</Badge>
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

          {/* LE POIDS VISUEL SUIT L'URGENCE
              Un bloc noir qui annonce « rien à faire » crie pour ne rien dire,
              et on finit par ne plus le lire quand il compte. Trois tons donc :
              sombre quand le garage doit agir, bleu clair quand la balle est
              chez le client, gris quand le dossier est clos — et dans ce
              dernier cas, pas de bouton d'action : il n'y a pas d'action. */}
          {(() => {
            const aAgir = dossier.fil.quiAgit === "garage";
            const attenteClient = dossier.fil.quiAgit === "client";
            const style = aAgir
              ? { backgroundColor: NAVY, texte: "#FFFFFF", secondaire: "rgba(255,255,255,0.72)", etiquette: "rgba(255,255,255,0.6)" }
              : attenteClient
                ? { backgroundColor: "#EAF1FE", texte: "#14306B", secondaire: "#41599B", etiquette: "#5B76B7" }
                : { backgroundColor: "#F1F5F9", texte: "#334155", secondaire: "#64748B", etiquette: "#94A3B8" };
            return (
              <div className="rounded-2xl p-4" style={{ backgroundColor: style.backgroundColor }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: style.etiquette }}>
                  {aAgir ? "À faire maintenant" : attenteClient ? "En attente du client" : "Rien à faire"}
                </div>
                <div className="text-[15px] font-semibold mt-1.5 leading-snug" style={{ color: style.texte }}>
                  {dossier.prochaineAction.label}
                </div>
                {/* Qui doit agir : sans cette ligne, « le client doit répondre » et
                    « relisez le message » se lisent pareil, alors que l'un demande
                    d'attendre et l'autre d'agir. */}
                <div className="text-[12.5px] mt-1" style={{ color: style.secondaire }}>
                  {libelleQuiAgit(dossier.fil.quiAgit)}
                </div>
                {/* La contradiction se signale sans remplacer l'action : d'abord
                    comprendre, puis agir. */}
                {dossier.fil.avertissement && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[12px] text-amber-800">{dossier.fil.avertissement}</div>
                  </div>
                )}
                {dossier.prochaineAction.cible && dossier.fil.quiAgit !== "personne" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (dossier.prochaineAction.cible === "atelier") onOuvrirAtelier?.();
                      if (dossier.prochaineAction.cible === "devis") onOuvrirDevis?.();
                      if (dossier.prochaineAction.cible === "agenda") onOuvrirAgenda?.();
                      if (dossier.prochaineAction.cible === "factures") onOuvrirFactures?.();
                      if (dossier.prochaineAction.cible === "ordres_reparation") onOuvrirOrdresReparation?.(vehicule?.id);
                    }}
                    className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-xl px-3.5 h-10 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {LIBELLE_ACTION[dossier.prochaineAction.cible] || "Ouvrir"} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            );
          })()}

          {/* LES ÉTATS, CÔTE À CÔTE ET SANS RELIEF
              Quatre cartes bombées de même poids donnaient quatre fois la même
              importance à quatre choses inégales, et poussaient l'historique
              hors de l'écran. Une ligne d'étiquettes suffit à répondre à
              « où en est le devis, la facture, l'atelier » — et les états
              restent distincts, jamais fondus en un seul. */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Intervention en cours
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <LigneEtat
                libelle="Atelier"
                valeur={dossier.etapeAtelier ? etapeAtelierLabel : "Aucun suivi"}
                couleur={dossier.etapeAtelier ? etapeAtelierCouleur : "#94A3B8"}
              />
              <LigneEtat
                libelle="Devis"
                valeur={dossier.aDevis ? (DEVIS_STATUT_LABEL[trierDernierStatut(devis)] || "Devis") : "Aucun devis"}
                tone={dossier.aDevis ? DEVIS_STATUT_TONE[trierDernierStatut(devis)] : null}
                onClick={dossier.aDevis ? () => onOuvrirDevis?.() : null}
              />
              <LigneEtat
                libelle="Fiche atelier (OR)"
                valeur={dossier.intervention.ordre ? (dossier.intervention.ordre.statut === "termine" ? "Travaux terminés" : "Ouverte") : "Aucune"}
                tone={dossier.intervention.ordre ? (dossier.intervention.ordre.statut === "termine" ? "green" : "amber") : null}
                onClick={onOuvrirOrdresReparation ? () => onOuvrirOrdresReparation(vehicule.id) : null}
              />
              <LigneEtat
                libelle="Facture"
                valeur={dossier.aFacture ? (dossier.factureEnAttente ? FACTURE_STATUT_LABEL.en_attente : FACTURE_STATUT_LABEL.payee) : "Aucune facture"}
                tone={dossier.aFacture ? (dossier.factureEnAttente ? FACTURE_STATUT_TONE.en_attente : FACTURE_STATUT_TONE.payee) : null}
                onClick={dossier.aFacture ? () => onOuvrirFactures?.() : null}
              />
              {inspectionsDisponibles && (
                <LigneEtat
                  libelle="Contrôle véhicule"
                  valeur="Consulter"
                  onClick={() => onOuvrirInspections?.()}
                />
              )}
              <LigneEtat
                libelle={dossier.prochainRendezVous ? "Prochain rendez-vous" : "Dernier rendez-vous"}
                valeur={
                  dossier.prochainRendezVous
                    ? formatDateHeure(dossier.prochainRendezVous.date_debut)
                    : dossier.dernierRendezVous
                      ? formatDateHeure(dossier.dernierRendezVous.date_debut)
                      : "Aucun rendez-vous"
                }
                onClick={
                  dossier.prochainRendezVous || dossier.dernierRendezVous
                    ? () => onOuvrirRendezVous?.(dossier.prochainRendezVous || dossier.dernierRendezVous)
                    : null
                }
              />
            </div>
          </div>

          {/* La chronologie plate a été retirée le 13 septembre 2026 : sur un
              véhicule suivi depuis quatre visites, elle alignait onze
              événements — quatre prestations, quatre devis, trois factures —
              sans dire à quelle visite chacun appartenait. L'historique groupé
              ci-dessous raconte la même chose en trois lignes lisibles.
              `construireDossierVehicule` continue de produire `chronologie` :
              elle servira aux événements de l'intervention en cours, quand les
              gestes seront réalisables ici. */}
          {/* L'HISTORIQUE SE REPLIE
              Une voiture suivie depuis deux ans a vingt visites. Dépliées, elles
              noient l'intervention du jour ; masquées, on ne sait plus qu'elles
              existent. Un compte visible et un dépli : on choisit de regarder. */}
          {dossier.interventionsPrecedentes.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoriqueOuvert((v) => !v)}
                aria-expanded={historiqueOuvert}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="text-[13px] font-semibold text-slate-900">
                  Interventions précédentes
                  <span className="ml-2 text-[12px] font-normal text-slate-500">
                    {dossier.interventionsPrecedentes.length}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className="text-slate-400 transition-transform"
                  style={{ transform: historiqueOuvert ? "rotate(180deg)" : "none" }}
                />
              </button>
              {historiqueOuvert && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {dossier.interventionsPrecedentes.map(({ rdv, ordre, facture }) => (
                    <div key={rdv.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] text-slate-800">{formatDateHeure(rdv.date_debut)}</div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {[
                            ordre ? (ordre.statut === "termine" ? "travaux terminés" : "fiche atelier ouverte") : null,
                            facture ? (facture.statut === "payee" ? "facture payée" : "facture à régler") : null,
                          ].filter(Boolean).join(" · ") || "aucun document"}
                        </div>
                      </div>
                      {facture?.montant_ttc != null && (
                        <span className="text-[13px] font-medium text-slate-700 tabular-nums shrink-0">
                          {Number(facture.montant_ttc).toFixed(2).replace(".", ",")} €
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Une ligne d'état : le libellé à gauche, la valeur à droite. Cliquable
 *  seulement quand il y a quelque chose à ouvrir — un bouton mort se remarque. */
function LigneEtat({ libelle, valeur, tone = null, couleur = null, onClick = null }) {
  const contenu = (
    <>
      <span className="text-[13px] text-slate-500">{libelle}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        {tone ? (
          <Badge tone={tone}>{valeur}</Badge>
        ) : (
          <span className="text-[13.5px] font-medium truncate" style={{ color: couleur || "#0F172A" }}>{valeur}</span>
        )}
        {onClick && <ArrowRight size={13} className="text-slate-300 shrink-0" />}
      </span>
    </>
  );
  if (!onClick) {
    return <div className="px-4 py-3 flex items-center justify-between gap-3">{contenu}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
    >
      {contenu}
    </button>
  );
}

function trierDernierStatut(devis) {
  if (!devis.length) return null;
  return [...devis].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.statut;
}


