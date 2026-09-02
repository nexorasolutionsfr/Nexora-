"use client";

import { Calendar, Wrench, Inbox, ReceiptText, ClipboardList } from "lucide-react";
import { NAVY, ACCENT_SOFT, ACCENT } from "./tokens";

// Navigation pure vers les écrans existants — aucune écriture, aucun envoi,
// aucune donnée créée au clic.
function Raccourci({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[110px] flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-shadow"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: ACCENT_SOFT }}>
        <Icon size={16} color={ACCENT} />
      </div>
      <span className="text-[12px] font-semibold" style={{ color: NAVY }}>{label}</span>
    </button>
  );
}

export default function AccesRapides({ setView, inspectionsActif = false }) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-[12.5px] font-semibold text-slate-700">Accès rapides</div>
      <div className="flex flex-wrap gap-2.5">
        <Raccourci icon={Calendar} label="Agenda" onClick={() => setView("agenda")} />
        <Raccourci icon={Wrench} label="Atelier" onClick={() => setView("atelier")} />
        <Raccourci icon={Inbox} label="Demandes" onClick={() => setView("demandes")} />
        <Raccourci icon={ReceiptText} label="Devis / Facturation" onClick={() => setView("devis")} />
        {inspectionsActif && <Raccourci icon={ClipboardList} label="Inspection" onClick={() => setView("inspections")} />}
      </div>
    </div>
  );
}
