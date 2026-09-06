"use client";

import { useState } from "react";
import { ArrowRight, Check, Rocket } from "lucide-react";
import { etatMiseEnRoute } from "./miseEnRoute";
import { ACCENT, ACCENT_SOFT } from "./tokens";

const CLE_STOCKAGE = "nexora-mise-en-route-passees";

// Les étapes passées sont une préférence d'affichage, pas une donnée métier :
// elles n'ont rien à faire en base. Le stockage local peut être vide, refusé
// ou illisible selon le navigateur — on part alors d'une liste vide plutôt que
// de casser l'accueil pour ça.
function lirePassees() {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE);
    const valeur = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeur) ? valeur.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function ecrirePassees(cles) {
  try {
    window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(cles));
  } catch {
    // Navigation privée, stockage plein, site bloqué : l'étape ne restera pas
    // masquée au prochain chargement. C'est une gêne, pas une panne.
  }
}

/**
 * La liste de mise en route, affichée en haut de l'accueil.
 *
 * Elle disparaît d'elle-même dès qu'il n'y a plus rien à proposer — voir
 * miseEnRoute.js. Un garage installé ne la voit jamais.
 */
export default function MiseEnRoute({ garageData, mecaniciens, clients, rendezVous, onAller }) {
  const [passees, setPassees] = useState(lirePassees);
  const etat = etatMiseEnRoute({ garageData, mecaniciens, clients, rendezVous }, passees);

  if (!etat.visible) return null;

  const passer = (cle) => {
    const suite = [...new Set([...passees, cle])];
    setPassees(suite);
    ecrirePassees(suite);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
          <Rocket size={17} color={ACCENT} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 text-[14.5px]">Mettez votre garage en route</div>
          <div className="text-[12.5px] text-slate-500 mt-0.5">
            {etat.faites} sur {etat.total} de fait. Le reste prend quelques minutes.
          </div>
        </div>
        {/* La progression, en une barre : un chiffre seul ne donne pas le
            sentiment d'avancer, une barre si. */}
        <div className="hidden sm:block w-24 shrink-0 mt-2">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(etat.faites / etat.total) * 100}%`, backgroundColor: ACCENT }}
            />
          </div>
        </div>
      </div>

      <div className="px-2.5 pb-2">
        {etat.restantes.map((etape) => (
          // La ligne ENTIÈRE est la cible, pas un bouton de 110 px à son
          // extrémité : sur un téléphone de 375 px, ce bouton mangeait un
          // tiers de la largeur et faisait tenir le texte sur quatre lignes.
          // Un chevron suffit à dire que ça mène quelque part.
          //
          // `div` et non `button` : « Passer » vit à l'intérieur, et un bouton
          // dans un bouton n'est pas du HTML valide.
          <div
            key={etape.cle}
            role="button"
            tabIndex={0}
            onClick={() => onAller(etape.vue, etape.onglet)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAller(etape.vue, etape.onglet);
              }
            }}
            className="flex items-start gap-2.5 px-2.5 py-3 border-t border-slate-50 cursor-pointer hover:bg-slate-50/70 transition-colors"
          >
            <span className="w-[18px] h-[18px] mt-0.5 rounded-full border-2 border-slate-200 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-slate-900 leading-snug">{etape.titre}</div>
              <div className="text-[12px] text-slate-500 leading-snug mt-0.5">
                {etape.pourquoi}{" "}
                {/* « Passer » est une sortie : trouvable, jamais concurrente
                    de l'action. D'où le texte souligné plutôt qu'un bouton. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    passer(etape.cle);
                  }}
                  className="text-slate-400 underline underline-offset-2 hover:text-slate-600"
                >
                  Passer
                </button>
              </div>
            </div>
            <ArrowRight size={15} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
          </div>
        ))}
      </div>

      {etat.faites > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[12px] text-slate-400">
          <Check size={13} className="text-emerald-600" />
          Vous retrouverez tous ces réglages dans Paramètres, onglet Mon garage.
        </div>
      )}
    </section>
  );
}
