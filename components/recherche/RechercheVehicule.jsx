"use client";

// La barre « Retrouver une voiture », dans l'en-tête de toutes les vues.
//
// TROIS PARTIS PRIS D'INTERFACE
//
// 1. **Elle est visible, pas cachée derrière un raccourci.** Un garagiste qui
//    découvre Nexora ne connaît aucun raccourci clavier. Ctrl/⌘+K existe pour
//    qui le veut, mais le champ se voit et se clique.
//
// 2. **Chaque résultat dit ce qui a été reconnu** — « plaque », « client »,
//    « téléphone » — et **où en est la voiture**. Une liste de résultats qui
//    ne montre que des noms oblige à ouvrir pour savoir : autant de temps
//    perdu que la recherche vient d'économiser.
//
// 3. **Le clavier suffit** : flèches, Entrée, Échap. Les mains sont souvent
//    occupées ; le premier résultat est présélectionné.

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, CornerDownLeft } from "lucide-react";
import { ACCENT, ACCENT_SOFT } from "../garage-os/tokens";
import { libelleCorrespondance, libelleVehicule, rechercherVehicules } from "./recherche";

const TON_QUI_AGIT = {
  garage: { fond: "#FEF3E2", texte: "#B45309", mot: "À vous" },
  client: { fond: "#EAF1FE", texte: "#1E40AF", mot: "Au client" },
  personne: { fond: "#F1F5F9", texte: "#475569", mot: "Rien à faire" },
};

export default function RechercheVehicule({ vehicules = [], clients = [], filPourVehicule, onOuvrirVehicule }) {
  const [terme, setTerme] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(0);
  const champRef = useRef(null);
  const conteneurRef = useRef(null);

  const resultats = useMemo(
    () => rechercherVehicules({ terme, vehicules, clients }),
    [terme, vehicules, clients],
  );

  useEffect(() => setSurligne(0), [terme]);

  useEffect(() => {
    function surRaccourci(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        champRef.current?.focus();
        setOuvert(true);
      }
    }
    function surClicExterieur(e) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target)) setOuvert(false);
    }
    document.addEventListener("keydown", surRaccourci);
    document.addEventListener("mousedown", surClicExterieur);
    return () => {
      document.removeEventListener("keydown", surRaccourci);
      document.removeEventListener("mousedown", surClicExterieur);
    };
  }, []);

  function choisir(resultat) {
    if (!resultat) return;
    onOuvrirVehicule?.(resultat.vehicule.id);
    setTerme("");
    setOuvert(false);
    champRef.current?.blur();
  }

  function surTouche(e) {
    if (e.key === "Escape") { setOuvert(false); champRef.current?.blur(); return; }
    if (!resultats.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSurligne((i) => (i + 1) % resultats.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSurligne((i) => (i - 1 + resultats.length) % resultats.length); }
    if (e.key === "Enter") { e.preventDefault(); choisir(resultats[surligne]); }
  }

  const afficheListe = ouvert && terme.trim().length >= 2;

  return (
    <div ref={conteneurRef} className="relative w-full sm:w-[340px] lg:w-[420px]">
      <div
        className="flex items-center gap-2.5 rounded-xl border bg-white px-3 h-11 transition-colors"
        style={{ borderColor: ouvert ? ACCENT : "#E2E8F0" }}
      >
        <Search size={17} className="shrink-0 text-slate-400" />
        <input
          ref={champRef}
          value={terme}
          onChange={(e) => { setTerme(e.target.value); setOuvert(true); }}
          onFocus={() => setOuvert(true)}
          onKeyDown={surTouche}
          placeholder="Plaque, client, téléphone…"
          aria-label="Rechercher une voiture par plaque, client ou téléphone"
          className="w-full bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
        />
        {terme ? (
          <button
            type="button"
            onClick={() => { setTerme(""); champRef.current?.focus(); }}
            aria-label="Effacer la recherche"
            className="shrink-0 w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
          >
            <X size={15} />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex shrink-0 items-center rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
            ⌘K
          </kbd>
        )}
      </div>

      {afficheListe && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {resultats.length === 0 ? (
            // Un écran vide qui explique ce qu'il accepte vaut mieux qu'un
            // « aucun résultat » sec : souvent, on cherchait juste autrement.
            <div className="px-4 py-5 text-center">
              <div className="text-[13.5px] font-medium text-slate-700">Aucune voiture trouvée</div>
              <div className="text-[12.5px] text-slate-500 mt-1">
                Essayez une plaque (AB-123-CD), un nom de client ou un numéro de téléphone.
              </div>
            </div>
          ) : (
            <ul role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto py-1.5">
              {resultats.map((r, i) => {
                const fil = filPourVehicule?.(r.vehicule.id) || null;
                const ton = TON_QUI_AGIT[fil?.quiAgit] || TON_QUI_AGIT.personne;
                return (
                  <li key={r.vehicule.id} role="option" aria-selected={i === surligne}>
                    <button
                      type="button"
                      onMouseEnter={() => setSurligne(i)}
                      onClick={() => choisir(r)}
                      className="w-full text-left px-3.5 py-3 flex items-start gap-3 transition-colors"
                      style={{ backgroundColor: i === surligne ? ACCENT_SOFT : "transparent" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-slate-900 truncate">
                            {libelleVehicule(r.vehicule)}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {libelleCorrespondance(r.champ)}
                          </span>
                        </div>
                        <div className="text-[12.5px] text-slate-600 truncate mt-0.5">
                          {r.client?.nom || "Client non renseigné"}
                        </div>
                        {fil && (
                          <div className="text-[12.5px] text-slate-500 truncate mt-1">{fil.etat}</div>
                        )}
                      </div>
                      {fil && (
                        <span
                          className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap"
                          style={{ backgroundColor: ton.fond, color: ton.texte }}
                        >
                          {ton.mot}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {resultats.length > 0 && (
            /* Sur téléphone il n'y a pas de clavier physique : cette aide
               n'apprendrait rien et prendrait une ligne utile. */
            <div className="hidden sm:flex border-t border-slate-100 px-3.5 py-2 items-center gap-1.5 text-[11.5px] text-slate-400">
              <CornerDownLeft size={12} /> Entrée pour ouvrir le dossier · ↑↓ pour naviguer
            </div>
          )}
        </div>
      )}
    </div>
  );
}
