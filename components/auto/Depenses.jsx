"use client";

// Dépenses d'une voiture, à partir des montants saisis dans son historique.
// Le bloc dit toujours d'où viennent les chiffres et ce qui manque.

import { Receipt } from "lucide-react";

import { resumerDepenses } from "@/lib/auto/depenses";
import { aide, carte } from "@/components/auto/elements";
import { TYPES_INTERVENTION, formaterDate, formaterEuros, libelleDe } from "@/components/auto/format";

const euros = (centimes) => formaterEuros(centimes / 100);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export default function BlocDepenses({ historique }) {
  const r = resumerDepenses(historique);

  return (
    <section className={carte} aria-labelledby="titre-depenses">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="titre-depenses" className="font-semibold text-foreground">
            Dépenses
          </h3>
          {r.nombreAvecMontant === 0 ? (
            <>
              <p className="mt-1 text-[15px] leading-snug text-foreground">Aucun montant enregistré pour l'instant.</p>
              <p className={aide}>Indiquez le montant de vos interventions dans l'historique : Nexora en fera le total.</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-xl font-semibold text-foreground">
                {euros(r.douzeMoisCentimes)}
                <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">sur les 12 derniers mois</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {euros(r.totalCentimes)} depuis le {formaterDate(r.depuis)}
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ul className="space-y-1 text-sm" aria-label="Par année">
                  {r.parAnnee.slice(0, 4).map((a) => (
                    <li key={a.annee} className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground">
                        {a.annee} <span className="text-muted-foreground">· {pluriel(a.nombre, "intervention")}</span>
                      </span>
                      <span className="font-medium tabular-nums text-foreground">{euros(a.totalCentimes)}</span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1 text-sm" aria-label="Par type">
                  {r.parType.slice(0, 4).map((t) => (
                    <li key={t.type} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-foreground">{libelleDe(TYPES_INTERVENTION, t.type)}</span>
                      <span className="font-medium tabular-nums text-foreground">{euros(t.totalCentimes)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className={aide}>
                Calculées à partir des montants que vous avez saisis.
                {r.nombreSansMontant === 1 ? " 1 intervention sans montant n'est pas comptée." : ""}
                {r.nombreSansMontant > 1 ? ` ${r.nombreSansMontant} interventions sans montant ne sont pas comptées.` : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
