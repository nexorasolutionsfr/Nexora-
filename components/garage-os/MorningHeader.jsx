"use client";

import { saluationHoraire, dateLongueFR } from "./calculs";
import { NAVY } from "./tokens";

export default function MorningHeader({ garageData, openState }) {
  const salutation = saluationHoraire();
  const date = dateLongueFR();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 md:px-6 md:py-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[19px] md:text-[21px] font-bold tracking-tight" style={{ color: NAVY }}>
            {salutation}, {garageData?.nom_garage || "votre garage"}
          </div>
          <div className="text-[13px] text-slate-500 mt-0.5 capitalize">{date}</div>
        </div>
        {openState && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap"
            style={{
              backgroundColor: openState.open ? "#E7F6EC" : "#F1F5F9",
              color: openState.open ? "#15803D" : "#475569",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: openState.open ? "#16A34A" : "#94A3B8" }} />
            {openState.label}
          </span>
        )}
      </div>
    </div>
  );
}
