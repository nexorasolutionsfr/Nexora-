"use client";

import { CalendarClock, ReceiptText, RotateCcw, ClipboardList, ChevronRight } from "lucide-react";
import { ACCENT } from "./tokens";

// "Nexora a repéré ou préparé" — reprend les compteurs déjà calculés par le
// Cockpit Opportunités (mode actif) ou, à défaut, les compteurs déjà
// disponibles côté Aujourd'hui (mode historique). Aucune donnée n'est
// recalculée ici : uniquement des compteurs honnêtes, jamais estimés.
// N'affiche que les catégories strictement positives — une catégorie à 0
// n'est pas une information utile ici, contrairement à "—" qui signale une
// valeur réellement non calculable dans ce mode.
function Puce({ icon: Icon, label, value, onClick }) {
  if (!value) return null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-left shrink-0"
    >
      <Icon size={15} color={ACCENT} />
      <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{value}</span>
      <span className="text-[12px] text-slate-500 whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function NexoraARepere({ actif, cockpitCompteurs, propositionsCount, devisEnAttenteCount, travauxEchusCount, setView }) {
  const parCategorie = cockpitCompteurs?.parCategorie || {};

  const propositions = actif ? (cockpitCompteurs ? parCategorie.proposition || 0 : null) : propositionsCount;
  const devis = actif ? (cockpitCompteurs ? parCategorie.devis || 0 : null) : devisEnAttenteCount;
  const travaux = actif ? (cockpitCompteurs ? parCategorie.travail_differe || 0 : null) : travauxEchusCount;
  const inspections = actif ? (cockpitCompteurs ? parCategorie.inspection || 0 : null) : null;

  const rienARepere = [propositions, devis, travaux, inspections].every((v) => !v);
  if (rienARepere) return null;

  return (
    <div className="space-y-2">
      <div className="px-1 text-[12.5px] font-semibold text-slate-700">Nexora a repéré</div>
      <div className="flex flex-wrap gap-2">
        <Puce icon={CalendarClock} label={propositions === 1 ? "créneau à valider" : "créneaux à valider"} value={propositions} onClick={() => setView("valider")} />
        <Puce icon={ReceiptText} label="devis en attente" value={devis} onClick={() => setView("devis")} />
        <Puce icon={RotateCcw} label={travaux === 1 ? "travail différé à échéance" : "travaux différés à échéance"} value={travaux} onClick={() => setView("clients")} />
        <Puce icon={ClipboardList} label={inspections === 1 ? "inspection en attente" : "inspections en attente"} value={inspections} onClick={() => setView("inspections")} />
        {actif && (
          <button onClick={() => document.getElementById("garage-os-centre-decisionnel")?.scrollIntoView({ behavior: "smooth" })} className="flex items-center gap-1 px-3 py-2.5 text-[12.5px] font-medium shrink-0" style={{ color: ACCENT }}>
            Voir le Cockpit complet <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
