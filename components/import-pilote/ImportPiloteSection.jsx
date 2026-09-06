"use client";

// Import pilote — écran de reprise des clients et véhicules.
//
// Le fichier est lu dans le navigateur et n'est jamais téléversé : seules
// les lignes normalisées partent vers `importer_clients_vehicules`. Rien
// n'est écrit tant que l'aperçu n'a pas été confirmé, et l'aperçu est
// produit par la même fonction que l'import, donc fidèle.
//
// L'écran n'est proposé qu'au dirigeant et à l'accueil ; la base refuse de
// toute façon tout autre appelant, mécanicien compris.

import { useMemo, useRef, useState } from "react";
import { Download, FileUp, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ROLE_ACCUEIL, ROLE_DIRIGEANT } from "../acces-salaries/accesConstants";
import {
  CHAMPS,
  MOTIFS_LISIBLES,
  construireModeleCsv,
} from "./importConstants";
import {
  analyserFichier,
  apercuImport,
  champsReconnus,
  confirmerImport,
  construireLignes,
  correspondanceUtilisable,
} from "./import";

const ETAPES = { DEPART: "depart", ASSOCIER: "associer", APERCU: "apercu", FAIT: "fait" };

function libelleMotif(motif) {
  return MOTIFS_LISIBLES[motif] || motif;
}

