"use client";

// Devis multi-lignes V1 — reprise explicite des lignes d'un devis accepté
// dans un nouvel ordre de réparation (contrat I). Cochées par défaut,
// décochables une à une ; la copie est PAR VALEUR (lignesDevisVersOR), jamais
// automatique : c'est le bouton de création de l'OR qui déclenche l'insertion.

import { TYPE_LIGNE_LABEL } from "./devisLignesConstants";
import { calculerTotaux, formatEuro, trierLignes } from "./calculs";

export default function RepriseLignesDevis({ lignes = [], selection, onToggle, onToggleTout }) {
  const triees = trierLignes(lignes);
  if (triees.length === 0) return null;
  const toutesCochees = triees.every((l) => selection.has(l.id));
  const retenues = triees.filter((l) => selection.has(l.id));
  const totaux = calculerTotaux(retenues);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[12.5px] font-semibold text-slate-700">Reprendre les lignes du devis dans la fiche atelier</div>
        <button type="button" onClick={() => onToggleTout(!toutesCochees)} className="text-[12px] font-medium text-slate-500 hover:text-slate-700 min-h-[32px]">
          {toutesCochees ? "Tout décocher" : "Tout cocher"}
        </button>
      </div>
      <div className="text-[11.5px] text-slate-400 mt-0.5">Copie par valeur : la fiche atelier devient indépendante du devis. La TVA n'est pas reprise (estimation interne).</div>
      <ul className="mt-2 space-y-1.5">
        {triees.map((l) => (
          <li key={l.id}>
            <label className="flex items-start gap-2.5 min-h-[40px] cursor-pointer">
              <input type="checkbox" checked={selection.has(l.id)} onChange={() => onToggle(l.id)} className="mt-1.5 h-4 w-4 accent-blue-600" />
              <span className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1.5">{TYPE_LIGNE_LABEL[l.type] || l.type}</span>
                <span className="text-[13px] text-slate-900">{l.libelle}</span>
                <span className="block text-[12px] text-slate-500">{Number(l.quantite)} × {formatEuro(l.prix_unitaire_ht)} HT</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[12px] text-slate-500 text-right">
        {retenues.length} ligne{retenues.length > 1 ? "s" : ""} retenue{retenues.length > 1 ? "s" : ""} · {formatEuro(totaux.total_ht)} HT estimés
      </div>
    </div>
  );
}
