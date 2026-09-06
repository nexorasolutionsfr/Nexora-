"use client";

import { useEffect, useRef, useState } from "react";
import { saluationHoraire, dateLongueFR } from "./calculs";
import { resumeJournee } from "./resumeJournee";
import { ACCENT, NAVY } from "./tokens";

// L'en-tête de l'accueil : ce qu'un associé annoncerait en arrivant.
//
// CE QUI A CHANGÉ, ET POURQUOI
//
// Avant, cet en-tête disait « Bonsoir » et la date, puis quatre cartes en
// dessous affichaient « 0 · 0 · 0 · 0 € », puis trois autres annonçaient « rien
// à traiter, rien de préparé, rien à risque ». Six cents pixels — les trois
// quarts d'un écran de téléphone — pour dire qu'il ne se passe rien, avant la
// première information réelle.
//
// Les quatre compteurs étaient par ailleurs les résumés de blocs situés juste
// en dessous : « Rendez-vous du jour : 0 » redisait « Votre journée → rien de
// programmé ». On lisait deux fois la même chose, dont une fois sous forme de
// zéro.
//
// Ils tiennent maintenant sur une ligne, dans cet en-tête, sous une phrase qui
// les hiérarchise. Voir resumeJournee.js pour la règle : rien n'est estimé,
// chaque nombre vient d'un compteur affiché ailleurs à l'identique.

/** Un chiffre change : un souffle bref, remarqué au coup d'œil suivant. */
function useSouffle(valeur) {
  const [souffle, setSouffle] = useState(false);
  const precedent = useRef(valeur);
  useEffect(() => {
    if (precedent.current === valeur) return;
    precedent.current = valeur;
    setSouffle(true);
    const t = setTimeout(() => setSouffle(false), 300);
    return () => clearTimeout(t);
  }, [valeur]);
  return souffle;
}

function Compteur({ label, valeur, suffixe = "", onClick }) {
  // Une valeur non calculable dans le mode courant s'affiche « — », jamais 0 :
  // « je ne sais pas » et « il n'y en a pas » ne sont pas la même information.
  const affichage = valeur === null || valeur === undefined ? "—" : `${valeur.toLocaleString("fr-FR")}${suffixe}`;
  const souffle = useSouffle(affichage);
  const contenu = (
    <>
      <span className={`text-[15px] font-bold tabular-nums text-slate-900 inline-block origin-left${souffle ? " nx-souffle" : ""}`}>
        {affichage}
      </span>
      <span className="text-[11.5px] text-slate-500 leading-tight">{label}</span>
    </>
  );
  if (!onClick) {
    return <div className="flex flex-col gap-0.5 min-w-0 flex-1">{contenu}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="nx-pressable flex flex-col gap-0.5 min-w-0 flex-1 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-slate-50"
    >
      {contenu}
    </button>
  );
}

export default function MorningHeader({
  garageData,
  openState,
  rdvAujourdhui = 0,
  vehiculesEngages = 0,
  decisionsEnAttente = 0,
  montantRisque = 0,
  setView,
}) {
  const salutation = saluationHoraire();
  const date = dateLongueFR();
  const resume = resumeJournee({
    rdvAujourdhui,
    vehiculesEngages,
    decisionsEnAttente,
    montantRisque,
    ferme: openState ? !openState.open : false,
  });
  const alerte = resume.ton === "attention";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 md:px-6 md:py-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
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

      {/* La phrase. En gras quand quelque chose attend une décision — c'est le
          seul moment où cet écran doit hausser la voix. */}
      <div
        className="mt-3 text-[14px] leading-snug"
        style={{ color: alerte ? NAVY : "#475569", fontWeight: alerte ? 600 : 400 }}
      >
        {alerte && (
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle"
            style={{ backgroundColor: "#D97706" }}
          />
        )}
        {resume.texte}
      </div>

      {/* Les quatre chiffres, sur une ligne. Cliquables : le compteur qu'on
          lit est celui qu'on veut ouvrir. */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-3">
        <Compteur label="Rendez-vous" valeur={rdvAujourdhui} onClick={setView ? () => setView("agenda") : undefined} />
        <Compteur label="En atelier" valeur={vehiculesEngages} onClick={setView ? () => setView("atelier") : undefined} />
        <Compteur label="Priorités" valeur={decisionsEnAttente} />
        <Compteur label="À risque" valeur={montantRisque} suffixe=" €" />
      </div>
    </div>
  );
}
