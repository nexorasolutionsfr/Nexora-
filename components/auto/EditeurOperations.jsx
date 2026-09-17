"use client";

// Les opérations d'une facture : libellé et type de chacune. Une facture reste
// UNE intervention et UN montant total, quel que soit le nombre d'opérations.
// Sert à la vérification d'une facture et à la correction d'une intervention.

import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { aide, boutonLien, champ, etiquette } from "@/components/auto/elements";
import { TYPES_INTERVENTION } from "@/components/auto/format";

export default function EditeurOperations({ operations, surligne = false, nonLue = false, onChange }) {
  const changer = (i, champs) => onChange(operations.map((o, j) => (j === i ? { ...o, ...champs } : o)));
  return (
    <fieldset className={cn("min-w-0", surligne ? "rounded-xl bg-amber-50 p-2 ring-2 ring-amber-300" : "")}>
      <legend className={cn(etiquette, "flex flex-wrap items-center gap-x-2")}>
        Opérations <span className="font-normal text-muted-foreground">(facultatif)</span>
        {surligne ? <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">À vérifier</span> : null}
      </legend>
      <div className="space-y-2">
        {operations.map((o, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-2.5">
            <input aria-label={`Libellé de l'opération ${i + 1}`} value={o.libelle} maxLength={120} onChange={(e) => changer(i, { libelle: e.target.value })} className={champ} placeholder="Plaquettes avant, vidange…" />
            <div className="flex items-center gap-2">
              <select aria-label={`Type de l'opération ${i + 1}`} value={o.type} onChange={(e) => changer(i, { type: e.target.value })} className={cn(champ, "min-w-0 flex-1 appearance-none py-2.5 text-sm")}>
                {TYPES_INTERVENTION.map((t) => (
                  <option key={t.valeur} value={t.valeur}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => onChange(operations.filter((_, j) => j !== i))} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-destructive" aria-label={`Retirer l'opération ${i + 1}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {nonLue && operations.length === 0 ? <p className={aide}>Aucune opération lue sur la facture.</p> : null}
      <button type="button" onClick={() => onChange([...operations, { type: "autre", libelle: "" }])} className={`${boutonLien} -ml-2 mt-1`}>
        <Plus className="size-4" aria-hidden="true" />
        Ajouter une opération
      </button>
    </fieldset>
  );
}