export default function ImportPiloteSection({ garageId, monRole }) {
  const [etape, setEtape] = useState(ETAPES.DEPART);
  const [nomFichier, setNomFichier] = useState("");
  const [analyse, setAnalyse] = useState(null);
  const [correspondance, setCorrespondance] = useState({});
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const champFichier = useRef(null);

  const autorise = monRole === ROLE_DIRIGEANT || monRole === ROLE_ACCUEIL;

  const lignes = useMemo(() => {
    if (!analyse?.lignes?.length) return [];
    return construireLignes(analyse.lignes, correspondance);
  }, [analyse, correspondance]);

  if (!autorise) return null;

  function reinitialiser() {
    setEtape(ETAPES.DEPART);
    setNomFichier("");
    setAnalyse(null);
    setCorrespondance({});
    setRapport(null);
    setErreur(null);
    if (champFichier.current) champFichier.current.value = "";
  }

  function telechargerModele() {
    const blob = new Blob([construireModeleCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "modele-import-nexora.csv";
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(url);
  }

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    setRapport(null);
    setNomFichier(fichier.name);
    try {
      const texte = await fichier.text();
      const resultat = analyserFichier(texte);
      setAnalyse(resultat);
      setCorrespondance(resultat.correspondance || {});
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        setEtape(ETAPES.DEPART);
      } else {
        setEtape(ETAPES.ASSOCIER);
      }
    } catch (e2) {
      setErreur(e2?.message || "Fichier illisible");
    }
  }

  async function lancerApercu() {
    setEnCours(true);
    setErreur(null);
    try {
      setRapport(await apercuImport(supabase, { garageId, lignes }));
      setEtape(ETAPES.APERCU);
    } catch (e) {
      setErreur(e?.message || "Aperçu impossible");
    } finally {
      setEnCours(false);
    }
  }

  async function lancerImport() {
    setEnCours(true);
    setErreur(null);
    try {
      setRapport(await confirmerImport(supabase, { garageId, lignes }));
      setEtape(ETAPES.FAIT);
    } catch (e) {
      setErreur(e?.message || "Import impossible");
    } finally {
      setEnCours(false);
    }
  }

  const entetes = analyse?.entetes || [];
  const reconnus = champsReconnus(correspondance);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <header className="flex items-start gap-3 mb-5">
        <FileUp className="w-5 h-5 mt-0.5 text-slate-500" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">
            Reprendre vos clients et véhicules
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-prose">
            Depuis un export de votre ancien logiciel. Le fichier reste sur
            votre poste : seules les lignes reconnues sont envoyées, et rien
            n'est enregistré avant votre confirmation.
          </p>
        </div>
        <button
          type="button"
          onClick={telechargerModele}
          className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          Modèle
        </button>
      </header>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {erreur}
        </p>
      )}

      {etape === ETAPES.DEPART && (
        <label className="block border border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:bg-slate-50">
          <input
            ref={champFichier}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={choisirFichier}
            className="sr-only"
          />
          <span className="text-sm font-medium text-slate-700">
            Choisir un fichier CSV
          </span>
          <span className="block text-[12.5px] text-slate-500 mt-1">
            Séparateur point-virgule, virgule ou tabulation. 2 000 lignes au maximum.
          </span>
        </label>
      )}

      {etape !== ETAPES.DEPART && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-slate-700 font-medium">{nomFichier}</span>
          <span className="text-[12.5px] text-slate-500">
            {Math.max((analyse?.lignes?.length || 1) - 1, 0)} lignes de données
          </span>
          <button
            type="button"
            onClick={reinitialiser}
            className="ml-auto inline-flex items-center gap-2 text-[13px] text-slate-600 hover:underline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Changer de fichier
          </button>
        </div>
      )}

      {etape === ETAPES.ASSOCIER && (
        <div>
          <p className="text-sm text-slate-600 mb-3">
            Vérifiez les colonnes reconnues. Celles que nous n'avons pas
            devinées peuvent être associées à la main ; les autres sont
            ignorées.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHAMPS.map((champ) => (
              <label key={champ.cle} className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  {champ.libelle}
                  {champ.requis && <span className="text-red-600"> *</span>}
                </span>
                <select
                  value={correspondance[champ.cle] ?? ""}
                  onChange={(e) =>
                    setCorrespondance((c) => {
                      const suivant = { ...c };
                      if (e.target.value === "") delete suivant[champ.cle];
                      else suivant[champ.cle] = Number(e.target.value);
                      return suivant;
                    })
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Ne pas importer</option>
                  {entetes.map((entete, index) => (
                    <option key={index} value={index}>
                      {entete || `Colonne ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <p className="text-[12.5px] text-slate-500 mt-3">
            {reconnus.length} colonne{reconnus.length > 1 ? "s" : ""} associée
            {reconnus.length > 1 ? "s" : ""}.
            {!correspondanceUtilisable(correspondance) &&
              " Le nom du client est obligatoire pour continuer."}
          </p>

          <button
            type="button"
            disabled={!correspondanceUtilisable(correspondance) || enCours}
            onClick={lancerApercu}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-60"
          >
            {enCours ? "Analyse…" : "Voir ce qui sera importé"}
          </button>
        </div>
      )}

      {(etape === ETAPES.APERCU || etape === ETAPES.FAIT) && rapport && (
        <div>
          <p className="text-sm text-slate-600 mb-3">
            {etape === ETAPES.FAIT
              ? "Import terminé."
              : "Rien n'a encore été enregistré. Voici ce qui le sera."}
          </p>

          <dl className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">Clients {etape === ETAPES.FAIT ? "créés" : "à créer"}</dt>
              <dd className="font-medium tabular-nums">{rapport.clients_crees}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">Véhicules {etape === ETAPES.FAIT ? "créés" : "à créer"}</dt>
              <dd className="font-medium tabular-nums">{rapport.vehicules_crees}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">Clients déjà connus, ignorés</dt>
              <dd className="font-medium tabular-nums">{rapport.clients_ignores_doublon}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">Véhicules déjà connus, ignorés</dt>
              <dd className="font-medium tabular-nums">{rapport.vehicules_ignores_doublon}</dd>
            </div>
          </dl>

          {rapport.lignes_rejetees > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-800">
                {rapport.lignes_rejetees} ligne{rapport.lignes_rejetees > 1 ? "s" : ""} non
                {rapport.lignes_rejetees > 1 ? " reprises" : " reprise"}
              </p>
              <ul className="mt-2 text-[13px] text-slate-600 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {(rapport.rejets || []).map((r) => (
                  <li key={r.ligne} className="py-1.5 flex gap-3">
                    <span className="tabular-nums text-slate-500">Ligne {r.ligne}</span>
                    <span>{libelleMotif(r.motif)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-slate-500 mt-2">
                Un doublon n'est jamais écrasé : les enregistrements déjà
                présents restent tels quels.
              </p>
            </div>
          )}

          {etape === ETAPES.APERCU && (
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={lancerImport}
                disabled={enCours}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-60"
              >
                {enCours ? "Import…" : "Confirmer et importer"}
              </button>
              <button
                type="button"
                onClick={() => setEtape(ETAPES.ASSOCIER)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200"
              >
                Revoir les colonnes
              </button>
            </div>
          )}

          {etape === ETAPES.FAIT && (
            <button
              type="button"
              onClick={reinitialiser}
              className="mt-5 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200"
            >
              Importer un autre fichier
            </button>
          )}
        </div>
      )}
    </section>
  );
}
