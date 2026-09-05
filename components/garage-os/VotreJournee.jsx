"use client";

import { ChevronRight, Wrench, AlertTriangle } from "lucide-react";
import { ACCENT, NAVY } from "./tokens";

const STATUT_TONE_BG = {
  Confirmé: "#E7F6EC",
  "En attente": "#FEF3E2",
  Terminé: "#F1F5F9",
  Annulé: "#FDECEC",
  Absent: "#FDECEC",
};
const STATUT_TONE_TEXT = {
  Confirmé: "#15803D",
  "En attente": "#B45309",
  Terminé: "#475569",
  Annulé: "#B91C1C",
  Absent: "#B91C1C",
};

// Aperçu compact de la journée réelle : prochains rendez-vous, progression
// atelier par étape, alertes attente client/pièce. Remplace la grille
// horaire pleine page — plus lisible sur tablette et mobile en garage.
export default function VotreJournee({ todayAppts = [], stageCounts = [], mecaniciensActifs = [], alertesAtelier = 0, onSelectAppt, setView }) {
  const alertes = alertesAtelier;
  const now = new Date();
  const prochains = todayAppts
    .filter((a) => new Date(a.date_fin || a.date_debut) >= now)
    .slice(0, 5);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-2">
        <div className="font-semibold text-slate-900 text-[15px]">Votre journée</div>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("agenda")} className="text-[12.5px] font-medium flex items-center gap-1" style={{ color: ACCENT }}>
            Agenda <ChevronRight size={13} />
          </button>
          <button onClick={() => setView("atelier")} className="text-[12.5px] font-medium flex items-center gap-1" style={{ color: ACCENT }}>
            Atelier <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {alertes > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5 text-[12.5px] font-medium" style={{ backgroundColor: "#FEF3E2", color: "#B45309" }}>
          <AlertTriangle size={14} />
          {alertes} véhicule{alertes > 1 ? "s" : ""} en attente client ou pièce
        </div>
      )}

      <div className="px-5 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Progression atelier</div>
        <div className="flex divide-x divide-slate-100 -mx-1 overflow-x-auto pb-1">
          {stageCounts.map((stage) => (
            <div key={stage.key} className="flex-1 min-w-[76px] text-center px-2">
              <div className="text-[17px] font-bold tabular-nums" style={{ color: stage.count > 0 ? stage.glanceColor : "#CBD5E1" }}>{stage.count}</div>
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400 mt-0.5 leading-tight">{stage.label}</div>
            </div>
          ))}
        </div>
        {mecaniciensActifs.length === 0 && (
          <div className="mt-2 text-[12px] text-slate-400">Ajoutez vos mécaniciens dans Paramètres pour suivre leur charge de travail.</div>
        )}
      </div>

      <div className="border-t border-slate-100">
        <div className="px-5 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Prochains rendez-vous</div>
        {prochains.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-1.5 py-7 text-slate-500">
            <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center mb-1" style={{ backgroundColor: "#F1F5F9" }}>
              <Wrench size={17} className="text-slate-400" />
            </div>
            <div className="text-[13px] font-medium text-slate-700">Rien de programmé pour l'instant</div>
          </div>
        ) : (
          <div className="px-2.5 pb-2">
            {prochains.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelectAppt(a)}
                className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap hover:bg-slate-50"
              >
                <div className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ color: NAVY }}>{a.debut}</div>
                <div className="text-[13px] font-semibold text-slate-900">{a.client}</div>
                <div className="text-[12px] text-slate-500">{a.vehicule} · {a.prestation}</div>
                <span
                  className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: STATUT_TONE_BG[a.statut] || "#F1F5F9", color: STATUT_TONE_TEXT[a.statut] || "#475569" }}
                >
                  {a.statut}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
