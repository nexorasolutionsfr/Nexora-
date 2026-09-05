"use client";

import { Calendar, Wrench, ListChecks, CircleDollarSign } from "lucide-react";
import { ACCENT_SOFT, ACCENT } from "./tokens";

// Affiche au maximum 4 indicateurs, calculés uniquement à partir de données
// déjà chargées. Une valeur null/undefined signifie "non calculable dans ce
// mode" — affichée honnêtement en "—", jamais estimée.
function Indicateur({ icon: Icon, label, value, suffix = "" }) {
  const affichage = value === null || value === undefined ? "—" : `${value.toLocaleString("fr-FR")}${suffix}`;
  return (
    <div className="flex-1 min-w-[140px] bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
        <Icon size={17} color={ACCENT} />
      </div>
      <div className="min-w-0">
        <div className="text-[19px] font-bold tabular-nums text-slate-900 leading-tight">{affichage}</div>
        <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5 text-balance">{label}</div>
      </div>
    </div>
  );
}

export default function SyntheseImmediate({ rdvAujourdhui, vehiculesEngages, decisionsEnAttente, montantRisque }) {
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <Indicateur icon={Calendar} label="Rendez-vous du jour" value={rdvAujourdhui} />
      <Indicateur icon={Wrench} label="En atelier" value={vehiculesEngages} />
      <Indicateur icon={ListChecks} label="Priorités" value={decisionsEnAttente} />
      <Indicateur icon={CircleDollarSign} label="Montant à risque" value={montantRisque} suffix=" €" />
    </div>
  );
}
