"use client";

import { useState } from "react";
import { ArrowRight, Check, Rocket } from "lucide-react";
import { GROUPE_UTILISER, etatMiseEnRoute, groupesRestants } from "./miseEnRoute";
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
 * DEUX GROUPES, ET CE N'EST PAS DÉCORATIF (revue du 12 septembre 2026)
 *
 * Les cinq étapes étaient à plat : « Votre premier client », « Votre premier
 * devis », « Vos horaires », « Votre équipe », « Votre premier rendez-vous ».
 * Un garagiste y lisait cinq corvées de même poids, dont deux de paramétrage —
 * et le paramétrage ne lui fait rien gagner. Les trois qui mènent à une
 * facture passent devant, avec un bouton qui nomme le geste ; la configuration
 * suit, plus discrète.
 *
 * La liste disparaît d'elle-même dès qu'il n'y a plus rien à proposer — voir
 * miseEnRoute.js. Un garage installé ne la voit jamais.
 */
export default function MiseEnRoute({ garageData, mecaniciens, clients, rendezVous, devis = [], role = null, onAller }) {
  const [passees, setPassees] = useState(lirePassees);
  // `role` : une étape qui mène à un écran refusé n'est pas proposée (voir
  // miseEnRoute.js). Les droits ne sont pas élargis, seulement respectés.
  const etat = etatMiseEnRoute({ garageData, mecaniciens, clients, rendezVous, devis, role }, passees);

  if (!etat.visible) return null;

  const passer = (cle) => {
    const suite = [...new Set([...passees, cle])];
    setPassees(suite);
    ecrirePassees(suite);
  };

  const groupes = groupesRestants(etat.restantes);

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

      {groupes.map((groupe) => {
        const metier = groupe.cle === GROUPE_UTILISER;
        return (
          <div key={groupe.cle} className="border-t border-slate-100">
            <div className="px-5 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              {groupe.titre}
            </div>
            <div className="px-2.5 pb-2">
              {groupe.etapes.map((etape) => (
                // La ligne entière reste la cible — sur un téléphone de 375 px,
                // un bouton de 110 px à l'extrémité mangeait un tiers de la
                // largeur. Le bouton nommé s'ajoute pour les étapes métier :
                // c'est là qu'il faut que le geste se lise sans réfléchir.
                //
                // `div` et non `button` : « Plus tard » vit à l'intérieur, et
                // un bouton dans un bouton n'est pas du HTML valide.
                <div
                  key={etape.cle}
                  role="button"
                  tabIndex={0}
                  aria-label={etape.action}
                  onClick={() => onAller(etape.vue, etape.onglet, etape.creation)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onAller(etape.vue, etape.onglet, etape.creation);
                    }
                  }}
                  className={`flex items-start gap-2.5 px-2.5 ${metier ? "py-3" : "py-2.5"} cursor-pointer hover:bg-slate-50/70 transition-colors rounded-xl`}
                >
                  <span className="w-[18px] h-[18px] mt-0.5 rounded-full border-2 border-slate-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`${metier ? "text-[13.5px] font-semibold" : "text-[13px] font-medium"} text-slate-900 leading-snug`}>
                      {etape.titre}
                    </div>
                    <div className="text-[12px] text-slate-500 leading-snug mt-0.5">
                      {etape.pourquoi}{" "}
                      {/* Une sortie, pas une action : trouvable, jamais
                          concurrente du geste. Et seulement sur ce qui peut
                          réellement attendre — la configuration. */}
                      {etape.reportable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            passer(etape.cle);
                          }}
                          className="text-slate-400 underline underline-offset-2 hover:text-slate-600"
                        >
                          Plus tard
                        </button>
                      )}
                    </div>
                    {metier && (
                      <span
                        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {etape.action} <ArrowRight size={13} />
                      </span>
                    )}
                  </div>
                  {!metier && <ArrowRight size={15} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {etat.faites > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[12px] text-slate-400">
          <Check size={13} className="text-emerald-600" />
          Vous retrouverez tous ces réglages dans Paramètres, onglet Mon garage.
        </div>
      )}
    </section>
  );
}
