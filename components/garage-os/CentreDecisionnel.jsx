"use client";

import { ListChecks } from "lucide-react";
import CockpitOpportunites from "../cockpit/CockpitOpportunites";
import { ACCENT_SOFT, ACCENT } from "./tokens";

// Habillage visuel du Cockpit Opportunités pour l'accueil Garage OS — aucune
// logique métier ajoutée ni modifiée. Se contente d'afficher un en-tête de
// section et de faire remonter les compteurs déjà calculés par le Cockpit
// (via deriveOpportunites) pour alimenter la Synthèse immédiate, sans
// dupliquer la moindre règle de priorisation.
export default function CentreDecisionnel({ onCompteurs, ...cockpitProps }) {
  return (
    <section id="garage-os-centre-decisionnel" className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
          <ListChecks size={16} color={ACCENT} />
        </div>
        <div>
          <div className="font-semibold text-slate-900 text-[14.5px]">À traiter maintenant</div>
          <div className="text-[12px] text-slate-500">Ce que Nexora a repéré, priorisé automatiquement à partir de vos données réelles</div>
        </div>
      </div>
      <CockpitOpportunites {...cockpitProps} onCompteurs={onCompteurs} />
    </section>
  );
}
